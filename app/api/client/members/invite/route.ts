import { type NextRequest } from 'next/server'
import { apiError } from '@/lib/api/response'
import { NextResponse } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { can } from '@/lib/rbac/permissions'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { normalizeInviteEmail, isInvitableRole, computeInviteExpiresAt, buildInviteUrl } from '@/lib/members/invite'
import { generateInviteToken } from '@/lib/members/invite-token'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'

// 企業メンバー招待リンクの発行（client・member.manage=OWNER/ADMIN のみ）。
//   v1: アプリからメールを送らない。招待リンク（#token=）を発行し、OWNER/ADMIN が本人へ手渡し共有する。
//   OWNER が確定するのは email（ログイン ID）＋権限(admin/recruiter/viewer)のみ。owner 招待は不可。
//   company_id は getClientUser 由来で固定（body の company_id は信用しない）。
//   平文 token は「発行直後のこの応答」でのみ返す（no-store）。DB は hash のみ・pending 一覧では返さない。
//   同一 company+email の pending が既にある場合は 409（「リンクを再発行」で明示的に更新させる）。
export async function POST(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'member.manage')) return apiError('FORBIDDEN')

    const body = await request.json().catch(() => null)
    const emailRes = normalizeInviteEmail(body?.email)
    if (!emailRes.ok) return apiError('VALIDATION_ERROR', emailRes.error)
    const email = emailRes.email
    if (!isInvitableRole(body?.company_role)) {
      return apiError('VALIDATION_ERROR', '権限は 管理者 / 採用担当 / 閲覧者 のいずれかを指定してください')
    }
    const companyRole = body.company_role as string

    const svc = createServiceRoleClient()

    // 既存ユーザー/所属チェック（tenant / 1user1company / platform admin 混入防止）。
    // ※ 招待作成は権限付与に直結するため、既存状態を確認できない（DB error / 複数行等）場合は
    //   「安全判定不能＝fail closed」で中止する（invite row を作らない）。
    const { data: prof, error: profError } = await svc.from('profiles').select('id, role').ilike('email', email).maybeSingle()
    if (profError) return apiError('INTERNAL_ERROR', '既存ユーザーの確認に失敗しました')
    if (prof) {
      const p = prof as { id: string; role: string | null }
      if (p.role === 'admin' || p.role === 'super_admin') {
        return apiError('CONFLICT', '運営アカウントは企業メンバーとして招待できません')
      }
      const { data: existingMember, error: memberError } = await svc.from('company_members').select('company_id, status').eq('user_id', p.id).maybeSingle()
      if (memberError) return apiError('INTERNAL_ERROR', '既存メンバーの確認に失敗しました')
      if (existingMember) {
        const em = existingMember as { company_id: string; status: string }
        if (em.company_id === user.companyId && em.status === 'active') {
          return apiError('CONFLICT', 'このメールアドレスは既にメンバーです')
        }
        if (em.company_id !== user.companyId) {
          return apiError('CONFLICT', 'このメールアドレスは別の企業に所属しているため招待できません')
        }
      }
    }

    // 既存 pending は自動再発行しない（明示的な「リンクを再発行」に分離）。確認不能時は fail closed。
    const { data: existingPending, error: pendingError } = await svc.from('member_invites')
      .select('id').eq('company_id', user.companyId).eq('email', email).eq('status', 'pending').maybeSingle()
    if (pendingError) return apiError('INTERNAL_ERROR', '招待状況の確認に失敗しました')
    if (existingPending) {
      return apiError('CONFLICT', 'このメールアドレスは既に招待中です。リンクを再発行してください。')
    }

    const { token, tokenHash } = generateInviteToken()
    const { data: inserted, error: insertError } = await svc.from('member_invites').insert({
      company_id: user.companyId,
      email,
      company_role: companyRole,
      status: 'pending',
      token_hash: tokenHash,
      invited_by: user.userId,
      expires_at: computeInviteExpiresAt(),
    }).select('id, email, company_role, status, expires_at, created_at').maybeSingle()
    if (insertError || !inserted) return apiError('INTERNAL_ERROR', '招待リンクの発行に失敗しました')
    const invite = inserted as { id: string; email: string; company_role: string; status: string; expires_at: string; created_at: string }

    // 操作ログ（best-effort・token/URL/email は入れない）。
    await writeCompanyAuditLog({
      companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
      action: 'member.invite_created', resourceType: 'member_invite', resourceId: invite.id, metadata: { company_role: companyRole },
    })

    // 平文 token は fragment（#token=）で URL に載せる。応答は no-store（CDN/browser に残さない）。
    const inviteUrl = buildInviteUrl(new URL(request.url).origin, token)
    return NextResponse.json({
      invited: true,
      invite: { id: invite.id, email: invite.email, company_role: invite.company_role, status: invite.status, expires_at: invite.expires_at, created_at: invite.created_at },
      inviteUrl,
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

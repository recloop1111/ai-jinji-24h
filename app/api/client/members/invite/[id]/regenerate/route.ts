import { type NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/response'
import { getClientUser } from '@/lib/api/auth'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { computeInviteExpiresAt, buildInviteUrl } from '@/lib/members/invite'
import { generateInviteToken } from '@/lib/members/invite-token'

// 招待リンクの再発行（client・member.manage=OWNER/ADMIN のみ）。
//   旧 pending invite を revoke（履歴保持）し、同じ company_id/email/company_role で新しい token の pending を作る。
//   旧 URL は即無効・新 URL はこの応答で一度だけ返す（no-store）。company_id は session 由来固定。
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'member.manage')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const svc = createServiceRoleClient()

    // 対象 pending を自社スコープで取得（他社 id は返らず NOT_FOUND）。
    const { data: oldRow, error: fetchError } = await svc.from('member_invites')
      .select('id, company_id, email, company_role, status')
      .eq('id', id).eq('company_id', user.companyId).eq('status', 'pending').maybeSingle()
    if (fetchError) return apiError('INTERNAL_ERROR', '招待の取得に失敗しました')
    if (!oldRow) return apiError('NOT_FOUND', '再発行対象の招待が見つかりません')
    const old = oldRow as { id: string; company_id: string; email: string; company_role: string }

    // 旧 invite を revoke（履歴を残す）。
    const nowIso = new Date().toISOString()
    await svc.from('member_invites').update({ status: 'revoked', revoked_at: nowIso, updated_at: nowIso }).eq('id', old.id)

    // 新 invite を作成（新 token）。
    const { token, tokenHash } = generateInviteToken()
    const { data: inserted, error: insertError } = await svc.from('member_invites').insert({
      company_id: old.company_id,
      email: old.email,
      company_role: old.company_role,
      status: 'pending',
      token_hash: tokenHash,
      invited_by: user.userId,
      expires_at: computeInviteExpiresAt(),
    }).select('id, email, company_role, status, expires_at, created_at').maybeSingle()
    if (insertError || !inserted) return apiError('INTERNAL_ERROR', '招待リンクの再発行に失敗しました')
    const invite = inserted as { id: string; email: string; company_role: string; status: string; expires_at: string; created_at: string }

    const inviteUrl = buildInviteUrl(new URL(_request.url).origin, token)
    return NextResponse.json({
      regenerated: true,
      invite: { id: invite.id, email: invite.email, company_role: invite.company_role, status: invite.status, expires_at: invite.expires_at, created_at: invite.created_at },
      inviteUrl,
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

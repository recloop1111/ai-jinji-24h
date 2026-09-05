import { type NextRequest } from 'next/server'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { hashInviteToken } from '@/lib/members/invite-token'
import { isInviteExpired } from '@/lib/members/invite'
import { validateFullName } from '@/lib/members/member-view'
import { isCompanyRole } from '@/lib/rbac/roles'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'

// 招待の受諾（public・token が唯一の資格情報）。本人が氏名＋パスワードを設定してアカウント作成＋メンバー有効化。
//   ※ email は invite 行の値で確定（本人入力の email を受け取らない＝別人が別 email を紐づけできない）。
//   ※ 新規ユーザー経路のみ（既存 email は honest に 409）。auth user 作成後の失敗は cleanup（fake success 無し）。
//   ※ token 平文は log/レスポンスに出さない。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token : ''
    if (!token) return apiError('VALIDATION_ERROR', '招待トークンが不正です')

    const nameRes = validateFullName(body?.full_name)
    if (!nameRes.ok) return apiError('VALIDATION_ERROR', nameRes.error)
    const password = body?.password
    if (typeof password !== 'string' || password.length < 8) {
      return apiError('VALIDATION_ERROR', 'パスワードは8文字以上で設定してください')
    }

    const svc = createServiceRoleClient()
    const { data: inviteRow, error: inviteError } = await svc
      .from('member_invites')
      .select('id, company_id, email, company_role, status, expires_at, invited_by, created_at')
      .eq('token_hash', hashInviteToken(token))
      .maybeSingle()
    if (inviteError) return apiError('INTERNAL_ERROR', '招待の確認に失敗しました')
    if (!inviteRow) return apiError('VALIDATION_ERROR', '招待が見つかりません。リンクをご確認ください。')
    const invite = inviteRow as { id: string; company_id: string; email: string; company_role: string; status: string; expires_at: string; invited_by: string | null; created_at: string }

    if (invite.status !== 'pending') {
      return errorJson('INVITE_INVALID', 'この招待は既に使用済みか無効です。', 409)
    }
    if (isInviteExpired(invite.expires_at)) {
      // security condition は expires_at<=now＝accept 拒否。status 更新は best-effort（失敗しても 410 を維持）。
      try {
        await svc.from('member_invites').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', invite.id).eq('status', 'pending')
      } catch { /* 期限切れ拒否は status 更新結果に依存させない */ }
      return errorJson('INVITE_EXPIRED', '招待リンクの有効期限が切れています。招待者にリンクの再発行を依頼してください。', 410)
    }

    // Step 1: Auth ユーザー作成（email は invite の値で確定）。既存 email は attach 未対応＝honest に 409。
    const { data: authData, error: createError } = await svc.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    })
    if (createError || !authData?.user) {
      if (createError?.message?.includes('already') || createError?.message?.toLowerCase().includes('registered')) {
        return apiError('CONFLICT', 'このメールアドレスは既に登録されています。管理者にお問い合わせください。')
      }
      return apiError('INTERNAL_ERROR', 'アカウントの作成に失敗しました')
    }
    const authUserId = authData.user.id

    // Step 2: profiles（account 種別 = company / tenant anchor）
    const { error: profileError } = await svc.from('profiles').upsert({
      id: authUserId,
      email: invite.email,
      role: 'company',
      company_id: invite.company_id,
      display_name: nameRes.value,
    }, { onConflict: 'id' })
    if (profileError) {
      await svc.auth.admin.deleteUser(authUserId)
      return apiError('INTERNAL_ERROR', 'プロフィールの作成に失敗しました')
    }

    // Step 3: company_members（企業内 RBAC の SoT）。full_name は本人入力を保存。id は audit 用に取得。
    const { data: memberRow, error: memberError } = await svc.from('company_members').insert({
      company_id: invite.company_id,
      user_id: authUserId,
      company_role: invite.company_role,
      status: 'active',
      full_name: nameRes.value,
      invited_by: invite.invited_by,
      invited_at: invite.created_at,
      last_login_at: null,
      joined_at: new Date().toISOString(),
    }).select('id').maybeSingle()
    if (memberError || !memberRow) {
      await svc.from('profiles').delete().eq('id', authUserId)
      await svc.auth.admin.deleteUser(authUserId)
      return apiError('INTERNAL_ERROR', 'メンバーの登録に失敗しました')
    }

    // Step 4: 招待を accepted に確定（one-time 保証）。pending→accepted を conditional 更新し、
    //   実際に 1 件確定できて初めて成功とする。DB error / 0 行（＝並行 accept 等で既に消費）の場合は
    //   今回作成した member/profile/auth user を cleanup し、成功を返さない（fake success 禁止）。
    const nowIso = new Date().toISOString()
    const { data: finalized, error: finalizeError } = await svc.from('member_invites')
      .update({ status: 'accepted', accepted_at: nowIso, updated_at: nowIso })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (finalizeError || !finalized) {
      // 今回生成した resource のみ cleanup（既存は触らない）。cleanup が best-effort でも成功は返さない。
      await svc.from('company_members').delete().eq('user_id', authUserId).eq('company_id', invite.company_id)
      await svc.from('profiles').delete().eq('id', authUserId)
      await svc.auth.admin.deleteUser(authUserId)
      return apiError('CONFLICT', 'この招待は既に使用済みか無効です。')
    }

    // 操作ログ（best-effort・token/password/email は入れない）。actor=新規参加ユーザー・当時 role=付与 role。
    await writeCompanyAuditLog({
      companyId: invite.company_id, actorUserId: authUserId,
      actorCompanyRole: isCompanyRole(invite.company_role) ? invite.company_role : null,
      action: 'member.joined', resourceType: 'member', resourceId: (memberRow as { id: string }).id, metadata: { company_role: invite.company_role },
    })

    return successJson({ accepted: true, email: invite.email }, 201)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

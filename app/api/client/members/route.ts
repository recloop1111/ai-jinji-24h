import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 企業メンバー一覧（client・member.manage 保有者=OWNER/ADMIN のみ）。
//   company_id は getClientUser 由来で固定（query/body の company_id は信用しない）。
//   email は profiles から取得（auth.users は読まない）。token 系は一切返さない。
//   pendingInvites は E-5-3-2 で使う。table 未適用環境では [] を返す（honest・機能未実装）。
export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'member.manage')) return apiError('FORBIDDEN')

    const svc = createServiceRoleClient()

    // 自社メンバー（company_id 固定・tenant isolation）
    const { data: memberRows, error: memberError } = await svc
      .from('company_members')
      .select('id, user_id, company_role, status, full_name, joined_at, invited_at, last_login_at')
      .eq('company_id', user.companyId)
    if (memberError) return apiError('INTERNAL_ERROR', 'メンバーの取得に失敗しました')
    const rows = (memberRows ?? []) as Array<{
      id: string; user_id: string; company_role: string; status: string
      full_name: string | null; joined_at: string | null; invited_at: string | null; last_login_at: string | null
    }>

    // email は自社メンバーの user_id 集合に限定して profiles から解決（他社は取得しない）。
    const userIds = rows.map((r) => r.user_id)
    const emailByUser = new Map<string, string | null>()
    if (userIds.length > 0) {
      const { data: profs, error: profError } = await svc
        .from('profiles')
        .select('id, email')
        .in('id', userIds)
      if (profError) return apiError('INTERNAL_ERROR', 'メンバー情報の取得に失敗しました')
      for (const p of (profs ?? []) as Array<{ id: string; email: string | null }>) emailByUser.set(p.id, p.email ?? null)
    }

    const members = rows
      .map((r) => ({
        id: r.id,
        full_name: r.full_name,
        email: emailByUser.get(r.user_id) ?? null,
        company_role: r.company_role,
        status: r.status,
        joined_at: r.joined_at,
        invited_at: r.invited_at,
        last_login_at: r.last_login_at,
        is_self: r.user_id === user.userId,
      }))
      // owner を先頭、その後 joined_at 昇順（未設定は末尾）
      .sort((a, b) => {
        if (a.company_role === 'owner' && b.company_role !== 'owner') return -1
        if (b.company_role === 'owner' && a.company_role !== 'owner') return 1
        return (a.joined_at ?? '9999').localeCompare(b.joined_at ?? '9999')
      })

    // pending 招待（E-5-3-2 用）。table 未適用/未実装環境では空配列で honest に返す。招待 token 系は返さない。
    let pendingInvites: Array<{ id: string; email: string; company_role: string; status: string; expires_at: string | null; created_at: string | null }> = []
    try {
      const { data: inv, error: invError } = await svc
        .from('member_invites')
        .select('id, email, company_role, status, expires_at, created_at')
        .eq('company_id', user.companyId)
        .eq('status', 'pending')
      if (!invError && inv) pendingInvites = inv as typeof pendingInvites
    } catch {
      pendingInvites = []
    }

    return successJson({ members, pendingInvites })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

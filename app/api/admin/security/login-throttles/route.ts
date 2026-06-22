import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// 現在ブロック中の account 一覧（運営画面用）。auth_throttle_list_blocked_accounts（SECURITY DEFINER）経由。
// scope_key は不可逆ハッシュ。本人特定は auth_user_id → profiles を service_role で解決して email/氏名を付与。
export async function GET() {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const service = createServiceRoleClient()
    const { data, error } = await service.rpc('auth_throttle_list_blocked_accounts', { p_portal: null })
    if (error) return apiError('INTERNAL_ERROR', 'ブロック中アカウントの取得に失敗しました')

    const rows: Array<{
      portal_type: string
      scope_key: string
      auth_user_id: string | null
      failure_count: number
      blocked_until: string | null
      last_attempt_at: string | null
    }> = Array.isArray(data) ? data : []

    const ids = [...new Set(rows.map((r) => r.auth_user_id).filter((v): v is string => !!v))]
    const profMap = new Map<string, { email: string | null; name: string | null }>()
    if (ids.length > 0) {
      const { data: profs } = await service
        .from('profiles')
        .select('id, email, display_name')
        .in('id', ids)
      for (const p of profs ?? []) {
        profMap.set(p.id, { email: p.email, name: p.display_name })
      }
    }

    const blocked = rows.map((r) => ({
      portal_type: r.portal_type,
      scope_key: r.scope_key,
      failure_count: r.failure_count,
      blocked_until: r.blocked_until,
      last_attempt_at: r.last_attempt_at,
      user_email: r.auth_user_id ? (profMap.get(r.auth_user_id)?.email ?? null) : null,
      user_name: r.auth_user_id ? (profMap.get(r.auth_user_id)?.name ?? null) : null,
    }))

    const res = successJson({ blocked })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

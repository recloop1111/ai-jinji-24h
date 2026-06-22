import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    // service-role 境界（RLS bypass）。ip_blocks の table 権限 hardening（別 migration）に備える。
    const supabase = createServiceRoleClient()

    const { data: blockedIps, error } = await supabase
      .from('ip_blocks')
      .select('id, ip_address, reason, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      return apiError('INTERNAL_ERROR', 'IPブロック一覧の取得に失敗しました')
    }

    const items = (blockedIps ?? []).map((b) => ({
      id: b.id,
      ip_address: b.ip_address,
      reason: b.reason,
      blocked_at: b.created_at,
    }))

    return successJson({ blocked_ips: items })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

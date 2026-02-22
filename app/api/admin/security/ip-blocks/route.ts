import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const supabase = await createClient()

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

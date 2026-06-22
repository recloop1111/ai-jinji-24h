import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// 運営による account スロットルの手動解除。auth_throttle_admin_unlock（SECURITY DEFINER）経由。
// 解除者 = 現在の運営ユーザー（getAdminUser）。account scope のみ・IP は対象外（DB関数側で保証）。
export async function POST(request: NextRequest) {
  try {
    const { data: admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const portal = body?.portal_type
    const scopeKey = body?.scope_key
    if (portal !== 'admin' && portal !== 'client') {
      return apiError('VALIDATION_ERROR', 'portal_type が不正です')
    }
    if (typeof scopeKey !== 'string' || !/^[0-9a-f]{64}$/.test(scopeKey)) {
      return apiError('VALIDATION_ERROR', 'scope_key が不正です')
    }

    const service = createServiceRoleClient()
    const { data, error } = await service.rpc('auth_throttle_admin_unlock', {
      p_portal: portal,
      p_account_scope_key: scopeKey,
      p_admin_id: admin.userId,
    })
    if (error) return apiError('INTERNAL_ERROR', 'ロック解除に失敗しました')

    const res = successJson({ unlocked: data === true })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

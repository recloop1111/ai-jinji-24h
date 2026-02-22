import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

const MAX_PER_PAGE = 100

export async function GET(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10) || 20))
    const offset = (page - 1) * perPage

    const supabase = await createClient()

    const { data: alerts, count, error } = await supabase
      .from('security_alerts')
      .select('id, type, ip_address, details, resolved, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1)

    if (error) {
      return apiError('INTERNAL_ERROR', 'セキュリティアラートの取得に失敗しました')
    }

    return successJson({
      alerts: alerts ?? [],
      total_count: count ?? 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

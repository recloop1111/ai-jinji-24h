import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID, isValidDate, sanitizeSearchQuery } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

const MAX_PER_PAGE = 100

export async function GET(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10) || 20))
    const companyId = searchParams.get('company_id') ?? ''
    const search = searchParams.get('search') ?? ''
    const dateFrom = searchParams.get('date_from') ?? ''
    const dateTo = searchParams.get('date_to') ?? ''
    const offset = (page - 1) * perPage

    // バリデーション
    if (companyId && !isValidUUID(companyId)) {
      return apiError('VALIDATION_ERROR', 'company_id の形式が不正です')
    }
    if (dateFrom && !isValidDate(dateFrom)) {
      return apiError('VALIDATION_ERROR', 'date_from の形式が不正です（YYYY-MM-DD）')
    }
    if (dateTo && !isValidDate(dateTo)) {
      return apiError('VALIDATION_ERROR', 'date_to の形式が不正です（YYYY-MM-DD）')
    }

    const supabase = await createClient()

    let query = supabase
      .from('applicants')
      .select('id, company_id, last_name, first_name, rank, created_at, companies ( name )', { count: 'exact' })

    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    if (search) {
      const s = sanitizeSearchQuery(search)
      if (s) {
        query = query.or(`last_name.ilike.%${s}%,first_name.ilike.%${s}%`)
      }
    }
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00Z`)
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59Z`)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1)

    const { data: applicants, count, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', '応募者データの取得に失敗しました')
    }

    const items = (applicants ?? []).map((a) => ({
      id: a.id,
      company_name: (a.companies as unknown as { name: string } | null)?.name ?? '',
      last_name: a.last_name,
      first_name: a.first_name,
      rank: a.rank,
      created_at: a.created_at,
    }))

    return successJson({
      applicants: items,
      total_count: count ?? 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { sanitizeSearchQuery, isValidUUID, isValidDate, isValidRank } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'
import { scoreToGrade } from '@/lib/utils/scoreToGrade'

const VALID_SORT_COLUMNS = ['created_at', 'total_score_100', 'last_name'] as const
const VALID_ORDERS = ['asc', 'desc'] as const
const VALID_STATUSES = ['all', 'pending', 'second_interview', 'rejected'] as const
const MAX_PER_PAGE = 100

export async function GET(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl

    // クエリパラメータ解析
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10) || 20))
    const status = searchParams.get('status') ?? 'all'
    const searchRaw = searchParams.get('search')?.trim() ?? ''
    const search = sanitizeSearchQuery(searchRaw)
    const dateFrom = searchParams.get('date_from') ?? ''
    const dateTo = searchParams.get('date_to') ?? ''
    const jobTypeId = searchParams.get('job_type_id') ?? ''
    const rank = searchParams.get('rank') ?? ''
    const sortParam = searchParams.get('sort') ?? 'created_at'
    const orderParam = searchParams.get('order') ?? 'desc'

    // バリデーション
    const sort = VALID_SORT_COLUMNS.includes(sortParam as typeof VALID_SORT_COLUMNS[number])
      ? sortParam : 'created_at'
    const order = VALID_ORDERS.includes(orderParam as typeof VALID_ORDERS[number])
      ? orderParam : 'desc'
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return apiError('VALIDATION_ERROR', 'statusの値が不正です')
    }
    if (dateFrom && !isValidDate(dateFrom)) {
      return apiError('VALIDATION_ERROR', 'date_from の形式が不正です（YYYY-MM-DD）')
    }
    if (dateTo && !isValidDate(dateTo)) {
      return apiError('VALIDATION_ERROR', 'date_to の形式が不正です（YYYY-MM-DD）')
    }
    if (jobTypeId && !isValidUUID(jobTypeId)) {
      return apiError('VALIDATION_ERROR', 'job_type_id の形式が不正です')
    }
    if (rank && !isValidRank(rank)) {
      return apiError('VALIDATION_ERROR', 'rank の値が不正です（A〜E）')
    }

    const supabase = await createClient()
    const offset = (page - 1) * perPage

    // ベースクエリ: applicants + job_types(name) + interviews > reports(score, summary)
    let query = supabase
      .from('applicants')
      .select(`
        id, last_name, first_name, selection_status, duplicate_flag, inappropriate_flag, created_at,
        job_types ( name ),
        interviews ( reports ( status, rank, total_score_100, summary_points ) )
      `, { count: 'exact' })
      .eq('company_id', user.companyId)

    // フィルタ: selection_status
    if (status !== 'all') {
      query = query.eq('selection_status', status)
    }

    // フィルタ: 氏名キーワード検索（サニタイズ済み）
    if (search) {
      query = query.or(`last_name.ilike.%${search}%,first_name.ilike.%${search}%`)
    }

    // フィルタ: 日付範囲
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00Z`)
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59Z`)
    }

    // フィルタ: 職種
    if (jobTypeId) {
      query = query.eq('job_type_id', jobTypeId)
    }

    // ソート & ページネーション
    query = query
      .order(sort, { ascending: order === 'asc' })
      .range(offset, offset + perPage - 1)

    const { data: applicants, count, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', 'データの取得に失敗しました')
    }

    // レスポンス整形
    const items = (applicants ?? []).map((a: Record<string, unknown>) => {
      // interviews は配列、最初の interview の reports を取得
      const interviews = a.interviews as Array<{ reports: Array<{ status: string; rank: string | null; total_score_100: number | null; summary_points: string | null }> }> | null
      const report = interviews?.[0]?.reports?.[0] ?? null

      const totalScore = report?.total_score_100 ?? null
      const computedRank = totalScore !== null ? scoreToGrade(totalScore) : (report?.rank ?? null)

      // rank フィルタ（DB側でフィルタできないため後処理）
      return {
        id: a.id,
        last_name: a.last_name,
        first_name: a.first_name,
        job_type_name: (a.job_types as { name: string } | null)?.name ?? null,
        selection_status: a.selection_status,
        rank: computedRank,
        total_score_100: totalScore,
        summary_points: report?.summary_points ?? null,
        report_status: report?.status ?? null,
        duplicate_flag: a.duplicate_flag,
        inappropriate_flag: a.inappropriate_flag,
        created_at: a.created_at,
      }
    })

    // rank フィルタ（後処理）
    const filtered = rank
      ? items.filter(item => item.rank === rank)
      : items

    return successJson({
      applicants: filtered,
      total_count: rank ? filtered.length : (count ?? 0),
      page,
      per_page: perPage,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

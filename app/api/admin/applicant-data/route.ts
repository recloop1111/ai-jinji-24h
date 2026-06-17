import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID, isValidDate, sanitizeSearchQuery } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'

const MAX_PER_PAGE = 100

type CompanyRow = { id: string; name: string }
type ApplicantRow = {
  id: string
  company_id: string
  last_name: string | null
  first_name: string | null
  email: string | null
  phone_number: string | null
  status: string | null
  selection_status: string | null
  created_at: string
}
type ResultRow = {
  applicant_id: string
  total_score: number | null
  detail_json: { recommendation_rank?: string | null } | null
  culture_fit_score: number | null
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
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

    // service role で RLS をバイパス（管理画面は全企業横断で取得）
    const supabase = createServiceRoleClient()

    // 企業一覧（フィルター用 + 企業名マップ）
    const { data: companiesData } = await supabase.from('companies').select('id, name')
    const companies = (companiesData ?? []) as CompanyRow[]
    const companiesMap: Record<string, string> = {}
    companies.forEach((c) => {
      companiesMap[c.id] = c.name
    })

    // 応募者
    let query = supabase
      .from('applicants')
      .select(
        'id, company_id, last_name, first_name, email, phone_number, status, selection_status, created_at',
        { count: 'exact' },
      )

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

    query = query.order('created_at', { ascending: false }).range(offset, offset + perPage - 1)

    const { data: applicantsData, count, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', '応募者データの取得に失敗しました')
    }

    const applicants = (applicantsData ?? []) as ApplicantRow[]

    // 評価結果（スコア・推薦度・カルチャーフィット）
    const { data: resultsData } = await supabase
      .from('interview_results')
      .select('applicant_id, total_score, detail_json, culture_fit_score')
    const resultsMap: Record<string, ResultRow> = {}
    ;((resultsData ?? []) as ResultRow[]).forEach((r) => {
      resultsMap[r.applicant_id] = r
    })

    // 各 applicant の「最新 interview.status」（面接中/途中離脱/完了 の導出用。DBには保存しない）。
    // created_at 降順で取得し applicant_id ごとに最初（=最新）を採用。古い in_progress 孤児行に引っ張られない。
    const latestInterviewStatus: Record<string, string> = {}
    const { data: ipData } = await supabase
      .from('interviews')
      .select('applicant_id, status, created_at')
      .order('created_at', { ascending: false })
    ;((ipData ?? []) as { applicant_id: string; status: string | null }[]).forEach((iv) => {
      if (iv.applicant_id && !(iv.applicant_id in latestInterviewStatus)) {
        latestInterviewStatus[iv.applicant_id] = iv.status ?? ''
      }
    })

    const items = applicants.map((a) => {
      const ir = resultsMap[a.id] ?? null
      return {
        id: a.id,
        name: `${a.last_name || ''} ${a.first_name || ''}`.trim() || '名前不明',
        email: a.email || '',
        phone: a.phone_number || '',
        company_id: a.company_id,
        company_name: companiesMap[a.company_id] || '不明',
        status: a.status || '準備中',
        latest_interview_status: latestInterviewStatus[a.id] ?? null,
        selection_status: a.selection_status || 'pending',
        created_at: a.created_at,
        interview_scheduled_at: null,
        total_score: ir?.total_score ?? null,
        recommendation_rank: ir?.detail_json?.recommendation_rank ?? null,
        culture_fit_score: ir?.culture_fit_score ?? null,
      }
    })

    return successJson({
      applicants: items,
      companies,
      total_count: count ?? 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

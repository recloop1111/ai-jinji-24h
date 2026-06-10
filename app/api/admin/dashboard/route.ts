import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

type CompanyRow = { id: string; name: string; is_suspended: boolean; is_active: boolean | null }
type ApplicantRow = {
  id: string
  company_id: string
  last_name: string | null
  first_name: string | null
  email: string | null
  phone_number: string | null
  status: string | null
  created_at: string
}
type ResultRow = { applicant_id: string; total_score: number | null }

export async function GET() {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    // service role で RLS をバイパス（/api/admin/companies と同じ取得方式に統一）
    const supabase = createServiceRoleClient()

    // 企業: 契約企業数 / アクティブ / 停止中
    const { data: companiesData } = await supabase
      .from('companies')
      .select('id, name, is_suspended, is_active')
    const companies = (companiesData ?? []) as CompanyRow[]
    const companiesTotal = companies.length
    const active = companies.filter((c) => !c.is_suspended && c.is_active !== false).length
    const suspended = companies.filter((c) => c.is_suspended).length

    const companiesMap: Record<string, string> = {}
    companies.forEach((c) => {
      companiesMap[c.id] = c.name
    })

    // 求人数: jobs テーブル（存在しない場合は count=null → 0）
    const { count: jobsCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })

    // 応募者
    const { data: applicantsData } = await supabase
      .from('applicants')
      .select('id, company_id, last_name, first_name, email, phone_number, status, created_at')
      .order('created_at', { ascending: false })
    const applicants = (applicantsData ?? []) as ApplicantRow[]
    const totalApplicants = applicants.length
    const completedInterviews = applicants.filter((a) => a.status === '完了').length
    const waitingInterviews = applicants.filter((a) => a.status === '準備中').length
    const withdrawnCount = applicants.filter((a) => a.status === '途中離脱').length
    const withdrawnPercent =
      totalApplicants > 0 ? ((withdrawnCount / totalApplicants) * 100).toFixed(1) : '0'

    // スコア: interview_results.total_score
    const { data: resultsData } = await supabase
      .from('interview_results')
      .select('applicant_id, total_score')
    const resultsMap: Record<string, number | null> = {}
    ;((resultsData ?? []) as ResultRow[]).forEach((r) => {
      resultsMap[r.applicant_id] = r.total_score
    })

    const completedScores = applicants
      .filter((a) => a.status === '完了' && resultsMap[a.id] != null)
      .map((a) => resultsMap[a.id] as number)
    const avgScore =
      completedScores.length > 0
        ? (completedScores.reduce((sum, s) => sum + s, 0) / completedScores.length).toFixed(1)
        : '—'

    const recentApplicants = applicants.slice(0, 10).map((a) => ({
      id: a.id,
      name: `${a.last_name || ''} ${a.first_name || ''}`.trim() || '名前不明',
      email: a.email || '',
      phone: a.phone_number || '',
      company_name: companiesMap[a.company_id] || '不明',
      status: a.status || '準備中',
      total_score: resultsMap[a.id] ?? null,
      created_at: a.created_at,
    }))

    return successJson({
      stats: {
        companies: companiesTotal,
        active,
        suspended,
        totalJobs: jobsCount ?? 0,
        totalApplicants,
        completedInterviews,
        waitingInterviews,
        avgScore,
        withdrawnCount,
        withdrawnPercent,
      },
      recentApplicants,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

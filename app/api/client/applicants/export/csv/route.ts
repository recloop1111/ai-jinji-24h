import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { sanitizeSearchQuery, isValidDate, isValidUUID, isValidRank } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'
import { scoreToGrade } from '@/lib/utils/scoreToGrade'

const STATUS_LABELS: Record<string, string> = {
  pending: '未対応',
  second_interview: '二次選考',
  rejected: '不採用',
}

export async function GET(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    // プラン確認（CSV出力はスタンダード以上）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('plan')
      .eq('id', user.companyId)
      .single()

    if (compError || !company) {
      return apiError('INTERNAL_ERROR', '企業情報の取得に失敗しました')
    }

    if (company.plan === 'light') {
      return apiError('FORBIDDEN', 'CSV出力はスタンダードプラン以上でご利用いただけます')
    }

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') ?? 'all'
    const searchRaw = searchParams.get('search')?.trim() ?? ''
    const search = sanitizeSearchQuery(searchRaw)
    const dateFrom = searchParams.get('date_from') ?? ''
    const dateTo = searchParams.get('date_to') ?? ''
    const jobTypeId = searchParams.get('job_type_id') ?? ''
    const rank = searchParams.get('rank') ?? ''

    // バリデーション
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

    // 応募者取得
    let query = supabase
      .from('applicants')
      .select(`
        last_name, first_name, email, phone_number, selection_status, created_at,
        job_types ( name ),
        interviews ( reports ( total_score_100, rank ) )
      `)
      .eq('company_id', user.companyId)

    if (status !== 'all') {
      query = query.eq('selection_status', status)
    }
    if (search) {
      query = query.or(`last_name.ilike.%${search}%,first_name.ilike.%${search}%`)
    }
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00Z`)
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59Z`)
    }
    if (jobTypeId) {
      query = query.eq('job_type_id', jobTypeId)
    }

    query = query.order('created_at', { ascending: false })

    const { data: applicants, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', 'データの取得に失敗しました')
    }

    // CSV生成
    const BOM = '\uFEFF'
    const header = '氏名,メールアドレス,電話番号,希望職種,総合評価,ステータス,面接日'

    const rows = (applicants ?? [])
      .map((a: Record<string, unknown>) => {
        const interviews = a.interviews as Array<{ reports: Array<{ total_score_100: number | null; rank: string | null }> }> | null
        const report = interviews?.[0]?.reports?.[0] ?? null
        const totalScore = report?.total_score_100 ?? null
        const computedRank = totalScore !== null ? scoreToGrade(totalScore) : (report?.rank ?? '')

        // rank フィルタ
        if (rank && computedRank !== rank) return null

        const jobName = (a.job_types as unknown as { name: string } | null)?.name ?? ''
        const statusLabel = STATUS_LABELS[a.selection_status as string] ?? String(a.selection_status)
        const date = a.created_at ? (a.created_at as string).slice(0, 10) : ''

        return [
          `${a.last_name} ${a.first_name}`,
          a.email,
          a.phone_number,
          jobName,
          computedRank,
          statusLabel,
          date,
        ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
      })
      .filter(Boolean)

    const csv = BOM + header + '\n' + rows.join('\n')
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="applicants_${today}.csv"`,
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

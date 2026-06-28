import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id') ?? ''
    const period = searchParams.get('period') ?? ''

    if (companyId && !isValidUUID(companyId)) {
      return apiError('VALIDATION_ERROR', 'company_id の形式が不正です')
    }
    if (period && !/^\d{4}-\d{2}$/.test(period)) {
      return apiError('VALIDATION_ERROR', 'period の形式が不正です（YYYY-MM）')
    }

    // 満足度の実データは applicants.satisfaction_rating（satisfaction_ratings テーブルは書き込み元が無いため使わない）
    // 運営は全企業横断で集計するため service role（RLS非依存）
    const supabase = createServiceRoleClient()

    let query = supabase
      .from('applicants')
      .select('id, company_id, satisfaction_rating, created_at')
      .not('satisfaction_rating', 'is', null)

    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    if (period) {
      const [year, month] = period.split('-').map(Number)
      const start = new Date(year, month - 1, 1).toISOString()
      const end = new Date(year, month, 0, 23, 59, 59).toISOString()
      query = query.gte('created_at', start).lte('created_at', end)
    }

    const { data: rows, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', '満足度データの取得に失敗しました')
    }

    // 既存レスポンス互換のため、downstream の集計が参照する rating キーへ正規化
    const allRatings = (rows ?? []).map((r: { company_id: string; satisfaction_rating: number | null; created_at: string }) => ({
      company_id: r.company_id,
      rating: r.satisfaction_rating ?? 0,
      created_at: r.created_at,
    }))

    // overall_average, total_responses
    const totalResponses = allRatings.length
    const overallAverage = totalResponses > 0
      ? Math.round((allRatings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / totalResponses) * 10) / 10
      : 0

    // by_company 集計
    const companyMap: Record<string, { ratings: number[]; companyId: string }> = {}
    for (const r of allRatings) {
      if (!companyMap[r.company_id]) {
        companyMap[r.company_id] = { ratings: [], companyId: r.company_id }
      }
      companyMap[r.company_id].ratings.push(r.rating ?? 0)
    }

    // 企業名を一括取得
    const companyIds = Object.keys(companyMap)
    let companyNames: Record<string, string> = {}
    if (companyIds.length > 0) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds)
      companyNames = (companies ?? []).reduce((acc: Record<string, string>, c: { id: string; name: string }) => {
        acc[c.id] = c.name
        return acc
      }, {})
    }

    const byCompany = Object.values(companyMap).map((entry) => {
      const avg = Math.round((entry.ratings.reduce((s, v) => s + v, 0) / entry.ratings.length) * 10) / 10
      const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
      for (const v of entry.ratings) {
        const key = String(Math.min(5, Math.max(1, Math.round(v))))
        distribution[key] = (distribution[key] ?? 0) + 1
      }
      return {
        company_id: entry.companyId,
        company_name: companyNames[entry.companyId] ?? '',
        average: avg,
        count: entry.ratings.length,
        distribution,
      }
    })

    // by_month 集計
    const monthMap: Record<string, number[]> = {}
    for (const r of allRatings) {
      const month = r.created_at?.slice(0, 7) ?? 'unknown'
      if (!monthMap[month]) monthMap[month] = []
      monthMap[month].push(r.rating ?? 0)
    }

    const byMonth = Object.entries(monthMap)
      .map(([month, vals]) => ({
        month,
        average: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10,
        count: vals.length,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))

    return successJson({
      overall_average: overallAverage,
      total_responses: totalResponses,
      by_company: byCompany,
      by_month: byMonth,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

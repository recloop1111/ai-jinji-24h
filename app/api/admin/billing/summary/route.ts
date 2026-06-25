import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { jstCurrentMonthStartIso, jstFirstOfNextMonthDate } from '@/lib/companies/applyNextMonthLimit'
import { PRICE_PER_INTERVIEW } from '@/types/database'

// 当月見込み + 請求サマリーを返す（service role / RLS非依存）
export async function GET() {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const supabase = createServiceRoleClient()

    // 月境界・期間は JST 基準（start / client plan / admin limit と統一）。
    // UTC サーバ（Vercel）でも JST 月初の最初の9時間で当月/期間がズレない。
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const jY = jstNow.getUTCFullYear()
    const jM = jstNow.getUTCMonth() // 0-indexed（JST当月）
    const monthStartIso = jstCurrentMonthStartIso()
    const currentPeriod = `${jY}-${String(jM + 1).padStart(2, '0')}`
    const currentYear = String(jY)
    // 過去12ヶ月（古い順）の period 一覧（JST基準）
    const periods: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(jY, jM - i, 1))
      periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    }
    const oldestPeriod = periods[0]
    // 翌月1日（次回請求日・JST基準）
    const nextBillingDate = jstFirstOfNextMonthDate()

    // 企業一覧
    const { data: companies, error: compError } = await supabase
      .from('companies')
      .select('id, name, industry, plan, price_per_interview, monthly_interview_limit')
      .order('created_at', { ascending: false })

    if (compError) {
      return apiError('INTERNAL_ERROR', '企業情報の取得に失敗しました')
    }

    const companyList = companies ?? []
    const companyIds = companyList.map((c: { id: string }) => c.id)

    // 当月の billable 面接数（企業ごと）
    let monthlyCounts: Record<string, number> = {}
    if (companyIds.length > 0) {
      const { data: interviewData } = await supabase
        .from('interviews')
        .select('company_id')
        .in('company_id', companyIds)
        .eq('is_billable', true)
        .gte('created_at', monthStartIso)

      monthlyCounts = (interviewData ?? []).reduce(
        (acc: Record<string, number>, row: { company_id: string }) => {
          acc[row.company_id] = (acc[row.company_id] ?? 0) + 1
          return acc
        },
        {},
      )
    }

    // 過去12ヶ月の確定請求（月次グラフ・年間累計・未入金・当月ステータス算出に使用）。
    // 実DBは billing_records（invoices テーブルは存在しない）。downstream 互換のため
    // { company_id, period(YYYY-MM), amount(amount_jpy/税抜), status } へ正規化する。
    const { data: recordData } = await supabase
      .from('billing_records')
      .select('company_id, billing_month, amount_jpy, payment_status')
      .gte('billing_month', `${oldestPeriod}-01`)

    // payment_status を既存ロジックが期待する paid/billed/overdue へ保守的に正規化。
    // 値集合は未確認かつ billing_records は現状0件。writer（Stripe請求バッチ）実装時に要再確認。
    const normalizeStatus = (s: string | null): string => {
      if (s === 'paid') return 'paid'
      if (s === 'overdue') return 'overdue'
      return 'billed' // billed/unpaid/pending/open/null/その他 → 発行済み未入金相当
    }
    const invoices = (recordData ?? []).map((r: {
      company_id: string
      billing_month: string | null
      amount_jpy: number | null
      payment_status: string | null
    }) => ({
      company_id: r.company_id,
      period: r.billing_month ? String(r.billing_month).slice(0, 7) : '',
      amount: typeof r.amount_jpy === 'number' ? r.amount_jpy : 0,
      status: normalizeStatus(r.payment_status),
    }))

    // 当月 period の請求ステータス（company_id -> status）
    const currentStatusByCompany: Record<string, string> = {}
    for (const inv of invoices) {
      if (inv.period === currentPeriod && inv.company_id) {
        currentStatusByCompany[inv.company_id] = inv.status
      }
    }

    // 企業別 行データ（当月見込みはリアルタイム計算）
    let monthlyRevenue = 0
    let unbilledAmount = 0
    let unbilledCount = 0

    const rows = companyList.map((c: {
      id: string
      name: string | null
      industry: string | null
      plan: string | null
      price_per_interview: number | null
      monthly_interview_limit: number | null
    }) => {
      const price = c.price_per_interview ?? PRICE_PER_INTERVIEW
      const used = monthlyCounts[c.id] ?? 0
      const currentAmount = used * price
      const status = currentStatusByCompany[c.id] ?? 'unbilled'

      monthlyRevenue += currentAmount
      if (status === 'unbilled' && used > 0) {
        unbilledAmount += currentAmount
        unbilledCount += 1
      }

      return {
        company_id: c.id,
        name: c.name ?? '',
        industry: c.industry || '未設定',
        plan: c.plan || 'pay_per_use',
        price_per_interview: price,
        interviews_used: used,
        monthly_interview_limit: c.monthly_interview_limit ?? 0,
        current_amount: currentAmount,
        status,
        next_billing_date: nextBillingDate,
      }
    })

    // invoices 依存の集計（実データが無ければ 0 のまま）
    let unpaidAmount = 0
    let yearlyRevenue = 0
    const unpaidCompanies = new Set<string>()
    const overdueCompanies = new Set<string>()
    // 月次売上（万円単位 / 古い順）
    const salesByPeriod: Record<string, number> = {}

    for (const inv of invoices) {
      const amount = typeof inv.amount === 'number' ? inv.amount : 0
      const issued = inv.status === 'paid' || inv.status === 'billed' || inv.status === 'overdue'

      if (issued) {
        salesByPeriod[inv.period] = (salesByPeriod[inv.period] ?? 0) + amount
      }
      if (inv.status === 'billed' || inv.status === 'overdue') {
        unpaidAmount += amount
        if (inv.company_id) unpaidCompanies.add(inv.company_id)
      }
      if (inv.status === 'overdue' && inv.company_id) {
        overdueCompanies.add(inv.company_id)
      }
      if (issued && inv.period.startsWith(currentYear)) {
        yearlyRevenue += amount
      }
    }

    const monthlySales = periods.map((p) => Math.round((salesByPeriod[p] ?? 0) / 10000))

    const yearlyTarget = 0
    const achievementRate = yearlyTarget > 0 ? Math.round((yearlyRevenue / yearlyTarget) * 100) : 0

    return successJson({
      rows,
      summary: {
        monthly_revenue: monthlyRevenue,
        unbilled_amount: unbilledAmount,
        unbilled_count: unbilledCount,
        unpaid_amount: unpaidAmount,
        unpaid_count: unpaidCompanies.size,
        overdue_count: overdueCompanies.size,
        yearly_revenue: yearlyRevenue,
        yearly_target: yearlyTarget,
        achievement_rate: achievementRate,
      },
      monthly_sales: monthlySales,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

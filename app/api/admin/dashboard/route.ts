import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const supabase = await createClient()
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // 本日の面接数
    const { count: todayInterviews } = await supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart)

    // 当月の面接数
    const { count: monthlyInterviews } = await supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart)

    // アクティブ企業数
    const { count: activeCompanies } = await supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('is_suspended', false)

    // 当月の見込み収益（billable面接 × 単価の概算は invoices から集計）
    const { data: revenueData } = await supabase
      .from('invoices')
      .select('amount')
      .gte('period', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)

    const estimatedRevenue = (revenueData ?? []).reduce(
      (sum: number, inv: { amount: number | null }) => sum + (inv.amount ?? 0), 0
    )

    // 未解決セキュリティアラート数
    const { count: unresolvedAlerts } = await supabase
      .from('security_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('resolved', false)

    // 失敗レポート数
    const { count: failedReports } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')

    // 失敗録画数
    const { count: failedRecordings } = await supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('recording_status', 'failed')

    return successJson({
      today_interviews: todayInterviews ?? 0,
      monthly_interviews: monthlyInterviews ?? 0,
      active_companies: activeCompanies ?? 0,
      estimated_revenue: estimatedRevenue,
      unresolved_alerts: unresolvedAlerts ?? 0,
      failed_reports: failedReports ?? 0,
      failed_recordings: failedRecordings ?? 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

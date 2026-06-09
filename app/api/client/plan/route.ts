import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'
import { PRICE_PER_INTERVIEW } from '@/types/database'

export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    // 企業のプラン情報を取得
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('plan, monthly_interview_limit')
      .eq('id', user.companyId)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    // 当月の面接件数（billable のみ）
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const { count: monthlyCount } = await supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.companyId)
      .eq('billable', true)
      .gte('created_at', monthStart)

    const used = monthlyCount ?? 0
    const limit = company.monthly_interview_limit ?? 10
    const remaining = Math.max(0, limit - used)

    // 次月1日をリセット日として算出
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextResetDate = `${nextReset.getFullYear()}-${String(nextReset.getMonth() + 1).padStart(2, '0')}-${String(nextReset.getDate()).padStart(2, '0')}`

    return successJson({
      plan: company.plan,
      monthly_interview_limit: limit,
      monthly_count: used,
      remaining,
      price_per_interview: PRICE_PER_INTERVIEW,
      current_charge: used * PRICE_PER_INTERVIEW,
      max_charge: limit * PRICE_PER_INTERVIEW,
      next_reset_date: nextResetDate,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

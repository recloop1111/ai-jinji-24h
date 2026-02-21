import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    // 企業のプラン情報を取得
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('plan, plan_limit, auto_upgrade, stripe_subscription_id, billing_cycle_start, billing_cycle_end')
      .eq('id', user.companyId)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    // 当月の面接件数（billable のみ）
    const startDate = company.billing_cycle_start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

    const { count: monthlyCount } = await supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('billable', true)
      .in('applicant_id',
        (await supabase
          .from('applicants')
          .select('id')
          .eq('company_id', user.companyId)
        ).data?.map((a: { id: string }) => a.id) ?? []
      )
      .gte('created_at', `${startDate}T00:00:00Z`)

    return successJson({
      plan: company.plan,
      plan_limit: company.plan_limit,
      monthly_count: monthlyCount ?? 0,
      auto_upgrade: company.auto_upgrade,
      stripe_subscription_id: company.stripe_subscription_id ?? null,
      billing_cycle_start: company.billing_cycle_start ?? null,
      billing_cycle_end: company.billing_cycle_end ?? null,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'
import { applyNextMonthLimit } from '@/lib/companies/applyNextMonthLimit'

export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, email, interview_slug, plan, monthly_interview_limit, next_month_interview_limit, next_month_limit_effective_month, is_suspended, onboarding_completed, created_at')
      .eq('id', user.companyId)
      .single()

    if (error || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    // 翌月上限予約の月初昇格
    const applied = await applyNextMonthLimit({
      id: company.id,
      monthly_interview_limit: company.monthly_interview_limit ?? null,
      next_month_interview_limit: company.next_month_interview_limit ?? null,
      next_month_limit_effective_month: company.next_month_limit_effective_month ?? null,
    })

    return successJson({
      id: company.id,
      name: company.name,
      email: company.email,
      interview_slug: company.interview_slug,
      plan: company.plan,
      monthly_interview_limit: applied.monthly_interview_limit,
      // 停止判定の正は is_suspended（status は後方互換の派生値）
      is_suspended: company.is_suspended === true,
      status: company.is_suspended ? 'suspended' : 'active',
      onboarding_completed: company.onboarding_completed,
      created_at: company.created_at,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

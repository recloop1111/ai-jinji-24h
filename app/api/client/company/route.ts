import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, email, interview_slug, plan, plan_limit, auto_upgrade, is_suspended, onboarding_completed, created_at')
      .eq('id', user.companyId)
      .single()

    if (error || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    return successJson({
      id: company.id,
      name: company.name,
      email: company.email,
      interview_slug: company.interview_slug,
      plan: company.plan,
      plan_limit: company.plan_limit,
      auto_upgrade: company.auto_upgrade,
      status: company.is_suspended ? 'suspended' : 'active',
      onboarding_completed: company.onboarding_completed,
      created_at: company.created_at,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

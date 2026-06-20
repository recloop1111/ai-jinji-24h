import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClientServerClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClientServerClient()

    const { error: updateError } = await supabase
      .from('companies')
      .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
      .eq('id', user.companyId)

    if (updateError) {
      return apiError('INTERNAL_ERROR', 'オンボーディング状態の更新に失敗しました')
    }

    return successJson({ onboarding_completed: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

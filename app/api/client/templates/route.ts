import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    const { data: templates, error } = await supabase
      .from('email_templates')
      .select('id, template_type, subject, body, updated_at')
      .eq('company_id', user.companyId)
      .order('template_type', { ascending: true })

    if (error) {
      return apiError('INTERNAL_ERROR', 'テンプレートの取得に失敗しました')
    }

    return successJson({ templates: templates ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

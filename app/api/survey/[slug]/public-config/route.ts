import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

// service-role 利用のため Node runtime を明示
export const runtime = 'nodejs'

// 社風アンケート公開フロー用の公開設定（service-role）。
// culture_surveys は表示に必要な「安全列のみ」返し、回答データ（culture_survey_responses）・
// 分析結果（culture_profiles）・会社の機微列は一切返さない。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    if (!slug) return apiError('VALIDATION_ERROR', 'slug は必須です')

    const supabase = createServiceRoleClient()

    const { data: survey, error } = await supabase
      .from('culture_surveys')
      .select('id, department, employment_type, is_active, company_id')
      .eq('survey_url_slug', slug)
      .single()
    if (error || !survey) return apiError('NOT_FOUND', 'アンケートが見つかりません')

    // 会社は表示に必要な id / name のみ（email/phone/price/plan/stripe/auth_user_id 等は返さない）
    const { data: company } = await supabase
      .from('companies')
      .select('id, name')
      .eq('id', survey.company_id)
      .single()

    return successJson({
      id: survey.id,
      department: survey.department,
      employment_type: survey.employment_type,
      is_active: survey.is_active,
      company: {
        id: company?.id ?? '',
        name: company?.name ?? '',
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

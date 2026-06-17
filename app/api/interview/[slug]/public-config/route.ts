import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

// node:crypto は使わないが service-role 利用のため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー用の公開設定（service-role）。
// companies は表示に必要な「安全列のみ」返し、機微列（email/phone/contact/price/plan/stripe_*/
// company_setting_password_hash/auth_user_id 等）は一切返さない。jobs は当該企業の active のみ。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    if (!slug) return apiError('VALIDATION_ERROR', 'slug は必須です')

    const supabase = createServiceRoleClient()

    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, logo_url, interview_slug, is_suspended, is_demo, brand_color, avatar_config')
      .eq('interview_slug', slug)
      .single()
    if (error || !company) return apiError('NOT_FOUND', '無効な面接URLです')

    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, title, employment_type')
      .eq('company_id', company.id)
      .eq('is_active', true)

    return successJson({ company, jobs: jobs ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

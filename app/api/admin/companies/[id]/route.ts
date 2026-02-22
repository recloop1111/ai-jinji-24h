import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params

    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = await createClient()

    // 企業情報
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, name, email, plan, plan_limit, auto_upgrade, is_suspended, interview_slug, onboarding_completed, created_at')
      .eq('id', id)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業が見つかりません')
    }

    // 職種一覧
    const { data: jobTypes } = await supabase
      .from('job_types')
      .select('id, name')
      .eq('company_id', id)
      .order('name', { ascending: true })

    // 質問バンク一覧（質問数付き）
    const { data: questionBanks } = await supabase
      .from('question_banks')
      .select('id, name, questions ( id )')
      .eq('company_id', id)

    const banks = (questionBanks ?? []).map((qb: { id: string; name: string; questions: { id: string }[] | null }) => ({
      id: qb.id,
      name: qb.name,
      question_count: qb.questions?.length ?? 0,
    }))

    return successJson({
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        plan: company.plan,
        plan_limit: company.plan_limit,
        auto_upgrade: company.auto_upgrade,
        status: company.is_suspended ? 'suspended' : 'active',
        interview_slug: company.interview_slug,
        onboarding_completed: company.onboarding_completed,
        created_at: company.created_at,
      },
      job_types: jobTypes ?? [],
      question_banks: banks,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

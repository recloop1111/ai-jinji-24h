import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const supabase = await createClient()

    // slug → 企業特定
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended')
      .eq('interview_slug', slug)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '無効な面接URLです')
    }

    if (company.is_suspended) {
      return apiError('FORBIDDEN', 'この企業は現在利用停止中です')
    }

    // question_banks → questions
    const { data: bankIds } = await supabase
      .from('question_banks')
      .select('id')
      .eq('company_id', company.id)

    const bankIdList = (bankIds ?? []).map((qb: { id: string }) => qb.id)

    if (bankIdList.length === 0) {
      return successJson({ questions: [] })
    }

    const { data: questions, error } = await supabase
      .from('questions')
      .select('id, text, primary_axis, allow_followup, sort_order, job_type_id')
      .in('question_bank_id', bankIdList)
      .order('sort_order', { ascending: true })

    if (error) {
      return apiError('INTERNAL_ERROR', '質問の取得に失敗しました')
    }

    return successJson({ questions: questions ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

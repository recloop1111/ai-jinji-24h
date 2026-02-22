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

    // 企業存在確認
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', id)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業が見つかりません')
    }

    // question_banks の id を先に取得してからフィルタ
    const { data: bankIds } = await supabase
      .from('question_banks')
      .select('id')
      .eq('company_id', id)

    const bankIdList = (bankIds ?? []).map((qb: { id: string }) => qb.id)

    if (bankIdList.length === 0) {
      return successJson({ questions: [] })
    }

    const { data: questions, error } = await supabase
      .from('questions')
      .select('id, sort_order, text, primary_axis, secondary_axis, weight, allow_followup, job_type_id')
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

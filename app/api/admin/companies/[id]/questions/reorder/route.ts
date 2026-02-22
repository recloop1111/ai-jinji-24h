import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.question_ids) || body.question_ids.length === 0) {
      return apiError('VALIDATION_ERROR', 'question_ids は必須です（UUID配列）')
    }

    // 全IDがUUID形式か確認
    for (const qid of body.question_ids) {
      if (!isValidUUID(qid)) {
        return apiError('VALIDATION_ERROR', 'question_ids に不正なIDが含まれています')
      }
    }

    const supabase = await createClient()

    // company_id スコープ
    const { data: bankIds } = await supabase
      .from('question_banks')
      .select('id')
      .eq('company_id', id)

    const bankIdList = (bankIds ?? []).map((qb: { id: string }) => qb.id)
    if (bankIdList.length === 0) {
      return apiError('NOT_FOUND', '企業の質問バンクが見つかりません')
    }

    // 各質問の sort_order を更新
    const updates = body.question_ids.map((qid: string, index: number) =>
      supabase
        .from('questions')
        .update({ sort_order: index + 1 })
        .eq('id', qid)
        .in('question_bank_id', bankIdList),
    )

    await Promise.all(updates)

    return successJson({ reordered: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

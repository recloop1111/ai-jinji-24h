import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

const VALID_AXES = ['communication', 'logical_thinking', 'initiative', 'desire', 'stress_tolerance', 'integrity'] as const

type RouteParams = { params: Promise<{ id: string; question_id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id, question_id } = await params
    if (!isValidUUID(id) || !isValidUUID(question_id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    const updates: Record<string, unknown> = {}

    if (typeof body.text === 'string') {
      if (body.text.trim().length === 0) return apiError('VALIDATION_ERROR', 'text は空にできません')
      if (body.text.trim().length > 500) return apiError('VALIDATION_ERROR', 'text は500文字以内で入力してください')
      updates.text = body.text.trim()
    }
    if (body.primary_axis !== undefined) {
      if (!VALID_AXES.includes(body.primary_axis)) return apiError('VALIDATION_ERROR', 'primary_axis の値が不正です')
      updates.primary_axis = body.primary_axis
    }
    if (body.secondary_axis !== undefined) {
      if (body.secondary_axis !== null && !VALID_AXES.includes(body.secondary_axis)) {
        return apiError('VALIDATION_ERROR', 'secondary_axis の値が不正です')
      }
      updates.secondary_axis = body.secondary_axis
    }
    if (body.weight !== undefined) {
      if (typeof body.weight !== 'number' || body.weight <= 0 || body.weight > 10) {
        return apiError('VALIDATION_ERROR', 'weight は0より大きく10以下の数値を指定してください')
      }
      updates.weight = body.weight
    }
    if (body.allow_followup !== undefined) {
      if (typeof body.allow_followup !== 'boolean') return apiError('VALIDATION_ERROR', 'allow_followup はboolean値で指定してください')
      updates.allow_followup = body.allow_followup
    }
    if (body.sort_order !== undefined) {
      if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order) || body.sort_order < 0) {
        return apiError('VALIDATION_ERROR', 'sort_order は0以上の整数で指定してください')
      }
      updates.sort_order = body.sort_order
    }
    if (body.job_type_id !== undefined) {
      if (body.job_type_id !== null && !isValidUUID(body.job_type_id)) {
        return apiError('VALIDATION_ERROR', 'job_type_id の形式が不正です')
      }
      updates.job_type_id = body.job_type_id
    }

    if (Object.keys(updates).length === 0) {
      return apiError('VALIDATION_ERROR', '更新する項目がありません')
    }

    const supabase = await createClient()

    // company_id スコープ: question_banks 経由で確認
    const { data: bankIds } = await supabase
      .from('question_banks')
      .select('id')
      .eq('company_id', id)

    const bankIdList = (bankIds ?? []).map((qb: { id: string }) => qb.id)
    if (bankIdList.length === 0) {
      return apiError('NOT_FOUND', '質問が見つかりません')
    }

    const { data: question, error: updateError } = await supabase
      .from('questions')
      .update(updates)
      .eq('id', question_id)
      .in('question_bank_id', bankIdList)
      .select('id, sort_order, text, primary_axis, secondary_axis, weight, allow_followup, job_type_id')
      .single()

    if (updateError || !question) {
      return apiError('NOT_FOUND', '質問が見つかりません')
    }

    return successJson(question)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id, question_id } = await params
    if (!isValidUUID(id) || !isValidUUID(question_id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = await createClient()

    // company_id スコープ
    const { data: bankIds } = await supabase
      .from('question_banks')
      .select('id')
      .eq('company_id', id)

    const bankIdList = (bankIds ?? []).map((qb: { id: string }) => qb.id)
    if (bankIdList.length === 0) {
      return apiError('NOT_FOUND', '質問が見つかりません')
    }

    const { error: deleteError } = await supabase
      .from('questions')
      .delete()
      .eq('id', question_id)
      .in('question_bank_id', bankIdList)

    if (deleteError) {
      return apiError('INTERNAL_ERROR', '質問の削除に失敗しました')
    }

    return successJson({ deleted: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

const VALID_AXES = ['communication', 'logical_thinking', 'initiative', 'desire', 'stress_tolerance', 'integrity'] as const

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // バリデーション
    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'text は必須です')
    }
    if (body.text.trim().length > 500) {
      return apiError('VALIDATION_ERROR', 'text は500文字以内で入力してください')
    }
    if (!VALID_AXES.includes(body.primary_axis)) {
      return apiError('VALIDATION_ERROR', 'primary_axis の値が不正です')
    }
    if (body.secondary_axis !== null && body.secondary_axis !== undefined && !VALID_AXES.includes(body.secondary_axis)) {
      return apiError('VALIDATION_ERROR', 'secondary_axis の値が不正です')
    }
    if (typeof body.weight !== 'number' || body.weight <= 0 || body.weight > 10) {
      return apiError('VALIDATION_ERROR', 'weight は0より大きく10以下の数値を指定してください')
    }
    if (typeof body.allow_followup !== 'boolean') {
      return apiError('VALIDATION_ERROR', 'allow_followup はboolean値で指定してください')
    }
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order) || body.sort_order < 0) {
      return apiError('VALIDATION_ERROR', 'sort_order は0以上の整数で指定してください')
    }
    if (body.job_type_id !== null && body.job_type_id !== undefined && !isValidUUID(body.job_type_id)) {
      return apiError('VALIDATION_ERROR', 'job_type_id の形式が不正です')
    }

    const supabase = await createClient()

    // 企業のデフォルト question_bank を取得（なければ作成）
    let { data: bank } = await supabase
      .from('question_banks')
      .select('id')
      .eq('company_id', id)
      .limit(1)
      .single()

    if (!bank) {
      const { data: newBank, error: bankError } = await supabase
        .from('question_banks')
        .insert({ company_id: id, name: 'デフォルト' })
        .select('id')
        .single()

      if (bankError || !newBank) {
        return apiError('INTERNAL_ERROR', '質問バンクの作成に失敗しました')
      }
      bank = newBank
    }

    const { data: question, error: insertError } = await supabase
      .from('questions')
      .insert({
        question_bank_id: bank.id,
        text: body.text.trim(),
        primary_axis: body.primary_axis,
        secondary_axis: body.secondary_axis ?? null,
        weight: body.weight,
        allow_followup: body.allow_followup,
        sort_order: body.sort_order,
        job_type_id: body.job_type_id ?? null,
      })
      .select('id, sort_order, text, primary_axis, secondary_axis, weight, allow_followup, job_type_id')
      .single()

    if (insertError || !question) {
      return apiError('INTERNAL_ERROR', '質問の作成に失敗しました')
    }

    return successJson(question, 201)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

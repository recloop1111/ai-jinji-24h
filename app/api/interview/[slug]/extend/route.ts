import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

const MAX_EXTENSION_MINUTES = 20

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const supabase = await createClient()

    // slug → 企業特定
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id')
      .eq('interview_slug', slug)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '無効な面接URLです')
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    if (!body.interview_id || !isValidUUID(body.interview_id)) {
      return apiError('VALIDATION_ERROR', 'interview_id は必須です')
    }
    if (typeof body.extend_minutes !== 'number' || !Number.isInteger(body.extend_minutes) || body.extend_minutes <= 0) {
      return apiError('VALIDATION_ERROR', 'extend_minutes は1以上の整数で指定してください')
    }
    if (body.extend_minutes > MAX_EXTENSION_MINUTES) {
      return apiError('VALIDATION_ERROR', `延長は最大${MAX_EXTENSION_MINUTES}分までです`)
    }

    // interview 確認
    const { data: interview, error: intError } = await supabase
      .from('interviews')
      .select('id, status, extended_minutes')
      .eq('id', body.interview_id)
      .eq('company_id', company.id)
      .single()

    if (intError || !interview) {
      return apiError('NOT_FOUND', '面接が見つかりません')
    }

    if (interview.status !== 'in_progress') {
      return apiError('VALIDATION_ERROR', 'この面接は既に終了しています')
    }

    const currentExtended = interview.extended_minutes ?? 0
    const newExtended = currentExtended + body.extend_minutes

    if (newExtended > MAX_EXTENSION_MINUTES) {
      return apiError('VALIDATION_ERROR', `延長時間の合計は${MAX_EXTENSION_MINUTES}分を超えられません`)
    }

    const { error: updateError } = await supabase
      .from('interviews')
      .update({ extended_minutes: newExtended })
      .eq('id', body.interview_id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', '面接時間の延長に失敗しました')
    }

    return successJson({
      interview_id: body.interview_id,
      extended_minutes: newExtended,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

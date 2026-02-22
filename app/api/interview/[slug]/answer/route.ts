import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

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
    if (!body.question_id || !isValidUUID(body.question_id)) {
      return apiError('VALIDATION_ERROR', 'question_id は必須です')
    }
    if (typeof body.speaker !== 'string' || !['ai', 'applicant'].includes(body.speaker)) {
      return apiError('VALIDATION_ERROR', 'speaker は ai / applicant のいずれかです')
    }
    if (typeof body.content !== 'string' || body.content.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'content は必須です')
    }
    if (body.content.length > 5000) {
      return apiError('VALIDATION_ERROR', 'content は5000文字以内で入力してください')
    }

    // interview が企業に属するか確認
    const { data: interview, error: intError } = await supabase
      .from('interviews')
      .select('id')
      .eq('id', body.interview_id)
      .eq('company_id', company.id)
      .eq('status', 'in_progress')
      .single()

    if (intError || !interview) {
      return apiError('NOT_FOUND', '進行中の面接が見つかりません')
    }

    // interview_logs に保存
    const { data: log, error: insertError } = await supabase
      .from('interview_logs')
      .insert({
        interview_id: body.interview_id,
        question_id: body.question_id,
        speaker: body.speaker,
        content: body.content.trim(),
        timestamp_ms: body.timestamp_ms ?? Date.now(),
      })
      .select('id')
      .single()

    if (insertError || !log) {
      return apiError('INTERNAL_ERROR', '回答の保存に失敗しました')
    }

    // answered_questions をインクリメント
    if (body.speaker === 'applicant') {
      const { data: current } = await supabase
        .from('interviews')
        .select('answered_questions')
        .eq('id', body.interview_id)
        .single()

      await supabase
        .from('interviews')
        .update({ answered_questions: (current?.answered_questions ?? 0) + 1 })
        .eq('id', body.interview_id)
    }

    return successJson({ received: true, log_id: log.id })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

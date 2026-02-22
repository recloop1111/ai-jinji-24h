import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

const VALID_END_REASONS = ['completed', 'user_ended', 'timeout', 'silence', 'inappropriate', 'disconnected', 'browser_closed'] as const

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
    if (!VALID_END_REASONS.includes(body.end_reason)) {
      return apiError('VALIDATION_ERROR', 'end_reason の値が不正です')
    }
    if (typeof body.duration_seconds !== 'number' || body.duration_seconds < 0) {
      return apiError('VALIDATION_ERROR', 'duration_seconds は0以上の数値で指定してください')
    }
    if (typeof body.question_count !== 'number' || !Number.isInteger(body.question_count) || body.question_count < 0) {
      return apiError('VALIDATION_ERROR', 'question_count は0以上の整数で指定してください')
    }

    // interview が企業に属し in_progress か確認
    const { data: interview, error: intError } = await supabase
      .from('interviews')
      .select('id, status')
      .eq('id', body.interview_id)
      .eq('company_id', company.id)
      .single()

    if (intError || !interview) {
      return apiError('NOT_FOUND', '面接が見つかりません')
    }

    if (interview.status !== 'in_progress') {
      return apiError('VALIDATION_ERROR', 'この面接は既に終了しています')
    }

    // 課金判定: 10分超かつ不適切行為でない
    const billable = body.duration_seconds > 600 && body.end_reason !== 'inappropriate'

    const { error: updateError } = await supabase
      .from('interviews')
      .update({
        status: 'completed',
        end_reason: body.end_reason,
        duration_seconds: body.duration_seconds,
        total_questions: body.question_count,
        billable,
        completed_at: new Date().toISOString(),
      })
      .eq('id', body.interview_id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', '面接の完了処理に失敗しました')
    }

    return successJson({
      interview_id: body.interview_id,
      billable,
      report_status: 'generating',
      feedback_status: 'generating',
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

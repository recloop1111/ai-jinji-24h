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

    // interview 確認
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

    const { error: updateError } = await supabase
      .from('interviews')
      .update({ end_reason: body.end_reason })
      .eq('id', body.interview_id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', '終了理由の記録に失敗しました')
    }

    return successJson({
      interview_id: body.interview_id,
      end_reason: body.end_reason,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

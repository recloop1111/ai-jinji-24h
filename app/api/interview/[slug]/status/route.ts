import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const interviewId = request.nextUrl.searchParams.get('interview_id') ?? ''

    if (!interviewId || !isValidUUID(interviewId)) {
      return apiError('VALIDATION_ERROR', 'interview_id は必須です')
    }

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

    const { data: interview, error: intError } = await supabase
      .from('interviews')
      .select('id, status, end_reason, duration_seconds, total_questions, answered_questions, billable, created_at, completed_at')
      .eq('id', interviewId)
      .eq('company_id', company.id)
      .single()

    if (intError || !interview) {
      return apiError('NOT_FOUND', '面接が見つかりません')
    }

    return successJson({
      interview_id: interview.id,
      status: interview.status,
      end_reason: interview.end_reason,
      duration_seconds: interview.duration_seconds,
      total_questions: interview.total_questions,
      answered_questions: interview.answered_questions,
      billable: interview.billable,
      created_at: interview.created_at,
      completed_at: interview.completed_at,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

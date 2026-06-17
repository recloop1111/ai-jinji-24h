import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'

// node:crypto（token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー: 質問スナップショット保存（service-role）。token で本人のフローだけ許可する。
// in_progress の面接にのみ保存する。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // token 検証（署名・exp）＋ slug / applicant_id の一致
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return apiError('UNAUTHORIZED', 'トークンが無効です')
    if (payload.slug !== slug) return apiError('UNAUTHORIZED', 'トークンが一致しません')
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return apiError('UNAUTHORIZED', 'applicant_id が一致しません')
    }

    const interviewId = typeof body.interview_id === 'string' ? body.interview_id : ''
    if (!interviewId) return apiError('VALIDATION_ERROR', 'interview_id は必須です')

    // questions_snapshot は配列のみ許可
    const snapshot = body.questions_snapshot
    if (!Array.isArray(snapshot)) {
      return apiError('VALIDATION_ERROR', 'questions_snapshot は配列で指定してください')
    }

    const supabase = createServiceRoleClient()

    // slug → 企業特定（停止中は受付不可）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')
    if (company.is_suspended) return apiError('FORBIDDEN', '現在、面接の受付を停止しています')

    // applicant 実在＆当該企業所属
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // interview 実在＆applicant 一致＆in_progress のみ
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, status')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')
    if (interview.status !== 'in_progress') return apiError('VALIDATION_ERROR', 'この面接は進行中ではありません')

    const { error: updError } = await supabase
      .from('interviews')
      .update({ questions_snapshot: snapshot })
      .eq('id', interviewId)
    if (updError) return apiError('INTERNAL_ERROR', 'スナップショットの保存に失敗しました')

    return successJson({ interview_id: interviewId })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

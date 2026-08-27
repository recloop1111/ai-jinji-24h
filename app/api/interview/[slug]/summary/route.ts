import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'

// node:crypto（token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー: 面接完了画面のサマリー復元＋完了検証（service-role・token 検証・**読み取り専用**）。
// sessionStorage が消失（refresh / 直接アクセス / 再描画）しても、正常完了済み interview のサマリーを
// 「権限のある本人フロー」だけに返す。書き込みは一切行わない（DB 変更なし）。
// 返却: { status, durationSeconds, questionCount }
//   - status: interviews.status（'completed' のときだけ完了画面を表示してよい）
//   - durationSeconds: interviews.duration_seconds（サーバ確定値。無ければ null）
//   - questionCount: interviews.total_questions（設問数＝正常完了では回答済み質問数と一致。deep-dive は数えない）
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

    // token 検証（署名・exp）＋ slug / applicant_id の一致（/end と同じ本人確認）
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return apiError('UNAUTHORIZED', 'トークンが無効です')
    if (payload.slug !== slug) return apiError('UNAUTHORIZED', 'トークンが一致しません')
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return apiError('UNAUTHORIZED', 'applicant_id が一致しません')
    }
    const interviewId = typeof body.interview_id === 'string' ? body.interview_id : ''
    if (!interviewId) return apiError('VALIDATION_ERROR', 'interview_id は必須です')

    const supabase = createServiceRoleClient()

    // slug → 企業特定
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')

    // applicant 実在＆当該企業所属（/end と同じ整合チェック）
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // interview 実在＆applicant 一致（読み取りのみ）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, status, duration_seconds, total_questions')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')

    const durationSeconds =
      typeof interview.duration_seconds === 'number' && Number.isFinite(interview.duration_seconds)
        ? interview.duration_seconds
        : null
    const questionCount =
      typeof interview.total_questions === 'number' && Number.isFinite(interview.total_questions)
        ? interview.total_questions
        : null

    return successJson({ status: interview.status, durationSeconds, questionCount })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'

// node:crypto（token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー: 質問取得失敗時の中断確定（service-role）。
// /questions が失敗して質問が一度も提示されないまま in_progress が残ると、後続の孤児finalizeで
// duration_seconds = (finalize時刻 - started_at) > 600 のとき is_billable=true になり、質問未提示でも
// 課金・上限カウントされ得る（P2 #2）。これを防ぐため、当該 in_progress を「非課金で確定」する。
// /end と異なり applicants.status / result は変更しない（サーバ/設定起因の失敗で応募者を不採用にしない）。
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

    // token 検証（署名・exp）＋ slug / applicant_id の一致（/end と同方式）
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

    // applicant 実在＆当該企業所属
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // interview 実在＆applicant 一致（duration 算出用の started_at も取得）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, status, started_at')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')

    // 冪等: in_progress のときだけ確定する。既に終了済み（新セッションが cancelled 化した等）は no-op。
    if (interview.status !== 'in_progress') {
      return successJson({
        interview_id: interviewId,
        status: interview.status,
        already_finalized: true,
      })
    }

    // duration はサーバ保存の started_at から算出（client 値は信用しない）。
    // is_billable はサーバが false を強制（質問未提示のため課金しない・duration に依存しない）。
    const endedAtIso = new Date().toISOString()
    const startedAtMs = interview.started_at ? new Date(interview.started_at).getTime() : NaN
    const durationSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.floor((new Date(endedAtIso).getTime() - startedAtMs) / 1000))
      : 0

    // 対象 interview_id の in_progress のみ条件付きUPDATE（並行する別 in_progress は触らない・二重abortも冪等）。
    const { data: updatedRows, error: updError } = await supabase
      .from('interviews')
      .update({
        status: 'cancelled',
        ended_at: endedAtIso,
        duration_seconds: durationSeconds,
        is_billable: false,
        // end_reason は interviews_end_reason_check の許可値のみ。'questions_unavailable' は未許可で
        // CHECK 違反になり UPDATE が落ちるため null にする（DB変更不可・status/is_billable で識別可能）。
        end_reason: null,
      })
      .eq('id', interviewId)
      .eq('status', 'in_progress')
      .select('id')
    if (updError) return apiError('INTERNAL_ERROR', '面接の中断処理に失敗しました')

    // applicants.status / result は変更しない（途中離脱/不採用にしない）。
    return successJson({
      interview_id: interviewId,
      status: 'cancelled',
      is_billable: false,
      // 並行リクエストに先に確定された場合（0件）も冪等成功として返す
      already_finalized: !updatedRows || updatedRows.length === 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { isTranscriptIngestEnabled } from '@/lib/config/transcript'
import { authorizeTranscriptWrite, type TranscriptAuthzErrorCode } from '@/lib/interview/transcript-authz'
import { parseBrowserTranscriptBody } from '@/lib/interview/transcript-write'

// 公開面接フロー: Transcript 取り込み（境界確定用スキャフォールド・既定 OFF）。
// node:crypto（token検証）を使うため Node runtime。
export const runtime = 'nodejs'

// 【重要 / 信頼境界】
//   - 現在 Realtime は既定 OFF、#19 server relay も未実装＝「信頼できるブラウザ Transcript ソース」は存在しない。
//     ブラウザは Transcript 本文・speaker・source を改ざんできるため、authoritative transcript を browser から
//     自由投稿できる状態にしない。よって本エンドポイントは既定で 503（無効）。
//   - 有効化（dev/test で TRANSCRIPT_INGEST_ENABLED=true）時も、認可・入力検証の境界だけを確定し、
//     ブラウザ由来の本文を authoritative transcript として保存しない（source を browser に選ばせない）。
//     信頼できる writer / seq allocator の実配線は #19（server relay）で行う → ここでは保存せず 501。
//   - PR-3A schema（interview_transcripts）は未適用。実 DB への書込は行わない。
//   - PII: 本文・氏名等を error レスポンス / ログへ出さない（汎用コード/メッセージのみ）。

// 認可エラーコード → 汎用 HTTP エラー（本文/内部情報を漏らさない）。
function mapAuthzError(code: TranscriptAuthzErrorCode) {
  switch (code) {
    case 'UNAUTHORIZED':
      return apiError('UNAUTHORIZED', 'トークンが無効です')
    case 'FORBIDDEN':
      return apiError('FORBIDDEN', '不正なリクエストです')
    case 'NOT_FOUND':
      return apiError('NOT_FOUND', '対象が見つかりません')
    case 'NOT_IN_PROGRESS':
      return apiError('CONFLICT', '面接は進行中ではありません')
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params

    // 1) 既定 OFF（本番）。信頼できるソースが無いため、有効化されるまで一切書き込まない。
    if (!isTranscriptIngestEnabled()) {
      return errorJson('TRANSCRIPT_INGEST_DISABLED', 'Transcript の保存は現在無効です', 503)
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')

    // 2) token 検証（署名・exp）。applicant_id / interview_id は「探索キー」として受けるが、信用は DB 整合で担保。
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    const bodyApplicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    const bodyInterviewId = typeof body.interview_id === 'string' ? body.interview_id : ''

    // 3) service-role で company / applicant / interview を取得（RLS bypass）。
    const supabase = createServiceRoleClient()
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('interview_slug', slug)
      .single()
    const { data: applicant } = bodyApplicantId
      ? await supabase.from('applicants').select('id, company_id').eq('id', bodyApplicantId).single()
      : { data: null }
    const { data: interview } = bodyInterviewId
      ? await supabase.from('interviews').select('id, applicant_id, status').eq('id', bodyInterviewId).single()
      : { data: null }

    // 4) 認可（token / 身元 / 所属 / 対象 / 進行中）を純関数で判定。失敗は汎用エラー（PII なし）。
    const authz = authorizeTranscriptWrite({
      slug,
      tokenPayload: payload,
      bodyApplicantId,
      bodyInterviewId,
      company: company ?? null,
      applicant: applicant ?? null,
      interview: interview ?? null,
    })
    if (!authz.ok) return mapAuthzError(authz.code)

    // 5) 入力検証（ブラウザが送れるのは text / dedup_key / final / language のみ。speaker/source/seq/interview は信用しない）。
    const parsed = parseBrowserTranscriptBody(body)
    if (!parsed.ok) return apiError('VALIDATION_ERROR', '入力値が不正です')

    // 6) 【信頼できる writer 未配線】ここまでで境界（認可・検証）は確定するが、ブラウザ由来の本文を
    //    authoritative transcript として保存しない（信頼できる source が無い / PR-3A schema 未適用）。
    //    trusted writer（saveUtterance）＋ server-side seq allocator の実配線は #19（server relay）で行う。
    return errorJson('TRANSCRIPT_WRITER_NOT_WIRED', 'Transcript の保存経路は準備中です', 501)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { assembleInterviewQuestions } from '@/lib/interview/assembleQuestions'
import {
  MAX_TOTAL_QUESTIONS,
  MAX_ICEBREAKER_QUESTIONS,
  MAX_EVALUATION_QUESTIONS,
  MAX_CLOSING_QUESTIONS,
} from '@/lib/config/interview-policy'

// node:crypto（POST の token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー: 面接質問取得（service-role）。token で本人のフローだけ許可する。
// applicant.job_id ＋ 応募者区分から導出した pattern_key で job_questions を返す
//（question_text / sort_order のみ・昇順）。他区分の質問は混ぜない。
// job_id 無し or 該当 pattern_key の質問無しは空配列を返し、呼び出し側の既定質問フォールバックを壊さない。
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

    const supabase = createServiceRoleClient()

    // slug → 企業特定（停止中は受付不可）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')
    if (company.is_suspended) return apiError('FORBIDDEN', '現在、面接の受付を停止しています')

    // applicant 実在＆当該企業所属（区分導出に employment_type / industry_experience も取得）
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id, job_id, employment_type, industry_experience')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // interview 実在＆applicant 一致（snapshot も取得）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, questions_snapshot')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')

    // 開始時点の質問を固定：snapshot があればそれを優先（再開時に企業の質問変更の影響を受けない）。
    if (Array.isArray(interview.questions_snapshot) && interview.questions_snapshot.length > 0) {
      return successJson({ questions: interview.questions_snapshot })
    }

    // 質問組み立てはサーバー側の唯一の権威（assembleInterviewQuestions）。
    // job_id 無し / 当該 pattern 未設定 → 空配列（既定質問フォールバック）。
    const assembled = await assembleInterviewQuestions(supabase, company.id, applicant)
    if (!assembled.ok) {
      if (assembled.kind === 'limit_exceeded') {
        return apiError(
          'QUESTION_LIMIT_EXCEEDED',
          `この求人・区分の質問数が上限（アイスブレイク${MAX_ICEBREAKER_QUESTIONS}・評価${MAX_EVALUATION_QUESTIONS}・クロージング${MAX_CLOSING_QUESTIONS}・合計${MAX_TOTAL_QUESTIONS}問）を超えているため面接を開始できません。企業の質問設定を見直してください。`,
        )
      }
      if (assembled.kind === 'job_not_found') return apiError('NOT_FOUND', '求人が見つかりません')
      if (assembled.kind === 'forbidden') return apiError('FORBIDDEN', '不正なリクエストです')
      return apiError('INTERNAL_ERROR', '質問の取得に失敗しました')
    }
    const questions = assembled.questions
    if (questions.length === 0) {
      return successJson({ questions: [] })
    }

    // 計算した questions をサーバ側で snapshot 固定（クライアントの /snapshot 未送＝クラッシュ/通信断でも
    // 再開時のライブ再計算による質問変化を防ぐ）。条件付き UPDATE（in_progress かつ questions_snapshot IS NULL
    // のときだけ書く）＝既存snapshotは絶対に上書きしない・completed/cancelled は触らない・レース時は先勝ち。
    // 追加P2（Codex）: 凍結レースに負けた場合の一貫性。読み取り〜UPDATE の間に realtime-call（や管理者編集を
    //   挟んだ凍結）が先に「別内容で」凍結すると 0行になる。その場合ローカルの questions を返すと UI（この
    //   レスポンス表示）と永続/Realtime が食い違う。→ 1行返れば自分の版、0行なら勝った現在の snapshot を再読
    //   して返す（realtime-call と同一パターン）。
    const { data: frozenRows } = await supabase
      .from('interviews')
      .update({ questions_snapshot: questions })
      .eq('id', interviewId)
      .eq('status', 'in_progress')
      .is('questions_snapshot', null)
      .select('questions_snapshot')
    if (frozenRows && frozenRows.length > 0) {
      return successJson({ questions }) // 自分が凍結した（レースに勝った）
    }
    // 0行（レース敗北/既凍結）→ 勝った現在の snapshot を再読して返す。取れなければローカルの questions を返す
    // （UI 表示のためのベストエフォート。realtime-call 側は fail-closed だが、こちらは表示専用のため継続）。
    const { data: current } = await supabase
      .from('interviews')
      .select('questions_snapshot')
      .eq('id', interviewId)
      .single()
    if (current && Array.isArray(current.questions_snapshot) && current.questions_snapshot.length > 0) {
      return successJson({ questions: current.questions_snapshot })
    }
    return successJson({ questions })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

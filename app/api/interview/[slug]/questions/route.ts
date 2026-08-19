import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import {
  assembleInterviewQuestions,
  DEFAULT_INTERVIEW_QUESTIONS,
  type AssembledQuestion,
} from '@/lib/interview/assembleQuestions'
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
    // 追加P2（Codex）: job_id 無し / pattern 未設定（空）でも、実際に応募者へ出す既定質問を
    //   サーバ側で凍結して記録・返却する（client /snapshot 撤去後、既定質問面接の questions_snapshot が
    //   null のまま記録欠落するのを防ぐ）。既定質問は assembleQuestions の唯一定義を使う。
    const questions = assembled.questions.length > 0 ? assembled.questions : DEFAULT_INTERVIEW_QUESTIONS

    // 計算した questions をサーバ側で snapshot 固定（条件付き UPDATE＝in_progress かつ questions_snapshot IS NULL
    // のときだけ書く。既存snapshotは上書きしない・completed/cancelled は触らない・レース時は先勝ち）。
    // 追加P2（Codex）: /questions は client /snapshot 撤去後の唯一の snapshot writer。
    //   - 凍結レースに勝てば自分の版、負けたら勝った現在の snapshot を再読して返す（UI と永続/Realtime を一致）。
    //   - 凍結できない（UPDATE/再読とも権威 snapshot を返さない）まま 200 でローカル版を返すと、mock 面接が
    //     questions_snapshot=null で完了し記録喪失する。→ 一過性ブリップ用に一度リトライし、それでも権威
    //     snapshot が取れなければ fail-closed（non-OK＝クライアントはブロッキング。記録なしの面接を走らせない）。
    const nonEmptySnapshot = (v: unknown): AssembledQuestion[] | null =>
      Array.isArray(v) && v.length > 0 ? (v as AssembledQuestion[]) : null

    async function claimAuthoritativeSnapshot(): Promise<AssembledQuestion[] | null> {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data: rows, error: updErr } = await supabase
          .from('interviews')
          .update({ questions_snapshot: questions })
          .eq('id', interviewId)
          .eq('status', 'in_progress')
          .is('questions_snapshot', null)
          .select('questions_snapshot')
        if (!updErr && rows && rows.length > 0) {
          const won = nonEmptySnapshot(rows[0].questions_snapshot)
          if (won) return won // 自分が凍結した（レースに勝った）
        }
        // 勝てなかった/エラー → 現在の権威 snapshot を再読（別writer が既に凍結済みなら採用）。
        const { data: current, error: reErr } = await supabase
          .from('interviews')
          .select('questions_snapshot')
          .eq('id', interviewId)
          .single()
        if (!reErr) {
          const existing = nonEmptySnapshot(current?.questions_snapshot)
          if (existing) return existing
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 200)) // 一過性ブリップ用に一度だけ再試行
      }
      return null
    }

    const frozen = await claimAuthoritativeSnapshot()
    if (!frozen) {
      // fail-closed: 権威 snapshot を確定できない → 記録なしの面接を走らせない。
      return apiError('INTERNAL_ERROR', '面接質問の準備に失敗しました。お手数ですが時間をおいて再度お試しください。')
    }
    return successJson({ questions: frozen })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

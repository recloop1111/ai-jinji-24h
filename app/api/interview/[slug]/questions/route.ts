import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { derivePatternKey } from '@/lib/interview/patternKey'
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

    // job_id 無しは質問無し扱い（呼び出し側の既定質問フォールバックを維持）
    if (!applicant.job_id) {
      return successJson({ questions: [] })
    }

    // job が当該企業のものであることを検証（求人の雇用形態も取得）
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, company_id, employment_type')
      .eq('id', applicant.job_id)
      .single()
    if (jobError || !job) return apiError('NOT_FOUND', '求人が見つかりません')
    if (job.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // 応募者区分から pattern_key を導出（jobの雇用形態 × 応募者の新卒/中途 × 経験有無）
    const patternKey = derivePatternKey({
      jobEmploymentType: job.employment_type,
      applicantEmploymentType: applicant.employment_type,
      industryExperience: applicant.industry_experience,
    })

    // job_questions を取得（当該 job_id + pattern_key のみ・昇順）。category で評価質問とアイスブレイクに振り分ける。
    // 他求人・他 pattern は混ぜない。
    const { data: jqRows, error: jqError } = await supabase
      .from('job_questions')
      .select('question_text, sort_order, category')
      .eq('job_id', applicant.job_id)
      .eq('pattern_key', patternKey)
      .order('sort_order', { ascending: true })

    // DB/query エラーは握りつぶさず非OKで返す。
    // ※「該当0件＝正当な空（200+空配列→既定質問フォールバック）」とは明確に分離する。
    //   error を空扱いにすると、誤った既定質問で面接続行＆スナップショットしてしまう（クライアントのブロッキング経路を発火させる）。
    if (jqError) return apiError('INTERNAL_ERROR', '質問の取得に失敗しました')

    const rows = jqRows ?? []
    const evaluation = rows
      .filter((r) => r.category === 'evaluation')
      .map((r) => ({ question_text: r.question_text, sort_order: r.sort_order }))
    const icebreakers = rows
      .filter((r) => r.category === 'icebreaker')
      .map((r) => ({ question_text: r.question_text, sort_order: r.sort_order }))

    // 評価質問が0件＝当該 pattern 未設定 → 空配列（既定質問フォールバックへ）。アイスブレイク単独配信はしない。
    if (evaluation.length === 0) {
      return successJson({ questions: [] })
    }

    // クロージングは企業共通（common_questions.category='closing'）。旧 common icebreakers は配信しない。
    const { data: commonRows, error: commonError } = await supabase
      .from('common_questions')
      .select('category, question_text, sort_order')
      .eq('company_id', company.id)
      .eq('category', 'closing')
      .order('sort_order', { ascending: true })

    // job_questions と同様、DB/query エラーは握りつぶさず非OKで返す（0件＝closing無しの正当な空とは分離）。
    // ※ error を空扱いにすると closing 欠落のまま 200＆スナップショット固定されてしまう。
    if (commonError) return apiError('INTERNAL_ERROR', '質問の取得に失敗しました')

    const closing = (commonRows ?? []).map((r) => ({ question_text: r.question_text, sort_order: r.sort_order }))

    // 配信順 = icebreaker(job×pattern) → evaluation(job×pattern) → closing(企業共通)。各 category 内は sort_order 昇順。
    const questions = [...icebreakers, ...evaluation, ...closing]

    // 防御的検証: カテゴリ別上限（ice2/eval13/closing1）・全体16問を超える場合は、
    // 先頭16問へ切り捨てず・面接を開始せず HTTP 422 を返す。質問本文・個人情報はログ/レスポンスに出さない（件数のみ）。
    if (
      icebreakers.length > MAX_ICEBREAKER_QUESTIONS ||
      evaluation.length > MAX_EVALUATION_QUESTIONS ||
      closing.length > MAX_CLOSING_QUESTIONS ||
      questions.length > MAX_TOTAL_QUESTIONS
    ) {
      return apiError(
        'QUESTION_LIMIT_EXCEEDED',
        `この求人・区分の質問数が上限（アイスブレイク${MAX_ICEBREAKER_QUESTIONS}・評価${MAX_EVALUATION_QUESTIONS}・クロージング${MAX_CLOSING_QUESTIONS}・合計${MAX_TOTAL_QUESTIONS}問）を超えているため面接を開始できません。企業の質問設定を見直してください。`,
      )
    }

    return successJson({ questions })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

// 面接質問のサーバー側組み立て（唯一の権威）。/questions と /realtime-call が共有する。
// クライアント書き込み可能な interviews.questions_snapshot は「表示/再開の凍結」用であり、
// AI への指示（instructions）や配信の権威ソースにはしない（改竄防止）。
// 組み立て = applicant.job_id ＋ 導出 pattern_key で job_questions を絞り、common closing を連結。

import { type SupabaseClient } from '@supabase/supabase-js'
import { derivePatternKey } from '@/lib/interview/patternKey'
import {
  MAX_TOTAL_QUESTIONS,
  MAX_ICEBREAKER_QUESTIONS,
  MAX_EVALUATION_QUESTIONS,
  MAX_CLOSING_QUESTIONS,
} from '@/lib/config/interview-policy'

export type AssembledQuestion = { question_text: string; sort_order: number }
export type AssembleResult =
  | { ok: true; questions: AssembledQuestion[] } // 空配列 = job無し or 当該pattern未設定（既定質問フォールバック）
  | { ok: false; kind: 'db_error' | 'limit_exceeded' | 'job_not_found' | 'forbidden' }

type ApplicantInput = {
  job_id: string | null
  employment_type: string | null
  industry_experience: string | null
}

// 配信順 = icebreaker(job×pattern) → evaluation(job×pattern) → closing(企業共通)。各 category 内は sort_order 昇順。
export async function assembleInterviewQuestions(
  supabase: SupabaseClient,
  companyId: string,
  applicant: ApplicantInput,
): Promise<AssembleResult> {
  // job_id 無しは質問無し扱い（呼び出し側の既定質問フォールバックを維持）。
  if (!applicant.job_id) return { ok: true, questions: [] }

  // job が当該企業のものであることを検証（求人の雇用形態も取得）。
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, company_id, employment_type')
    .eq('id', applicant.job_id)
    .single()
  if (jobError || !job) return { ok: false, kind: 'job_not_found' }
  if (job.company_id !== companyId) return { ok: false, kind: 'forbidden' }

  // 応募者区分から pattern_key を導出（jobの雇用形態 × 応募者の新卒/中途 × 経験有無）。
  const patternKey = derivePatternKey({
    jobEmploymentType: job.employment_type,
    applicantEmploymentType: applicant.employment_type,
    industryExperience: applicant.industry_experience,
  })

  // job_questions（当該 job_id + pattern_key のみ・昇順）。他求人・他 pattern は混ぜない。
  const { data: jqRows, error: jqError } = await supabase
    .from('job_questions')
    .select('question_text, sort_order, category')
    .eq('job_id', applicant.job_id)
    .eq('pattern_key', patternKey)
    .order('sort_order', { ascending: true })
  // DB/query エラーは握りつぶさず非OK（「該当0件＝正当な空」とは分離）。
  if (jqError) return { ok: false, kind: 'db_error' }

  const rows = (jqRows ?? []) as { question_text: string; sort_order: number; category: string }[]
  const evaluation = rows
    .filter((r) => r.category === 'evaluation')
    .map((r) => ({ question_text: r.question_text, sort_order: r.sort_order }))
  const icebreakers = rows
    .filter((r) => r.category === 'icebreaker')
    .map((r) => ({ question_text: r.question_text, sort_order: r.sort_order }))

  // 評価質問が0件＝当該 pattern 未設定 → 空配列（既定質問フォールバックへ）。アイスブレイク単独配信はしない。
  if (evaluation.length === 0) return { ok: true, questions: [] }

  // クロージングは企業共通（common_questions.category='closing'）。
  const { data: commonRows, error: commonError } = await supabase
    .from('common_questions')
    .select('category, question_text, sort_order')
    .eq('company_id', companyId)
    .eq('category', 'closing')
    .order('sort_order', { ascending: true })
  if (commonError) return { ok: false, kind: 'db_error' }

  const closing = ((commonRows ?? []) as { question_text: string; sort_order: number }[]).map((r) => ({
    question_text: r.question_text,
    sort_order: r.sort_order,
  }))

  const questions = [...icebreakers, ...evaluation, ...closing]

  // カテゴリ別上限（ice2/eval13/closing1）・全体16問超過は切り捨てず非OK（面接を開始させない）。
  if (
    icebreakers.length > MAX_ICEBREAKER_QUESTIONS ||
    evaluation.length > MAX_EVALUATION_QUESTIONS ||
    closing.length > MAX_CLOSING_QUESTIONS ||
    questions.length > MAX_TOTAL_QUESTIONS
  ) {
    return { ok: false, kind: 'limit_exceeded' }
  }

  return { ok: true, questions }
}

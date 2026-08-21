// PR-4E-2: 評価実行のオーケストレーション（server-side 境界・依存注入で fully testable）。
//   gate → auth/scope → interview 取得 → transcript 取得 → eligibility → hash/idempotency → provider →
//   validation(4A) → repository save → 結果。OpenAI/Supabase は「注入された依存」経由で、本 PR では fake のみ。
// route 固有処理（HTTP/認証解決）は route に、domain 処理はここに分ける。実 network/DB へは本 PR で到達しない。

import { checkEvaluationEligibility, type EvaluationAuthContext, type InterviewEvalContext } from './eligibility'
import { runWithRetry, DEFAULT_EVALUATION_RETRY_POLICY, type RetryPolicy } from './retry'
import type { EvaluationServiceResult } from './service'
import type { EvaluationJobContext } from './prompt'
import type { EvaluationResult } from './ebca'
import type { InterviewResultRecord } from './mapping'

// 失敗/状態を混同しない明示的な結果状態。
export type EvaluationRunStatus =
  | 'success'
  | 'already_evaluated'
  | 'insufficient_data'
  | 'failed'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'

export interface EvaluationRunResult {
  status: EvaluationRunStatus
  reason?: string // 非 PII の code のみ（本文/PII を入れない）
  transcriptHash?: string
  evaluation?: EvaluationResult
  record?: InterviewResultRecord
}

// EvaluationService の evaluate だけを関数境界で受ける（class 全体に結合しない＝fake しやすい）。
export interface EvaluationRunnerService {
  evaluate(input: { interviewId: string; transcriptRows: unknown; job?: EvaluationJobContext | null }): Promise<EvaluationServiceResult>
}

export interface RunInterviewEvaluationDeps {
  gate: () => boolean // 例: isEvaluationEnabled（本 PR では fake）
  loadInterviewContext: (interviewId: string) => Promise<InterviewEvalContext | null> // service-role で解決（本 PR では fake）
  loadTranscriptRows: (interviewId: string) => Promise<unknown> // PR-3 の生 rows（本 PR では fake）
  service: EvaluationRunnerService // EvaluationService（fake provider/repo で構築）
  sleep: (ms: number) => Promise<void> // retry backoff（注入・実時間 sleep しない）
  retryPolicy?: RetryPolicy
  jobContext?: EvaluationJobContext | null
}

export async function runInterviewEvaluation(input: {
  interviewId: string
  auth: EvaluationAuthContext
  deps: RunInterviewEvaluationDeps
}): Promise<EvaluationRunResult> {
  const { interviewId, auth, deps } = input

  // 1) gate（未有効なら評価しない・provider/DB へ行かない）。
  if (!deps.gate()) return { status: 'failed', reason: 'gate_disabled' }

  // 2) interview/applicant/company をサーバ解決（client 入力の applicant_id を信用しない）。
  const context = await deps.loadInterviewContext(interviewId)
  if (!context) return { status: 'not_found', reason: 'interview_not_found' }

  // 3) auth/scope + eligibility（tenant isolation / 完了済みのみ）。
  const elig = checkEvaluationEligibility({ context, auth })
  if (!elig.ok) return { status: elig.status, reason: elig.reason }

  // 4) transcript rows を取得（PR-3 public 境界。内部 schema は解釈しない）。
  const rows = await deps.loadTranscriptRows(interviewId)
  const policy = deps.retryPolicy ?? DEFAULT_EVALUATION_RETRY_POLICY

  // 5) EvaluationService（hash/idempotency/insufficient/provider/validation/save）を retry 付きで実行。
  //    retryable は provider_temporary のみ。permanent/insufficient/success/already_evaluated は再試行しない。
  let result: EvaluationServiceResult
  try {
    result = await runWithRetry(
      () => deps.service.evaluate({ interviewId, transcriptRows: rows, job: deps.jobContext ?? null }),
      {
        isRetryable: (r) => r.status === 'failed' && r.failureReason === 'provider_temporary',
        policy,
        sleep: deps.sleep,
      },
    )
  } catch {
    // provider/repository の例外（DB save 失敗等）→ success にしない。非 PII の failed（error 本文は出さない）。
    return { status: 'failed', reason: 'execution_error' }
  }

  // 6) service 結果 → run 結果へ（失敗と insufficient_data を混同しない）。
  switch (result.status) {
    case 'success':
      return { status: 'success', transcriptHash: result.transcriptHash, evaluation: result.evaluation, record: result.record }
    case 'insufficient':
      return { status: 'insufficient_data', transcriptHash: result.transcriptHash, evaluation: result.evaluation, record: result.record }
    case 'already_evaluated':
      return { status: 'already_evaluated', transcriptHash: result.transcriptHash, record: result.record }
    case 'failed':
    default:
      return { status: 'failed', reason: result.failureReason ?? 'provider_error', transcriptHash: result.transcriptHash }
  }
}

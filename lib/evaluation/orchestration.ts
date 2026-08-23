// PR-4E-2: 評価実行のオーケストレーション（server-side 境界・依存注入で fully testable）。
//   gate → auth/scope → interview 取得 → transcript 取得 → eligibility → hash/idempotency → provider →
//   validation(4A) → repository save → 結果。OpenAI/Supabase は「注入された依存」経由で、本 PR では fake のみ。
// route 固有処理（HTTP/認証解決）は route に、domain 処理はここに分ける。実 network/DB へは本 PR で到達しない。

import { checkEvaluationEligibility, type EvaluationAuthContext, type InterviewEvalContext } from './eligibility'
import { runWithRetry, DEFAULT_EVALUATION_RETRY_POLICY, type RetryPolicy } from './retry'
import { computeTranscriptHash, type EvaluationServiceResult, type EvaluationRepository } from './service'
import type { EvaluationLock } from './lock'
import type { EvaluationCooldown } from './cooldown'
import { buildFinalTranscriptReadModel } from '../interview/transcript-view'
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
  | 'cooldown' // PR-19I: temporary 失敗後の短時間再試行抑制中（Provider を呼ばない）

export interface EvaluationRunResult {
  status: EvaluationRunStatus
  reason?: string // 非 PII の code のみ（本文/PII を入れない）
  transcriptHash?: string
  evaluation?: EvaluationResult
  record?: InterviewResultRecord
  retryAfterMs?: number // PR-19I: cooldown 残り時間（非機密メタ）
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
  // 並行ロック（任意）。lock+repo を渡すと、Provider 呼び出し前に atomic lock を取り、
  // ロック前後で already_evaluated を double-check して二重課金を防ぐ（本番経路）。未指定なら従来どおり。
  lock?: EvaluationLock
  repo?: EvaluationRepository
  // PR-19I: cooldown（任意）。lock 経路でのみ機能。temporary 最終失敗後の連打を DB backed で抑制する。
  cooldown?: EvaluationCooldown
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

  const runService = () =>
    runWithRetry(() => deps.service.evaluate({ interviewId, transcriptRows: rows, job: deps.jobContext ?? null }), {
      isRetryable: (r) => r.status === 'failed' && r.failureReason === 'provider_temporary',
      policy,
      sleep: deps.sleep,
    })

  // 5) 並行ロックあり（本番経路）: pre-check → lock 取得 → double-check → service → 必ず release。
  if (deps.lock && deps.repo) {
    const hash = computeTranscriptHash(buildFinalTranscriptReadModel(rows))
    // 5-1) pre-check: 既に同 hash が保存済みなら Provider を呼ばない（ロックも取らない）。
    const pre = await deps.repo.findByInterviewAndHash(interviewId, hash).catch(() => 'ERR' as const)
    if (pre === 'ERR') return { status: 'failed', reason: 'execution_error' }
    if (pre) return { status: 'already_evaluated', transcriptHash: hash, record: pre.record }

    // 5-1b) PR-19I: cooldown 判定（lock 取得前）。active なら Provider を絶対に呼ばず即返す（連打で課金しない）。
    //   scope = interviewId + hash。cooldown 障害は握って通常フローへ（cost guard の欠如＝従来挙動に劣化させない）。
    if (deps.cooldown) {
      const cd = await deps.cooldown.check(interviewId, hash).catch(() => null)
      if (cd?.active) return { status: 'cooldown', reason: 'evaluation_cooldown', transcriptHash: hash, retryAfterMs: cd.retryAfterMs }
    }

    // 5-2) atomic lock 取得。競合=409相当 / 障害=fail-closed（Provider へ進まない）。
    const claim = await deps.lock.acquire(interviewId).catch(() => 'error' as const)
    if (claim === 'contended') return { status: 'conflict', reason: 'evaluation_in_progress', transcriptHash: hash }
    if (claim === 'error') return { status: 'failed', reason: 'lock_error', transcriptHash: hash }

    try {
      // 5-3) double-check: ロック取得前に別リクエストが完了していないか再確認（二重課金防止の要）。
      const post = await deps.repo.findByInterviewAndHash(interviewId, hash)
      if (post) return { status: 'already_evaluated', transcriptHash: hash, record: post.record }
      // 5-4) service 実行（retry 付き）。
      const result = await runService()
      // 5-5) PR-19I: temporary 最終失敗のみ cooldown を設定（permanent/DB/insufficient は対象外）。
      //   成功/insufficient は stale cooldown を消す。cooldown 書込失敗は結果を変えない（best-effort）。
      if (deps.cooldown) {
        if (result.status === 'failed' && result.failureReason === 'provider_temporary') {
          await deps.cooldown.markTemporaryFailure(interviewId, hash).catch(() => {})
        } else if (result.status === 'success' || result.status === 'insufficient') {
          await deps.cooldown.clear(interviewId).catch(() => {})
        }
      }
      return mapServiceResult(result)
    } catch {
      return { status: 'failed', reason: 'execution_error', transcriptHash: hash }
    } finally {
      // release 失敗は元の結果を success に変えない（TTL で自然回復）。
      await deps.lock.release(interviewId).catch(() => {})
    }
  }

  // 6) ロック未指定（従来経路）: service を retry 付きで実行。
  let result: EvaluationServiceResult
  try {
    result = await runService()
  } catch {
    return { status: 'failed', reason: 'execution_error' }
  }
  return mapServiceResult(result)
}

// service 結果 → run 結果（失敗と insufficient_data を混同しない）。
function mapServiceResult(result: EvaluationServiceResult): EvaluationRunResult {
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

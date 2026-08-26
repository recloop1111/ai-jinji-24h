// PR-R1-A: 評価パイプラインの「本番 runtime 結線」を組み立てる（service-role client + provider → orchestration deps）。
//   route は薄く保ち、DB 解決・依存構築はここへ集約（fake client でユニットテスト可能）。
//   ※ 本 PR では gate OFF・API Key 無しのため実行時に provider へ到達しない（route が gate で先に弾く）。
//   ※ loadInterviewContext / loadTranscriptRows は service-role で解決（client 入力を信用しない）。

import { EvaluationService, type EvaluationProvider } from './service'
import { createSupabaseEvaluationRepository, type EvaluationDbClient } from './supabase-repository'
import { createEvaluationLock, createSupabaseEvaluationLockStore, type PgLikeClient } from './lock'
import { createEvaluationCooldown, createSupabaseEvaluationCooldownStore, type CooldownDbClient } from './cooldown'
import { runInterviewEvaluation, type RunInterviewEvaluationDeps } from './orchestration'
import type { InterviewEvalContext, EvaluationAuthContext } from './eligibility'
import type { EvaluationJobContext } from './prompt'

// runtime が必要とする最小 Supabase client 形（select/eq/order/maybeSingle + repo/lock/cooldown 形）。
export interface EvalRuntimeQuery {
  select(cols: string): EvalRuntimeQuery
  eq(col: string, val: string): EvalRuntimeQuery
  order(col: string, opts: { ascending: boolean }): EvalRuntimeQuery
  maybeSingle(): Promise<{ data: unknown; error: unknown }>
  then<T>(onfulfilled: (v: { data: unknown; error: unknown }) => T): Promise<T>
}
export interface EvalRuntimeClient {
  from(table: string): EvalRuntimeQuery
}

// interviews + applicants を service-role で解決（tenant / status 整合は eligibility 側で検証）。
export async function loadInterviewContextFromDb(
  client: EvalRuntimeClient,
  interviewId: string,
): Promise<InterviewEvalContext | null> {
  const iv = await client.from('interviews').select('id, applicant_id, status, end_reason').eq('id', interviewId).maybeSingle()
  if (iv.error || !iv.data || typeof iv.data !== 'object') return null
  const ivRow = iv.data as Record<string, unknown>
  const applicantId = typeof ivRow.applicant_id === 'string' ? ivRow.applicant_id : ''
  if (!applicantId) return null
  const ap = await client.from('applicants').select('id, company_id').eq('id', applicantId).maybeSingle()
  if (ap.error || !ap.data || typeof ap.data !== 'object') return null
  const apRow = ap.data as Record<string, unknown>
  return {
    interview: {
      id: String(ivRow.id ?? interviewId),
      applicantId,
      status: typeof ivRow.status === 'string' ? ivRow.status : '',
      endReason: typeof ivRow.end_reason === 'string' ? ivRow.end_reason : null,
    },
    applicant: { id: applicantId, companyId: typeof apRow.company_id === 'string' ? apRow.company_id : '' },
  }
}

// interview_transcripts の生 rows を service-role で取得（seq 昇順・最小列）。内部 schema は解釈せず public 関数へ渡す。
export async function loadTranscriptRowsFromDb(client: EvalRuntimeClient, interviewId: string): Promise<unknown> {
  const res = await client
    .from('interview_transcripts')
    .select('speaker, text, seq, final, source')
    .eq('interview_id', interviewId)
    .order('seq', { ascending: true })
    .then((r) => r)
  if (res.error || !Array.isArray(res.data)) return []
  return res.data
}

export interface BuildEvalDepsInput {
  client: unknown // service-role client（as unknown で受け、各 adapter が最小形へ）
  provider: EvaluationProvider
  gate: () => boolean
  jobContext?: EvaluationJobContext | null
}

// orchestration deps を本番構成で組み立てる（repo/lock/cooldown = Supabase 実装、provider = 注入）。
export function buildProductionEvaluationDeps(input: BuildEvalDepsInput): RunInterviewEvaluationDeps {
  const c = input.client
  const repo = createSupabaseEvaluationRepository(c as EvaluationDbClient)
  const lock = createEvaluationLock(createSupabaseEvaluationLockStore(c as PgLikeClient))
  const cooldown = createEvaluationCooldown(createSupabaseEvaluationCooldownStore(c as CooldownDbClient))
  const service = new EvaluationService(input.provider, repo)
  return {
    gate: input.gate,
    loadInterviewContext: (id) => loadInterviewContextFromDb(c as EvalRuntimeClient, id),
    loadTranscriptRows: (id) => loadTranscriptRowsFromDb(c as EvalRuntimeClient, id),
    service,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    jobContext: input.jobContext ?? null,
    lock,
    repo,
    cooldown,
  }
}

// 便宜: 内部トリガーの一括実行（auth=internal）。
export function runProductionEvaluation(input: {
  interviewId: string
  deps: RunInterviewEvaluationDeps
  auth?: EvaluationAuthContext
}) {
  return runInterviewEvaluation({ interviewId: input.interviewId, auth: input.auth ?? { kind: 'internal' }, deps: input.deps })
}

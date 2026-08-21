// PR-4E-3: 本番評価の依存を組み立てる server-only factory（未配線・gate OFF 時は route が到達前に停止）。
//
// 【重要 / server-only・副作用なし】
//   * server-only（`server-only` パッケージ未導入のため header で明示）。service-role client を扱うため
//     client component から import しない。本 factory はどの client bundle にも入らない。
//   * import しただけで DB/network access しない。create しただけでも OpenAI network access しない
//     （client / fetchImpl は「注入」・provider/repo/lock は create で副作用なし）。実 method 呼び出し時のみ副作用。
//   * 本 PR では Production runtime からこの依存を実行しない（route が gate OFF で 503・実 fetch/DB へ到達しない）。

import { EvaluationService } from './service'
import { createSupabaseEvaluationRepository, type EvaluationDbClient } from './supabase-repository'
import { createEvaluationLock, createSupabaseEvaluationLockStore, type PgLikeClient } from './lock'
import { createOpenAIEvaluationProvider, type FetchImpl } from './openai-provider'
import { isEvaluationEnabled } from '../config/evaluation'
import type { RunInterviewEvaluationDeps } from './orchestration'
import type { InterviewEvalContext } from './eligibility'

// loader が使う最小 client 形（select/eq/order/maybeSingle）。実 Supabase client も fake も満たす。
interface LoaderDbQuery {
  select(cols: string): LoaderDbQuery
  eq(col: string, val: string): LoaderDbQuery
  order(col: string, opts: { ascending: boolean }): Promise<{ data: unknown; error: unknown }>
  maybeSingle(): Promise<{ data: unknown; error: unknown }>
}
interface LoaderDbClient {
  from(table: string): LoaderDbQuery
}

export interface ProductionEvaluationDepsOptions {
  client: unknown // route が createServiceRoleClient() を渡す（service-role・RLS bypass）
  fetchImpl: FetchImpl // route が server-side fetch を渡す
  apiKey: string | null // route が process.env.OPENAI_API_KEY を渡す（server-only）
  model: string | null // route が resolveEvaluationModel() を渡す（ハードコードしない）
  now?: () => number
}

// interview → applicant をサーバ解決（client 入力の applicant_id を信用しない）。
function makeContextLoader(client: LoaderDbClient) {
  return async (interviewId: string): Promise<InterviewEvalContext | null> => {
    const iv = await client.from('interviews').select('id, applicant_id, status, end_reason').eq('id', interviewId).maybeSingle()
    if (iv.error || !iv.data || typeof iv.data !== 'object') return null
    const ivRow = iv.data as Record<string, unknown>
    const applicantId = typeof ivRow.applicant_id === 'string' ? ivRow.applicant_id : ''
    if (!applicantId) return null
    const app = await client.from('applicants').select('id, company_id').eq('id', applicantId).maybeSingle()
    if (app.error || !app.data || typeof app.data !== 'object') return null
    const appRow = app.data as Record<string, unknown>
    return {
      interview: {
        id: String(ivRow.id ?? ''),
        applicantId,
        status: typeof ivRow.status === 'string' ? ivRow.status : '',
        endReason: typeof ivRow.end_reason === 'string' ? ivRow.end_reason : null,
      },
      applicant: { id: String(appRow.id ?? ''), companyId: typeof appRow.company_id === 'string' ? appRow.company_id : '' },
    }
  }
}

// interview_transcripts の生 rows を seq 昇順で取得（PR-3 public 境界へ渡す）。legacy interview_logs へ fallback しない。
function makeTranscriptLoader(client: LoaderDbClient) {
  return async (interviewId: string): Promise<unknown> => {
    const res = await client
      .from('interview_transcripts')
      .select('id, interview_id, speaker, text, seq, final, source, dedup_key, language, created_at')
      .eq('interview_id', interviewId)
      .order('seq', { ascending: true })
    if (res.error || !Array.isArray(res.data)) return []
    return res.data
  }
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// 本番依存を組み立てる（副作用なし）。gate は isEvaluationEnabled（route が先に 503 で止めるため二重防御）。
export function createProductionEvaluationDependencies(opts: ProductionEvaluationDepsOptions): RunInterviewEvaluationDeps {
  const repo = createSupabaseEvaluationRepository(opts.client as EvaluationDbClient)
  const lock = createEvaluationLock(createSupabaseEvaluationLockStore(opts.client as PgLikeClient), { now: opts.now })
  const provider = createOpenAIEvaluationProvider({
    fetchImpl: opts.fetchImpl,
    apiKey: opts.apiKey,
    model: opts.model,
  })
  const service = new EvaluationService(provider, repo, { now: () => (opts.now ? new Date(opts.now()).toISOString() : new Date().toISOString()) })
  const loaderClient = opts.client as LoaderDbClient

  return {
    gate: isEvaluationEnabled,
    loadInterviewContext: makeContextLoader(loaderClient),
    loadTranscriptRows: makeTranscriptLoader(loaderClient),
    service,
    sleep: realSleep,
    lock,
    repo,
  }
}

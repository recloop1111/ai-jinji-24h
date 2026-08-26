import { describe, it, expect } from 'vitest'
import { loadInterviewContextFromDb, loadTranscriptRowsFromDb, buildProductionEvaluationDeps } from './runtime'
import { createDeterministicMockProvider } from './mock-provider'
import type { EvalRuntimeClient, EvalRuntimeQuery } from './runtime'

// PR-R1-A: 評価 runtime 結線（service-role 解決 + deps 構築）を fake client で固定（実 DB/OpenAI なし）。

// テーブル/条件ごとに固定レスポンスを返す fake client。
function fakeClient(handlers: Record<string, (col: string, val: string) => { data: unknown; error: unknown }>): EvalRuntimeClient {
  const makeQuery = (table: string): EvalRuntimeQuery => {
    let lastCol = ''
    let lastVal = ''
    const q: EvalRuntimeQuery = {
      select: () => q,
      eq: (col, val) => {
        lastCol = col
        lastVal = val
        return q
      },
      order: () => q,
      maybeSingle: async () => handlers[table](lastCol, lastVal),
      then: (onf) => Promise.resolve(handlers[table](lastCol, lastVal)).then(onf),
    }
    return q
  }
  return { from: (t) => makeQuery(t) }
}

describe('loadInterviewContextFromDb', () => {
  it('interview + applicant を解決（server 権威・snake→camel）', async () => {
    const client = fakeClient({
      interviews: () => ({ data: { id: 'iv-1', applicant_id: 'app-1', status: 'completed', end_reason: null }, error: null }),
      applicants: () => ({ data: { id: 'app-1', company_id: 'co-1' }, error: null }),
    })
    const ctx = await loadInterviewContextFromDb(client, 'iv-1')
    expect(ctx).toEqual({
      interview: { id: 'iv-1', applicantId: 'app-1', status: 'completed', endReason: null },
      applicant: { id: 'app-1', companyId: 'co-1' },
    })
  })
  it('interview 不在 → null', async () => {
    const client = fakeClient({ interviews: () => ({ data: null, error: null }), applicants: () => ({ data: null, error: null }) })
    expect(await loadInterviewContextFromDb(client, 'iv-x')).toBeNull()
  })
  it('applicant 不在 → null', async () => {
    const client = fakeClient({
      interviews: () => ({ data: { id: 'iv-1', applicant_id: 'app-1', status: 'completed' }, error: null }),
      applicants: () => ({ data: null, error: null }),
    })
    expect(await loadInterviewContextFromDb(client, 'iv-1')).toBeNull()
  })
})

describe('loadTranscriptRowsFromDb', () => {
  it('rows をそのまま返す（seq 昇順・内部 schema を解釈しない）', async () => {
    const rows = [{ speaker: 'interviewer', text: 'a', seq: 1, final: true, source: 'realtime' }]
    const client = fakeClient({ interview_transcripts: () => ({ data: rows, error: null }) })
    expect(await loadTranscriptRowsFromDb(client, 'iv-1')).toEqual(rows)
  })
  it('error/非配列 → []（crash しない）', async () => {
    const client = fakeClient({ interview_transcripts: () => ({ data: null, error: { code: 'x' } }) })
    expect(await loadTranscriptRowsFromDb(client, 'iv-1')).toEqual([])
  })
})

describe('buildProductionEvaluationDeps', () => {
  it('gate を透過し、repo/lock/cooldown/service/sleep を備えた deps を返す', () => {
    const client = fakeClient({
      interviews: () => ({ data: null, error: null }),
      applicants: () => ({ data: null, error: null }),
      interview_transcripts: () => ({ data: [], error: null }),
    })
    const provider = createDeterministicMockProvider({ mode: 'normal' })
    const deps = buildProductionEvaluationDeps({ client, provider, gate: () => false })
    expect(deps.gate()).toBe(false)
    expect(typeof deps.loadInterviewContext).toBe('function')
    expect(typeof deps.loadTranscriptRows).toBe('function')
    expect(deps.lock).toBeTruthy()
    expect(deps.repo).toBeTruthy()
    expect(deps.cooldown).toBeTruthy()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { runInterviewEvaluation, type RunInterviewEvaluationDeps } from './orchestration'
import { EvaluationService, FakeEvaluationProvider, InMemoryEvaluationRepository, type ProviderResult, type EvaluationRepository } from './service'
import { EBCA_AXIS_IDS } from './ebca'
import type { InterviewEvalContext, EvaluationAuthContext } from './eligibility'
import { FIXTURE_SUFFICIENT, FIXTURE_NO_APPLICANT } from './fixtures'

// PR-4E-2: PR-3〜PR-4 横断の Fake E2E（OpenAI/DB 未接続・synthetic のみ・実 network/DB = 0）。

const validRaw = () => ({
  schema_version: 'ebca-1',
  overall: { status: 'ok', score: 999, recommendation: 'yes', confidence: 'medium' },
  summary: 'x',
  axes: EBCA_AXIS_IDS.map((id, i) => ({
    axis_id: id,
    score: [16, 14, 12, 15, 13, 17][i],
    rank: 'B',
    confidence: 'high',
    insufficient_reason: null,
    evidence: [{ seq: 4, quote: '提案内容を変えていました' }],
    comment: 'c',
  })),
  strengths: [],
  concerns: [],
  warnings: [],
})

const completedCtx: InterviewEvalContext = {
  interview: { id: 'iv-1', applicantId: 'app-1', status: 'completed' },
  applicant: { id: 'app-1', companyId: 'co-1' },
}
const companyAuth: EvaluationAuthContext = { kind: 'company', companyId: 'co-1' }

function makeDeps(opts: {
  provider?: ProviderResult | (() => ProviderResult)
  repo?: EvaluationRepository
  context?: InterviewEvalContext | null
  rows?: unknown
  gate?: boolean
  sleep?: (ms: number) => Promise<void>
} = {}): { deps: RunInterviewEvaluationDeps; providerSpy: ReturnType<typeof vi.fn>; repo: EvaluationRepository } {
  const providerSpy = vi.fn<() => ProviderResult>(typeof opts.provider === 'function' ? (opts.provider as () => ProviderResult) : () => (opts.provider ?? { ok: true, raw: validRaw() }) as ProviderResult)
  const repo = opts.repo ?? new InMemoryEvaluationRepository()
  const service = new EvaluationService(new FakeEvaluationProvider(providerSpy), repo)
  const deps: RunInterviewEvaluationDeps = {
    gate: () => opts.gate ?? true,
    loadInterviewContext: async () => (opts.context === undefined ? completedCtx : opts.context),
    loadTranscriptRows: async () => opts.rows ?? FIXTURE_SUFFICIENT,
    service,
    sleep: opts.sleep ?? (async () => {}),
  }
  return { deps, providerSpy, repo }
}

const run = (deps: RunInterviewEvaluationDeps, auth: EvaluationAuthContext = companyAuth) =>
  runInterviewEvaluation({ interviewId: 'iv-1', auth, deps })

describe('Fake E2E: runInterviewEvaluation', () => {
  it('A: completed + sufficient → success・保存', async () => {
    const { deps, repo } = makeDeps()
    const r = await run(deps)
    expect(r.status).toBe('success')
    expect((repo as InMemoryEvaluationRepository).all()).toHaveLength(1)
  })

  it('B: 同一 hash 再実行 → provider 追加 call なし / already_evaluated', async () => {
    const { deps, providerSpy } = makeDeps()
    const r1 = await run(deps)
    const r2 = await run(deps)
    expect(r1.status).toBe('success')
    expect(r2.status).toBe('already_evaluated')
    expect(providerSpy).toHaveBeenCalledTimes(1)
  })

  it('C: transcript 変更 → 新 hash で再評価', async () => {
    const { deps, providerSpy } = makeDeps()
    const r1 = await run(deps)
    // seq6 を変更（provider の evidence は seq4 を quote するので seq4 は不変＝評価は成立、hash は変わる）。
    const changedRows = FIXTURE_SUFFICIENT.map((row) => (row.seq === 6 ? { ...row, text: '別の回答に変更しました。' } : row))
    const deps2 = { ...deps, loadTranscriptRows: async () => changedRows }
    const r2 = await runInterviewEvaluation({ interviewId: 'iv-1', auth: companyAuth, deps: deps2 })
    expect(r2.status).toBe('success')
    expect(r1.transcriptHash).not.toBe(r2.transcriptHash)
    expect(providerSpy).toHaveBeenCalledTimes(2)
  })

  it('D: final 応募者発話なし → insufficient・provider 未呼出', async () => {
    const { deps, providerSpy } = makeDeps({ rows: FIXTURE_NO_APPLICANT })
    const r = await run(deps)
    expect(r.status).toBe('insufficient_data')
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('E: partial だけ → insufficient', async () => {
    const partialOnly = [
      { id: '1', interview_id: 'iv-1', speaker: 'interviewer' as const, text: 'Q', seq: 1, final: true, source: 'synthetic' as const, dedup_key: null },
      { id: '2', interview_id: 'iv-1', speaker: 'applicant' as const, text: 'えー', seq: 2, final: false, source: 'synthetic' as const, dedup_key: null },
    ]
    const { deps } = makeDeps({ rows: partialOnly })
    expect((await run(deps)).status).toBe('insufficient_data')
  })

  it('F: in_progress → conflict・provider 未呼出', async () => {
    const { deps, providerSpy } = makeDeps({ context: { ...completedCtx, interview: { ...completedCtx.interview, status: 'in_progress' } } })
    const r = await run(deps)
    expect(r).toMatchObject({ status: 'conflict', reason: 'in_progress' })
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('G: cancelled → conflict(not_completed)', async () => {
    const { deps } = makeDeps({ context: { ...completedCtx, interview: { ...completedCtx.interview, status: 'cancelled' } } })
    expect(await run(deps)).toMatchObject({ status: 'conflict', reason: 'not_completed' })
  })

  it('H: cross-company → unauthorized・provider 未呼出', async () => {
    const { deps, providerSpy } = makeDeps()
    const r = await run(deps, { kind: 'company', companyId: 'co-OTHER' })
    expect(r).toMatchObject({ status: 'unauthorized' })
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('I: cross-applicant（context 不整合）→ not_found', async () => {
    const { deps } = makeDeps({ context: { ...completedCtx, interview: { ...completedCtx.interview, applicantId: 'app-2' } } })
    expect(await run(deps, { kind: 'admin' })).toMatchObject({ status: 'not_found' })
  })

  it('J/K: interview/applicant 不存在（context null）→ not_found', async () => {
    const { deps, providerSpy } = makeDeps({ context: null })
    expect((await run(deps)).status).toBe('not_found')
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('L: provider 常に temporary → retry 上限で failed（3 calls / 2 sleeps）', async () => {
    const sleep = vi.fn(async () => {})
    const { deps, providerSpy } = makeDeps({ provider: () => ({ ok: false, failure: 'temporary' }), sleep })
    const r = await run(deps)
    expect(r).toMatchObject({ status: 'failed', reason: 'provider_temporary' })
    expect(providerSpy).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('M/N: temporary（429/5xx/timeout 相当）を経て成功 → success', async () => {
    let n = 0
    const sleep = vi.fn(async () => {})
    const { deps, providerSpy } = makeDeps({ provider: () => (++n < 3 ? { ok: false, failure: 'temporary' } : { ok: true, raw: validRaw() }), sleep })
    const r = await run(deps)
    expect(r.status).toBe('success')
    expect(providerSpy).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('O: permanent（auth/config 相当）→ retry しない・failed', async () => {
    const sleep = vi.fn(async () => {})
    const { deps, providerSpy } = makeDeps({ provider: () => ({ ok: false, failure: 'permanent' }), sleep })
    const r = await run(deps)
    expect(r).toMatchObject({ status: 'failed', reason: 'provider_permanent' })
    expect(providerSpy).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('P: malformed AI output（ok:true garbage）→ insufficient（捏造しない）', async () => {
    const { deps } = makeDeps({ provider: { ok: true, raw: 'garbage' } })
    expect((await run(deps)).status).toBe('insufficient_data')
  })

  it('Q: evidence hallucination → 4A で score null（raw を権威にしない）', async () => {
    const bad = () => {
      const raw = validRaw()
      raw.axes[0].evidence = [{ seq: 4, quote: '実在しない引用' }]
      return { ok: true, raw } as ProviderResult
    }
    const { deps } = makeDeps({ provider: bad })
    const r = await run(deps)
    expect(r.evaluation?.axes[0].score ?? null).toBeNull()
  })

  it('R: DB save failure → success にしない（failed・保存しない）', async () => {
    const failingRepo: EvaluationRepository = {
      findByInterviewAndHash: async () => null,
      save: async () => {
        throw new Error('EVAL_REPO_WRITE_ERROR')
      },
    }
    const { deps } = makeDeps({ repo: failingRepo })
    expect(await run(deps)).toMatchObject({ status: 'failed', reason: 'execution_error' })
  })

  it('S: repo read failure → safe failure', async () => {
    const failingRepo: EvaluationRepository = {
      findByInterviewAndHash: async () => {
        throw new Error('EVAL_REPO_READ_ERROR')
      },
      save: async () => {
        throw new Error('unused')
      },
    }
    const { deps } = makeDeps({ repo: failingRepo })
    expect((await run(deps)).status).toBe('failed')
  })

  it('T/U: 逐次 duplicate は already_evaluated / hash は決定的', async () => {
    const { deps } = makeDeps()
    const r1 = await run(deps)
    const r2 = await run(deps)
    expect(r2.status).toBe('already_evaluated')
    expect(r1.transcriptHash).toBe(r2.transcriptHash) // 決定的
  })

  it('V: 結果 reason は非 PII code のみ（本文を含めない）', async () => {
    const { deps } = makeDeps({ provider: () => ({ ok: false, failure: 'permanent' }) })
    const r = await run(deps)
    expect(r.reason).toBe('provider_permanent')
    expect(JSON.stringify(r)).not.toContain('顧客ごとに') // transcript 本文を含まない
  })

  it('W: protected attribute は保存 domain へ入らない', async () => {
    const withProtected = () => ({ ok: true, raw: { ...validRaw(), personality_type: 'INTJ', age: 30 } } as ProviderResult)
    const { deps, repo } = makeDeps({ provider: withProtected })
    await run(deps)
    const saved = JSON.stringify((repo as InMemoryEvaluationRepository).all()[0].record)
    expect(saved).not.toContain('INTJ')
  })

  it('X: legacy culture/personality を writer が書かない', async () => {
    const { deps, repo } = makeDeps()
    await run(deps)
    const rec = (repo as InMemoryEvaluationRepository).all()[0].record
    expect(rec).not.toHaveProperty('personality_type')
    expect(JSON.stringify(rec.detail_json)).not.toContain('culture_fit')
    expect(JSON.stringify(rec.detail_json)).not.toContain('big_five')
  })

  it('gate OFF → failed(gate_disabled)・provider 未呼出', async () => {
    const { deps, providerSpy } = makeDeps({ gate: false })
    expect(await run(deps)).toMatchObject({ status: 'failed', reason: 'gate_disabled' })
    expect(providerSpy).not.toHaveBeenCalled()
  })
})

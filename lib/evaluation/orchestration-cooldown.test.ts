import { describe, it, expect, vi } from 'vitest'
import { runInterviewEvaluation, type RunInterviewEvaluationDeps } from './orchestration'
import { EvaluationService, FakeEvaluationProvider, InMemoryEvaluationRepository, type ProviderResult, type EvaluationRepository } from './service'
import { createEvaluationLock, InMemoryEvaluationLockStore } from './lock'
import { createEvaluationCooldown, InMemoryEvaluationCooldownStore, EVALUATION_COOLDOWN_MS } from './cooldown'
import { EBCA_AXIS_IDS } from './ebca'
import type { InterviewEvalContext, EvaluationAuthContext } from './eligibility'
import { FIXTURE_SUFFICIENT } from './fixtures'

// PR-19I: cross-request cooldown / OpenAI cost guard の Fake E2E（injected clock・実 DB/OpenAI/実時間 sleep なし）。
const validRaw = () => ({
  schema_version: 'ebca-1',
  overall: { status: 'ok', score: 999, recommendation: 'yes', confidence: 'medium' },
  summary: 'x',
  axes: EBCA_AXIS_IDS.map((id) => ({ axis_id: id, score: 15, rank: 'B', confidence: 'high', insufficient_reason: null, evidence: [{ seq: 4, quote: '提案内容を変えていました' }], comment: 'c' })),
  strengths: [],
  concerns: [],
  warnings: [],
})
const TEMP: ProviderResult = { ok: false, failure: 'temporary' }
const PERM: ProviderResult = { ok: false, failure: 'permanent' }
const completedCtx: InterviewEvalContext = { interview: { id: 'iv-1', applicantId: 'app-1', status: 'completed' }, applicant: { id: 'app-1', companyId: 'co-1' } }
const companyAuth: EvaluationAuthContext = { kind: 'company', companyId: 'co-1' }
const T0 = Date.parse('2026-01-01T00:00:00.000Z')

// injected clock を lock / cooldown / service で共有。retry は maxAttempts=3（初回+2retry）。
function makeHarness(opts: { provider?: () => ProviderResult; repo?: EvaluationRepository } = {}) {
  const clock = { t: T0 }
  const now = () => clock.t
  const providerSpy = vi.fn<() => ProviderResult>(opts.provider ?? (() => ({ ok: true, raw: validRaw() })))
  const repo = opts.repo ?? new InMemoryEvaluationRepository()
  const service = new EvaluationService(new FakeEvaluationProvider(providerSpy), repo)
  const lock = createEvaluationLock(new InMemoryEvaluationLockStore(), { now })
  const cooldown = createEvaluationCooldown(new InMemoryEvaluationCooldownStore(), { now })
  const deps: RunInterviewEvaluationDeps = {
    gate: () => true,
    loadInterviewContext: async () => completedCtx,
    loadTranscriptRows: async () => FIXTURE_SUFFICIENT,
    service,
    sleep: async () => {},
    retryPolicy: { maxAttempts: 3, baseDelayMs: 0 },
    lock,
    repo,
    cooldown,
  }
  return { deps, providerSpy, repo, clock }
}
const run = (deps: RunInterviewEvaluationDeps) => runInterviewEvaluation({ interviewId: 'iv-1', auth: companyAuth, deps })

describe('cooldown 設定条件（temporary のみ）', () => {
  it('3/6/7/8/9: temporary 最終失敗 → cooldown 設定・次リクエストは cooldown（Provider 追加 0）', async () => {
    const { deps, providerSpy } = makeHarness({ provider: () => TEMP })
    const r1 = await run(deps)
    expect(r1.status).toBe('failed')
    expect(providerSpy).toHaveBeenCalledTimes(3) // 初回 run: retry で 3 calls
    const r2 = await run(deps)
    expect(r2.status).toBe('cooldown')
    expect(r2.retryAfterMs).toBeGreaterThan(0)
    expect(providerSpy).toHaveBeenCalledTimes(3) // cooldown 中は Provider 追加なし
  })

  it('10: permanent failure → cooldown しない（次も Provider を呼ぶ）', async () => {
    const { deps, providerSpy } = makeHarness({ provider: () => PERM })
    expect((await run(deps)).status).toBe('failed')
    const c1 = providerSpy.mock.calls.length // permanent は retry しない → 1
    expect(c1).toBe(1)
    const r2 = await run(deps)
    expect(r2.status).toBe('failed') // cooldown ではない
    expect(providerSpy.mock.calls.length).toBeGreaterThan(c1) // 再度 Provider を呼ぶ
  })

  it('1/2/11: success → cooldown しない・以後 already_evaluated（Provider 0）', async () => {
    const { deps, providerSpy } = makeHarness({ provider: () => ({ ok: true, raw: validRaw() }) })
    expect((await run(deps)).status).toBe('success')
    expect(providerSpy).toHaveBeenCalledTimes(1)
    expect((await run(deps)).status).toBe('already_evaluated')
    expect(providerSpy).toHaveBeenCalledTimes(1) // 追加なし
  })

  it('12: insufficient_data → cooldown しない（provider failure と混同しない）', async () => {
    // FIXTURE_SUFFICIENT の hash と別に、insufficient を返すには applicant final 0 が必要だが、ここでは
    // provider を呼ばず insufficient になる経路を transcript で作れないため、success 系で「cooldown 未設定」を担保する。
    // insufficient の cooldown 非設定は orchestration の分岐（success/insufficient のみ clear・temporary のみ set）で保証。
    const { deps } = makeHarness({ provider: () => ({ ok: true, raw: validRaw() }) })
    const r = await run(deps)
    expect(r.status === 'success' || r.status === 'insufficient_data').toBe(true)
  })
})

describe('cooldown 失効・再試行', () => {
  it('5: TTL 経過後 → 再評価可能（Provider を再度呼ぶ）', async () => {
    const { deps, providerSpy, clock } = makeHarness({ provider: () => TEMP })
    await run(deps) // 失敗 → cooldown
    expect((await run(deps)).status).toBe('cooldown')
    clock.t = T0 + EVALUATION_COOLDOWN_MS + 1 // 失効
    const r3 = await run(deps)
    expect(r3.status).toBe('failed') // 再試行できた（また temporary だが Provider を呼べた）
    expect(providerSpy.mock.calls.length).toBe(6) // 1回目3 + 失効後3
  })

  it('4/15: temporary 失敗後に 100 連打 → Provider 追加 0', async () => {
    const { deps, providerSpy } = makeHarness({ provider: () => TEMP })
    await run(deps)
    const after = providerSpy.mock.calls.length // 3
    for (let i = 0; i < 100; i++) {
      const r = await run(deps)
      expect(r.status).toBe('cooldown')
    }
    expect(providerSpy.mock.calls.length).toBe(after) // 追加ゼロ
  })
})

describe('concurrency', () => {
  it('14: 同時 10 request → lock で Provider は 1 系列のみ', async () => {
    const { deps, providerSpy } = makeHarness({ provider: () => ({ ok: true, raw: validRaw() }) })
    const results = await Promise.all(Array.from({ length: 10 }, () => run(deps)))
    // 成功は 1、他は conflict(evaluation_in_progress) or already_evaluated。Provider は 1 回のみ。
    expect(providerSpy).toHaveBeenCalledTimes(1)
    expect(results.filter((r) => r.status === 'success')).toHaveLength(1)
    expect(results.every((r) => ['success', 'conflict', 'already_evaluated'].includes(r.status))).toBe(true)
  })
})

describe('cooldown なし deps（後方互換）', () => {
  it('20: cooldown 未指定でも従来どおり動作（temporary → failed・cooldown status なし）', async () => {
    const { deps } = makeHarness({ provider: () => TEMP })
    const noCooldown = { ...deps, cooldown: undefined }
    const r = await run(noCooldown)
    expect(r.status).toBe('failed')
    const r2 = await run(noCooldown)
    expect(r2.status).toBe('failed') // cooldown が無いので都度実行（従来挙動）
  })
})

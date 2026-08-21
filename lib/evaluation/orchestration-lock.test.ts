import { describe, it, expect, vi } from 'vitest'
import { runInterviewEvaluation, type RunInterviewEvaluationDeps } from './orchestration'
import { EvaluationService, FakeEvaluationProvider, InMemoryEvaluationRepository, type ProviderResult, type EvaluationRepository, type StoredEvaluation } from './service'
import type { EvaluationLock, LockClaimOutcome } from './lock'
import { EBCA_AXIS_IDS } from './ebca'
import type { InterviewEvalContext, EvaluationAuthContext } from './eligibility'
import { FIXTURE_SUFFICIENT } from './fixtures'

// PR-4E-3: 並行ロック + double-check idempotency（二重課金防止）の Fake E2E。
const validRaw = () => ({
  schema_version: 'ebca-1',
  overall: { status: 'ok', score: 999, recommendation: 'yes', confidence: 'medium' },
  summary: 'x',
  axes: EBCA_AXIS_IDS.map((id) => ({ axis_id: id, score: 15, rank: 'B', confidence: 'high', insufficient_reason: null, evidence: [{ seq: 4, quote: '提案内容を変えていました' }], comment: 'c' })),
  strengths: [],
  concerns: [],
  warnings: [],
})
const completedCtx: InterviewEvalContext = { interview: { id: 'iv-1', applicantId: 'app-1', status: 'completed' }, applicant: { id: 'app-1', companyId: 'co-1' } }
const companyAuth: EvaluationAuthContext = { kind: 'company', companyId: 'co-1' }

class ControllableLock implements EvaluationLock {
  result: LockClaimOutcome = 'acquired'
  acquireSpy = vi.fn()
  releaseSpy = vi.fn()
  releaseThrows = false
  async acquire(id: string): Promise<LockClaimOutcome> {
    this.acquireSpy(id)
    return this.result
  }
  async release(id: string): Promise<void> {
    this.releaseSpy(id)
    if (this.releaseThrows) throw new Error('release failed')
  }
}

function makeDeps(opts: { provider?: () => ProviderResult; repo?: EvaluationRepository; lock?: ControllableLock; context?: InterviewEvalContext | null; gate?: boolean } = {}) {
  const providerSpy = vi.fn<() => ProviderResult>(opts.provider ?? (() => ({ ok: true, raw: validRaw() })))
  const repo = opts.repo ?? new InMemoryEvaluationRepository()
  const service = new EvaluationService(new FakeEvaluationProvider(providerSpy), repo)
  const lock = opts.lock ?? new ControllableLock()
  const loadCtxSpy = vi.fn(async () => (opts.context === undefined ? completedCtx : opts.context))
  const deps: RunInterviewEvaluationDeps = {
    gate: () => opts.gate ?? true,
    loadInterviewContext: loadCtxSpy,
    loadTranscriptRows: async () => FIXTURE_SUFFICIENT,
    service,
    sleep: async () => {},
    lock,
    repo,
  }
  return { deps, providerSpy, repo, lock, loadCtxSpy }
}
const run = (deps: RunInterviewEvaluationDeps, auth: EvaluationAuthContext = companyAuth) => runInterviewEvaluation({ interviewId: 'iv-1', auth, deps })

describe('lock orchestration', () => {
  it('A/X: gate OFF → failed(gate_disabled)・context/lock/provider いずれも未実行（副作用0）', async () => {
    const { deps, providerSpy, lock, loadCtxSpy } = makeDeps({ gate: false })
    expect(await run(deps)).toMatchObject({ status: 'failed', reason: 'gate_disabled' })
    expect(loadCtxSpy).not.toHaveBeenCalled()
    expect(lock.acquireSpy).not.toHaveBeenCalled()
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('C: cross-company → unauthorized・lock 未取得・provider 0', async () => {
    const { deps, providerSpy, lock } = makeDeps()
    expect(await run(deps, { kind: 'company', companyId: 'co-OTHER' })).toMatchObject({ status: 'unauthorized' })
    expect(lock.acquireSpy).not.toHaveBeenCalled()
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('M: success → 保存・lock は取得して release', async () => {
    const { deps, repo, lock } = makeDeps()
    const r = await run(deps)
    expect(r.status).toBe('success')
    expect((repo as InMemoryEvaluationRepository).all()).toHaveLength(1)
    expect(lock.acquireSpy).toHaveBeenCalledTimes(1)
    expect(lock.releaseSpy).toHaveBeenCalledTimes(1)
  })

  it('H/S: 同 hash 再実行 → pre-check で already_evaluated・2回目は lock を取らず provider 追加なし', async () => {
    const { deps, providerSpy, lock } = makeDeps()
    await run(deps)
    const r2 = await run(deps)
    expect(r2.status).toBe('already_evaluated')
    expect(providerSpy).toHaveBeenCalledTimes(1)
    expect(lock.acquireSpy).toHaveBeenCalledTimes(1) // 2回目は pre-check で停止（lock 取らない）
  })

  it('I/J: lock 競合（他リクエスト保持中）→ conflict(evaluation_in_progress)・provider 0', async () => {
    const lock = new ControllableLock()
    lock.result = 'contended'
    const { deps, providerSpy } = makeDeps({ lock })
    expect(await run(deps)).toMatchObject({ status: 'conflict', reason: 'evaluation_in_progress' })
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('lock error → failed(lock_error)・provider 0（fail-closed）', async () => {
    const lock = new ControllableLock()
    lock.result = 'error'
    const { deps, providerSpy } = makeDeps({ lock })
    expect(await run(deps)).toMatchObject({ status: 'failed', reason: 'lock_error' })
    expect(providerSpy).not.toHaveBeenCalled()
  })

  it('L: lock 取得後 double-check で既存評価発見 → already_evaluated・provider 0・release する', async () => {
    let calls = 0
    const stored: StoredEvaluation = { id: 'x', interviewId: 'iv-1', transcriptHash: 'h', record: { interview_id: 'iv-1', evaluation_axes: [], total_score: 70, detail_json: {} } }
    const repo: EvaluationRepository = {
      findByInterviewAndHash: async () => (++calls === 1 ? null : stored), // pre=null / lock 後=発見
      save: async () => stored,
    }
    const { deps, providerSpy, lock } = makeDeps({ repo })
    const r = await run(deps)
    expect(r.status).toBe('already_evaluated')
    expect(providerSpy).not.toHaveBeenCalled()
    expect(lock.acquireSpy).toHaveBeenCalledTimes(1)
    expect(lock.releaseSpy).toHaveBeenCalledTimes(1)
  })

  it('Q: lock release 失敗でも結果を success のまま（TTL 回復・誤って壊さない）', async () => {
    const lock = new ControllableLock()
    lock.releaseThrows = true
    const { deps } = makeDeps({ lock })
    expect((await run(deps)).status).toBe('success')
  })

  it('P: DB save failure → failed・release される（success にしない）', async () => {
    const repo: EvaluationRepository = {
      findByInterviewAndHash: async () => null,
      save: async () => {
        throw new Error('EVAL_REPO_WRITE_ERROR')
      },
    }
    const { deps, lock } = makeDeps({ repo })
    expect((await run(deps)).status).toBe('failed')
    expect(lock.releaseSpy).toHaveBeenCalledTimes(1)
  })
})

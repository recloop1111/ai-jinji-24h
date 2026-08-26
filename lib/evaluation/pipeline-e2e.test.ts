import { describe, it, expect } from 'vitest'
import { runInterviewEvaluation, type RunInterviewEvaluationDeps } from './orchestration'
import { EvaluationService, InMemoryEvaluationRepository, type EvaluationProvider, type ProviderResult } from './service'
import { createEvaluationLock, InMemoryEvaluationLockStore } from './lock'
import { createEvaluationCooldown, InMemoryEvaluationCooldownStore } from './cooldown'
import { createDeterministicMockProvider, type DeterministicMockConfig } from './mock-provider'
import { FIXTURE_SUFFICIENT, FIXTURE_NO_APPLICANT } from './fixtures'
import type { EvaluationPrompt } from './prompt'
import type { EvaluationAuthContext, InterviewEvalContext } from './eligibility'

// ============================================================================
// PR-P5 synthetic E2E: Transcript(synthetic) → P4 Input → 決定的 mock provider →
//   P4 validation/normalization/scoring → writer(InMemory interview_results) → 再読込 → 内容一致。
//   併せて 二重評価防止 / 同時実行防止 / cooldown / retry / cross-company isolation / gate OFF を固定。
//   OpenAI/Realtime/SMS/実DB へは一切到達しない（すべて注入 fake）。
// ============================================================================

const IV = 'iv-e2e-1'
const CO = 'co-1'
const APP = 'app-1'

// FIXTURE_SUFFICIENT の応募者 final 発話に実在する {seq, quote}（部分文字列）。
const EVIDENCE = [
  { seq: 2, quote: '法人営業' },
  { seq: 4, quote: '課題を整理' },
  { seq: 6, quote: '合意点' },
]

function completedContext(): InterviewEvalContext {
  return {
    interview: { id: IV, applicantId: APP, status: 'completed', endReason: null },
    applicant: { id: APP, companyId: CO },
  }
}

// provider 呼び出し回数を数える薄いラッパ（コスト増幅防止の検証用）。
function countingProvider(inner: EvaluationProvider): { provider: EvaluationProvider; calls: () => number } {
  let n = 0
  return {
    calls: () => n,
    provider: {
      async evaluate(p: EvaluationPrompt): Promise<ProviderResult> {
        n++
        return inner.evaluate(p)
      },
    },
  }
}

interface Harness {
  deps: RunInterviewEvaluationDeps
  repo: InMemoryEvaluationRepository
  providerCalls: () => number
}

function makeHarness(opts: {
  mockConfig: DeterministicMockConfig
  rows?: unknown
  gate?: boolean
  sharedLockStore?: InMemoryEvaluationLockStore
  sharedCooldownStore?: InMemoryEvaluationCooldownStore
  sharedRepo?: InMemoryEvaluationRepository
}): Harness {
  const repo = opts.sharedRepo ?? new InMemoryEvaluationRepository()
  const { provider, calls } = countingProvider(createDeterministicMockProvider(opts.mockConfig))
  const service = new EvaluationService(provider, repo)
  const lock = createEvaluationLock(opts.sharedLockStore ?? new InMemoryEvaluationLockStore())
  const cooldown = createEvaluationCooldown(opts.sharedCooldownStore ?? new InMemoryEvaluationCooldownStore())
  const deps: RunInterviewEvaluationDeps = {
    gate: () => opts.gate ?? true,
    loadInterviewContext: async () => completedContext(),
    loadTranscriptRows: async () => opts.rows ?? FIXTURE_SUFFICIENT,
    service,
    sleep: async () => {},
    jobContext: { title: '営業' },
    lock,
    repo,
    cooldown,
  }
  return { deps, repo, providerCalls: calls }
}

const companyAuth: EvaluationAuthContext = { kind: 'company', companyId: CO }

describe('P5 E2E — A: normal（全軸有効 evidence → success・保存・再読込一致）', () => {
  it('success で interview_results に保存され、再読込が一致する', async () => {
    const h = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })

    expect(res.status).toBe('success')
    expect(res.record?.total_score).toBeTypeOf('number')
    // 6軸すべて score 非 null（有効 evidence があるため）。
    const axes = res.record?.evaluation_axes as { axis: string; score: number | null; evidence: unknown[] }[]
    expect(axes).toHaveLength(6)
    expect(axes.every((a) => a.score !== null)).toBe(true)
    // 保存された内容 == repo 再読込内容（byte 一致）。
    const stored = await h.repo.findByInterviewAndHash(IV, res.transcriptHash!)
    expect(stored).not.toBeNull()
    expect(JSON.stringify(stored?.record)).toBe(JSON.stringify(res.record))
    // detail_json に本文/PII/prompt/transcript 全文を保存しない（メタと EBCA のみ）。
    const detail = res.record?.detail_json as Record<string, unknown>
    expect(detail.evaluation_meta).toBeTruthy()
    expect(JSON.stringify(detail)).not.toContain('法人営業を担当していました') // 発話全文は保存しない
    expect(h.providerCalls()).toBe(1)
  })
})

describe('P5 E2E — B: insufficient_data mode（全軸 null → insufficient_data）', () => {
  it('insufficient_data として保存され score=null', async () => {
    const h = makeHarness({ mockConfig: { mode: 'insufficient_data', evidenceSource: EVIDENCE } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('insufficient_data')
    expect(res.record?.total_score).toBeNull()
  })
})

describe('P5 E2E — C: malformed（object でない raw → crash せず insufficient_data）', () => {
  it('draft=null 経由で insufficient_data（例外を投げない）', async () => {
    const h = makeHarness({ mockConfig: { mode: 'malformed' } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('insufficient_data')
  })
})

describe('P5 E2E — D: no-evidence（score あるが evidence 無し → evidence-first で全 null）', () => {
  it('validateAxisEvidence が score を null 化し insufficient_data', async () => {
    const h = makeHarness({ mockConfig: { mode: 'no-evidence', evidenceSource: EVIDENCE } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('insufficient_data')
    const axes = res.record?.evaluation_axes as { score: number | null }[]
    expect(axes.every((a) => a.score === null)).toBe(true)
  })
})

describe('P5 E2E — E: out-of-range（範囲外 score → silent clamp せず null 正規化）', () => {
  it('999/-5/小数/Infinity は 20 に丸めず null になる', async () => {
    const h = makeHarness({ mockConfig: { mode: 'out-of-range', evidenceSource: EVIDENCE } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    const axes = res.record?.evaluation_axes as { score: number | null }[]
    // 範囲外はすべて null（0-20 の clamp 値には絶対にしない）。
    expect(axes.every((a) => a.score === null)).toBe(true)
    expect(axes.some((a) => a.score === 20)).toBe(false)
    expect(res.status).toBe('insufficient_data')
  })
})

describe('P5 E2E — F: partial-axis（一部軸のみ有効 evidence → 有効軸のみ score 生存）', () => {
  it('evidence を与えた軸のみ score 非 null', async () => {
    const h = makeHarness({ mockConfig: { mode: 'partial-axis', evidenceSource: EVIDENCE, partialAxisCount: 2 } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('success')
    const axes = res.record?.evaluation_axes as { score: number | null }[]
    const scored = axes.filter((a) => a.score !== null).length
    expect(scored).toBe(2)
  })
})

describe('P5 E2E — G: error（provider permanent → failed・保存しない）', () => {
  it('failed になり interview_results へ保存されない', async () => {
    const h = makeHarness({ mockConfig: { mode: 'error' } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('failed')
    expect(h.repo.all()).toHaveLength(0) // 部分保存しない
  })
})

describe('P5 E2E — H: timeout（provider throw → temporary → retry → failed・cooldown 設定）', () => {
  it('retry 上限まで試行し failed、保存されない', async () => {
    const h = makeHarness({ mockConfig: { mode: 'timeout' } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('failed')
    expect(h.repo.all()).toHaveLength(0)
    // maxAttempts=3（初回+2 retry）→ provider は 3 回呼ばれる（無限 retry しない）。
    expect(h.providerCalls()).toBe(3)
  })
})

describe('P5 E2E — I: cooldown（temporary 失敗後の連打は provider を呼ばない）', () => {
  it('2 回目は cooldown で即返し・provider 呼び出し増えない', async () => {
    const lockStore = new InMemoryEvaluationLockStore()
    const cdStore = new InMemoryEvaluationCooldownStore()
    const h1 = makeHarness({ mockConfig: { mode: 'timeout' }, sharedLockStore: lockStore, sharedCooldownStore: cdStore })
    const r1 = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h1.deps })
    expect(r1.status).toBe('failed')

    const h2 = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, sharedLockStore: lockStore, sharedCooldownStore: cdStore })
    const r2 = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h2.deps })
    expect(r2.status).toBe('cooldown')
    expect(r2.retryAfterMs).toBeGreaterThan(0)
    expect(h2.providerCalls()).toBe(0) // provider を呼ばずに抑制
  })
})

describe('P5 E2E — J: 二重評価防止（idempotency：同一 transcript は再評価で provider を呼ばない）', () => {
  it('2 回目は already_evaluated で provider を呼ばない', async () => {
    const repo = new InMemoryEvaluationRepository()
    const h1 = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, sharedRepo: repo })
    const r1 = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h1.deps })
    expect(r1.status).toBe('success')

    const h2 = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, sharedRepo: repo })
    const r2 = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h2.deps })
    expect(r2.status).toBe('already_evaluated')
    expect(h2.providerCalls()).toBe(0)
    expect(repo.all()).toHaveLength(1) // 1 interview 1 result
  })
})

describe('P5 E2E — K: 同時実行防止（lock 保持中の実行は conflict・provider 呼ばない）', () => {
  it('ロック保持中の評価は conflict になり provider に到達しない', async () => {
    const lockStore = new InMemoryEvaluationLockStore()
    const h = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, sharedLockStore: lockStore })
    // 別プロセスがロックを保持している状況を再現。
    const holder = createEvaluationLock(lockStore)
    expect(await holder.acquire(IV)).toBe('acquired')

    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('conflict')
    expect(h.providerCalls()).toBe(0)
    expect(h.repo.all()).toHaveLength(0)
  })

  it('並行 2 本のうち保存に成功するのは 1 本のみ（もう 1 本は conflict または already_evaluated）', async () => {
    const lockStore = new InMemoryEvaluationLockStore()
    const repo = new InMemoryEvaluationRepository()
    const hA = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, sharedLockStore: lockStore, sharedRepo: repo })
    const hB = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, sharedLockStore: lockStore, sharedRepo: repo })
    const [rA, rB] = await Promise.all([
      runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: hA.deps }),
      runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: hB.deps }),
    ])
    const statuses = [rA.status, rB.status].sort()
    // 片方は success、もう片方は conflict/already_evaluated。二重 success は起きない。
    expect(statuses.filter((s) => s === 'success')).toHaveLength(1)
    expect(repo.all()).toHaveLength(1)
  })
})

describe('P5 E2E — L: cross-company isolation（他社 auth → unauthorized・provider/保存に到達しない）', () => {
  it('他社 company auth は unauthorized で provider を呼ばない', async () => {
    const h = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE } })
    const otherCompany: EvaluationAuthContext = { kind: 'company', companyId: 'co-OTHER' }
    const res = await runInterviewEvaluation({ interviewId: IV, auth: otherCompany, deps: h.deps })
    expect(res.status).toBe('unauthorized')
    expect(h.providerCalls()).toBe(0)
    expect(h.repo.all()).toHaveLength(0)
  })
})

describe('P5 E2E — M: 未完了面接（in_progress → conflict・provider 呼ばない）', () => {
  it('completed 以外は評価しない', async () => {
    const h = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE } })
    const deps: RunInterviewEvaluationDeps = {
      ...h.deps,
      loadInterviewContext: async () => ({
        interview: { id: IV, applicantId: APP, status: 'in_progress', endReason: null },
        applicant: { id: APP, companyId: CO },
      }),
    }
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps })
    expect(res.status).toBe('conflict')
    expect(h.providerCalls()).toBe(0)
  })
})

describe('P5 E2E — N: gate OFF（provider/transcript-read/DB-write/lock に到達しない）', () => {
  it('gate=false は failed(gate_disabled) で副作用ゼロ', async () => {
    let transcriptLoaded = false
    const h = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, gate: false })
    const deps: RunInterviewEvaluationDeps = {
      ...h.deps,
      loadTranscriptRows: async () => {
        transcriptLoaded = true
        return FIXTURE_SUFFICIENT
      },
    }
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps })
    expect(res.status).toBe('failed')
    expect(res.reason).toBe('gate_disabled')
    expect(transcriptLoaded).toBe(false) // transcript 読取に到達しない
    expect(h.providerCalls()).toBe(0)
    expect(h.repo.all()).toHaveLength(0)
  })
})

describe('P5 E2E — evidence integrity（架空 seq/非部分文字列 quote は writer 前に破棄）', () => {
  it('存在しない seq を参照する evidence は無効化され score が null（hallucination を保存しない）', async () => {
    const h = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: [{ seq: 999, quote: '実在しない引用' }] } })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    const axes = res.record?.evaluation_axes as { score: number | null; evidence: unknown[] }[]
    // seq=999 は transcript に無い → 全 evidence 無効 → 全 score null → insufficient_data。
    expect(axes.every((a) => a.score === null)).toBe(true)
    expect(axes.every((a) => (a.evidence as unknown[]).length === 0)).toBe(true)
    expect(res.status).toBe('insufficient_data')
  })
})

describe('P5 E2E — 0-transcript（final 応募者発話なし → provider を呼ばず insufficient）', () => {
  it('cost guard：評価入力が無ければ provider に到達しない', async () => {
    const h = makeHarness({ mockConfig: { mode: 'normal', evidenceSource: EVIDENCE }, rows: FIXTURE_NO_APPLICANT })
    const res = await runInterviewEvaluation({ interviewId: IV, auth: companyAuth, deps: h.deps })
    expect(res.status).toBe('insufficient_data')
    expect(h.providerCalls()).toBe(0)
  })
})

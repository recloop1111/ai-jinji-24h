import { describe, it, expect } from 'vitest'
import { DeterministicMockEvaluationProvider, createDeterministicMockProvider, type MockEvaluationMode } from './mock-provider'
import { buildEvaluationPrompt } from './prompt'

// PR-P5: 決定的モック provider の性質を固定する（OpenAI 非接続）。
// 1) 同一 config + 同一 prompt → 常に同一 raw（決定的）。
// 2) mode ごとに provider レベルの返り（ok/error/timeout）が正しい。
// 3) Production ガード（gate ON / 非test runtime では throw）。

const prompt = buildEvaluationPrompt({ job: { title: '営業' }, transcriptText: '[面接官] x\n[応募者] y' })
const src = [{ seq: 2, quote: 'y' }]

describe('DeterministicMockEvaluationProvider: 決定性', () => {
  it('同一 config + 同一 prompt → raw は byte 同一（乱数/時刻に依存しない）', async () => {
    const a = await createDeterministicMockProvider({ mode: 'normal', evidenceSource: src }).evaluate(prompt)
    const b = await createDeterministicMockProvider({ mode: 'normal', evidenceSource: src }).evaluate(prompt)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    if (a.ok && b.ok) expect(JSON.stringify(a.raw)).toBe(JSON.stringify(b.raw))
  })

  it('mode=error → ok:false permanent（保存させない失敗）', async () => {
    const r = await createDeterministicMockProvider({ mode: 'error' }).evaluate(prompt)
    expect(r).toEqual({ ok: false, failure: 'permanent' })
  })

  it('mode=timeout → throw（service 側で temporary 失敗化される）', async () => {
    await expect(createDeterministicMockProvider({ mode: 'timeout' }).evaluate(prompt)).rejects.toThrow()
  })

  it('mode=malformed → ok:true だが raw は object でない（parse で draft=null になる）', async () => {
    const r = await createDeterministicMockProvider({ mode: 'malformed' }).evaluate(prompt)
    expect(r.ok).toBe(true)
    if (r.ok) expect(typeof r.raw).not.toBe('object')
  })

  it('各 mode で evaluate が crash しない', async () => {
    const modes: MockEvaluationMode[] = ['normal', 'insufficient_data', 'no-evidence', 'out-of-range', 'partial-axis']
    for (const mode of modes) {
      const r = await createDeterministicMockProvider({ mode, evidenceSource: src }).evaluate(prompt)
      expect(r.ok).toBe(true)
    }
  })
})

describe('DeterministicMockEvaluationProvider: Production 誤用ガード', () => {
  it('OPENAI_EVALUATION_ENABLED=true では構築できない（評価有効環境で mock 不可）', () => {
    const prev = process.env.OPENAI_EVALUATION_ENABLED
    process.env.OPENAI_EVALUATION_ENABLED = 'true'
    try {
      expect(() => new DeterministicMockEvaluationProvider({ mode: 'normal' })).toThrow(/test-only/)
    } finally {
      if (prev === undefined) delete process.env.OPENAI_EVALUATION_ENABLED
      else process.env.OPENAI_EVALUATION_ENABLED = prev
    }
  })

  it('bypass フラグ明示時のみガードを外せる（意図的テスト用）', () => {
    const prev = process.env.OPENAI_EVALUATION_ENABLED
    process.env.OPENAI_EVALUATION_ENABLED = 'true'
    try {
      expect(() => new DeterministicMockEvaluationProvider({ mode: 'normal', bypassProductionGuardForTest: true })).not.toThrow()
    } finally {
      if (prev === undefined) delete process.env.OPENAI_EVALUATION_ENABLED
      else process.env.OPENAI_EVALUATION_ENABLED = prev
    }
  })
})

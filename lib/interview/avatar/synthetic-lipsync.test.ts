import { describe, it, expect } from 'vitest'
import { nextSyntheticMouthState, nextSyntheticDelayMs, mulberry32, shouldRunSyntheticLipsync } from './synthetic-lipsync'
import { AVATAR_SYNTHETIC, type MouthState } from './avatar-config'

// demo 企業限定 Synthetic Avatar Driver の純ロジック（OpenAI/Realtime 非依存・seed で決定的）。

describe('shouldRunSyntheticLipsync: HARD guard（demo×speaking×remoteStream無しのみ ON）', () => {
  const base = { overlayEnabled: true, syntheticLipsync: true, visualState: 'speaking' as const, hasRemoteStream: false }
  it('1. demo + mock(speaking) + stream無し → ON', () => {
    expect(shouldRunSyntheticLipsync(base)).toBe(true)
  })
  it('2. demo + listening → OFF（口 closed）', () => {
    expect(shouldRunSyntheticLipsync({ ...base, visualState: 'listening' })).toBe(false)
  })
  it('3. demo + neutral → OFF（口 closed）', () => {
    expect(shouldRunSyntheticLipsync({ ...base, visualState: 'neutral' })).toBe(false)
  })
  it('4. normal company（syntheticLipsync=false） → OFF', () => {
    expect(shouldRunSyntheticLipsync({ ...base, syntheticLipsync: false })).toBe(false)
  })
  it('5/6. realtime（remoteStream あり） → OFF（実 audio 解析が優先）', () => {
    expect(shouldRunSyntheticLipsync({ ...base, hasRemoteStream: true })).toBe(false)
  })
  it('overlay 無効なら常に OFF', () => {
    expect(shouldRunSyntheticLipsync({ ...base, overlayEnabled: false })).toBe(false)
  })
})

describe('nextSyntheticMouthState: 自然な口の遷移（機械的な固定反復にしない）', () => {
  it('常に実在の 4 段階のいずれかを返す', () => {
    const rng = mulberry32(1)
    let s: MouthState = 'closed'
    for (let i = 0; i < 500; i++) {
      s = nextSyntheticMouthState(s, rng)
      expect(['closed', 'small', 'medium', 'large']).toContain(s)
    }
  })
  it('seed が同じなら決定的（test 再現可能）', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    let sa: MouthState = 'closed'
    let sb: MouthState = 'closed'
    for (let i = 0; i < 50; i++) {
      sa = nextSyntheticMouthState(sa, a)
      sb = nextSyntheticMouthState(sb, b)
      expect(sa).toBe(sb)
    }
  })
  it('closed からは必ず口が開く（閉じっぱなしにしない）', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = mulberry32(seed)
      const next = nextSyntheticMouthState('closed', rng)
      expect(['small', 'medium']).toContain(next) // closed→closed は無い
    }
  })
  it('large からは戻る（開けっ放しにしない＝large→large は無い）', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = mulberry32(seed)
      expect(nextSyntheticMouthState('large', rng)).not.toBe('large')
    }
  })
  it('固定周期の単純反復ではない（十分な多様性がある）', () => {
    const rng = mulberry32(7)
    const seen = new Set<MouthState>()
    let s: MouthState = 'closed'
    for (let i = 0; i < 200; i++) {
      s = nextSyntheticMouthState(s, rng)
      seen.add(s)
    }
    // 4 段階すべてが登場する（small/medium/large を主体に closed も稀に挟む）。
    expect(seen.size).toBeGreaterThanOrEqual(3)
    expect(seen.has('small')).toBe(true)
    expect(seen.has('medium')).toBe(true)
    expect(seen.has('large')).toBe(true)
  })
})

describe('nextSyntheticDelayMs: 人が喋る程度の自然な幅（高速フリッカーにしない）', () => {
  it('AVATAR_SYNTHETIC の [min,max] 範囲内', () => {
    const rng = mulberry32(3)
    for (let i = 0; i < 500; i++) {
      const d = nextSyntheticDelayMs(rng)
      expect(d).toBeGreaterThanOrEqual(AVATAR_SYNTHETIC.minDelayMs)
      expect(d).toBeLessThanOrEqual(AVATAR_SYNTHETIC.maxDelayMs)
    }
  })
  it('既定値は 100〜250ms 程度（フリッカー回避・目視確認できる速度）', () => {
    expect(AVATAR_SYNTHETIC.minDelayMs).toBeGreaterThanOrEqual(100)
    expect(AVATAR_SYNTHETIC.maxDelayMs).toBeLessThanOrEqual(250)
    expect(AVATAR_SYNTHETIC.minDelayMs).toBeLessThan(AVATAR_SYNTHETIC.maxDelayMs)
  })
})

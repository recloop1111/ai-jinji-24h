import { describe, it, expect } from 'vitest'
import {
  createSyntheticSpeechEnvelope,
  holdMouthState,
  mulberry32,
  shouldRunSyntheticLipsync,
} from './synthetic-lipsync'
import { smoothLevel, mouthStateForLevel } from './audio-analyzer'
import { AVATAR_SYNTHETIC, type MouthState } from './avatar-config'

// Synthetic Avatar Driver v2 の純ロジック（OpenAI/Realtime 非依存・seed で決定的）。
// v2: mouthState を直接選ばず energy envelope を生成し、本番と同じ smoothLevel→mouthStateForLevel へ通す。

// envelope を本番と同じ pipeline に通して可視 mouthState 列を得る（component と同じ手順・test 用ヘルパ）。
function renderStates(seed: number, totalMs: number, dtMs = AVATAR_SYNTHETIC.sampleIntervalMs) {
  const env = createSyntheticSpeechEnvelope(mulberry32(seed))
  let smoothed = 0
  let last: MouthState = 'closed'
  let lastChange = 0
  const states: { t: number; s: MouthState }[] = []
  for (let t = 0; t <= totalMs; t += dtMs) {
    smoothed = smoothLevel(smoothed, env.energyAt(t))
    const candidate = mouthStateForLevel(smoothed)
    const next = holdMouthState(last, candidate, lastChange, t)
    if (next !== last) {
      last = next
      lastChange = t
    }
    states.push({ t, s: last })
  }
  return states
}

describe('createSyntheticSpeechEnvelope: energy 直接生成（mouth を直接ランダム選択しない）', () => {
  it('energy は常に 0..1', () => {
    const env = createSyntheticSpeechEnvelope(mulberry32(1))
    for (let t = 0; t <= 30000; t += 25) {
      const e = env.energyAt(t)
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(1)
    }
  })
  it('seed が同じなら決定的（test 再現可能）', () => {
    const a = createSyntheticSpeechEnvelope(mulberry32(42))
    const b = createSyntheticSpeechEnvelope(mulberry32(42))
    for (let t = 0; t <= 12000; t += 50) expect(a.energyAt(t)).toBeCloseTo(b.energyAt(t), 10)
  })
  it('pause 区間で energy=0（closed が入る＝語間/文区切り）', () => {
    // 十分長く回すと必ず 0 の瞬間（pause / phrase 端）が出る。
    const env = createSyntheticSpeechEnvelope(mulberry32(7))
    let sawZero = false
    for (let t = 0; t <= 20000; t += 20) if (env.energyAt(t) === 0) { sawZero = true; break }
    expect(sawZero).toBe(true)
  })
})

describe('v2 可視 mouthState（本番 pipeline を共有）: パパパ高速をやめ、保持と分布を自然化', () => {
  it('large を多用しない（large 比率は低い）', () => {
    const states = renderStates(3, 40000)
    const large = states.filter((x) => x.s === 'large').length
    expect(large / states.length).toBeLessThan(0.15) // large は稀
  })
  it('small/medium が中心（closed 以外の大半が small/medium）', () => {
    const states = renderStates(3, 40000)
    const open = states.filter((x) => x.s !== 'closed')
    const sm = open.filter((x) => x.s === 'small' || x.s === 'medium').length
    expect(sm / Math.max(1, open.length)).toBeGreaterThan(0.6)
  })
  it('closed が自然に入る（pause）', () => {
    const states = renderStates(3, 40000)
    expect(states.some((x) => x.s === 'closed')).toBe(true)
  })
  it('same-state hold: 平均保持が v1(110–240ms) より長い（パパパ解消）', () => {
    const states = renderStates(3, 40000)
    // run-length（連続同一 state）の平均 tick 数 × dt を保持時間とみなす。
    let runs = 0
    for (let i = 1; i < states.length; i++) if (states[i].s !== states[i - 1].s) runs++
    const avgHoldMs = (states.length * AVATAR_SYNTHETIC.sampleIntervalMs) / Math.max(1, runs)
    expect(avgHoldMs).toBeGreaterThan(180) // v1 の 110–240 直接切替より明確に長い
  })
  it('phrase variability: seed 違いで列が変わる（永遠に同じ pattern を繰り返さない）', () => {
    const a = renderStates(1, 15000).map((x) => x.s).join('')
    const b = renderStates(2, 15000).map((x) => x.s).join('')
    expect(a).not.toBe(b)
  })
})

describe('holdMouthState: 可視最小保持ゲート', () => {
  it('minHold 未満の変更は保持（チャタリング防止）', () => {
    expect(holdMouthState('small', 'medium', 0, 100, 160)).toBe('small') // 100<160 → 保持
  })
  it('minHold 経過後は変更を許可', () => {
    expect(holdMouthState('small', 'medium', 0, 200, 160)).toBe('medium') // 200>=160 → 変更
  })
  it('同一 state は常にそのまま', () => {
    expect(holdMouthState('large', 'large', 0, 10, 160)).toBe('large')
  })
})

describe('shouldRunSyntheticLipsync: HARD guard（demo×speaking×remoteStream無しのみ ON）', () => {
  const base = { overlayEnabled: true, syntheticLipsync: true, visualState: 'speaking' as const, hasRemoteStream: false }
  it('1. demo + mock(speaking) + stream無し → ON', () => {
    expect(shouldRunSyntheticLipsync(base)).toBe(true)
  })
  it('2. demo + listening → OFF', () => {
    expect(shouldRunSyntheticLipsync({ ...base, visualState: 'listening' })).toBe(false)
  })
  it('3. demo + neutral → OFF', () => {
    expect(shouldRunSyntheticLipsync({ ...base, visualState: 'neutral' })).toBe(false)
  })
  it('4. normal company（syntheticLipsync=false） → OFF', () => {
    expect(shouldRunSyntheticLipsync({ ...base, syntheticLipsync: false })).toBe(false)
  })
  it('5/6. realtime（remoteStream あり） → OFF', () => {
    expect(shouldRunSyntheticLipsync({ ...base, hasRemoteStream: true })).toBe(false)
  })
  it('overlay 無効なら常に OFF', () => {
    expect(shouldRunSyntheticLipsync({ ...base, overlayEnabled: false })).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  computeRms,
  energyToMouthLevel,
  smoothLevel,
  mouthStateForLevel,
  resolveMouthLevel,
  createRemoteAudioAnalyzer,
} from './audio-analyzer'
import {
  nextBlinkDelayMs,
  isDoubleBlink,
  nextNodDelayMs,
  shouldNodNow,
  blinkAllowed,
  nodAllowed,
} from './avatar-motion'
import { AVATAR_AUDIO, AVATAR_BLINK, AVATAR_NOD, MOUTH_LEVEL_THRESHOLDS } from './avatar-config'

// PR: Lightweight Realtime Avatar の純ロジック（audio 解析 math / motion スケジュール）。実 audio/DOM なし。

describe('audio → mouth level', () => {
  it('computeRms: 無音(128中心 Uint8)は ~0、振幅ありは >0', () => {
    expect(computeRms(new Uint8Array([128, 128, 128, 128]))).toBeCloseTo(0, 5)
    expect(computeRms(new Uint8Array([0, 255, 0, 255]))).toBeGreaterThan(0.9)
    expect(computeRms([])).toBe(0)
  })
  it('#4 silent: ノイズ床未満 → 0（口を開けない）', () => {
    expect(energyToMouthLevel(AVATAR_AUDIO.noiseFloorRms - 0.001)).toBe(0)
    expect(energyToMouthLevel(0)).toBe(0)
  })
  it('#5-7 low/medium/high: RMS 増加で level 増加・0..1 にクランプ', () => {
    const low = energyToMouthLevel(0.05)
    const mid = energyToMouthLevel(0.12)
    const high = energyToMouthLevel(0.5)
    expect(low).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(low)
    expect(high).toBe(1) // クランプ
  })
  it('mouthStateForLevel: 閾値で closed/small/medium/large', () => {
    expect(mouthStateForLevel(0)).toBe('closed')
    expect(mouthStateForLevel(MOUTH_LEVEL_THRESHOLDS.small)).toBe('small')
    expect(mouthStateForLevel(MOUTH_LEVEL_THRESHOLDS.medium)).toBe('medium')
    expect(mouthStateForLevel(MOUTH_LEVEL_THRESHOLDS.large)).toBe('large')
    expect(mouthStateForLevel(1)).toBe('large')
  })
})

describe('#8 smoothing（フリッカー防止・attack速く/release遅く）', () => {
  it('立ち上がりは attack、立ち下がりは release で近づく', () => {
    const up = smoothLevel(0, 1)
    expect(up).toBeCloseTo(AVATAR_AUDIO.attackCoef, 5) // 0 + (1-0)*attack
    const down = smoothLevel(1, 0)
    expect(down).toBeCloseTo(1 - AVATAR_AUDIO.releaseCoef, 5) // 1 + (0-1)*release
    expect(down).toBeGreaterThan(1 - AVATAR_AUDIO.attackCoef) // release の方がゆっくり
  })
  it('繰り返しで target へ収束・0..1 クランプ', () => {
    let l = 0
    for (let i = 0; i < 30; i++) l = smoothLevel(l, 1)
    expect(l).toBeGreaterThan(0.99)
    expect(l).toBeLessThanOrEqual(1)
  })
})

describe('#9-11 fail-safe（barge-in / 発話停止 / 無音 → 口を閉じる）', () => {
  it('AI 非発話 → 0', () => {
    expect(resolveMouthLevel({ aiSpeaking: false, rawLevel: 0.9 })).toBe(0)
  })
  it('barge-in 中 → 0（口だけ動き続けない）', () => {
    expect(resolveMouthLevel({ aiSpeaking: true, bargeIn: true, rawLevel: 0.9 })).toBe(0)
  })
  it('発話中で level あり → その level', () => {
    expect(resolveMouthLevel({ aiSpeaking: true, rawLevel: 0.6 })).toBeCloseTo(0.6, 5)
  })
})

describe('#12 blink schedule（固定周期でない・短い・稀に二回）', () => {
  it('nextBlinkDelayMs は min..max のランダム幅', () => {
    expect(nextBlinkDelayMs(() => 0)).toBe(AVATAR_BLINK.minIntervalMs)
    expect(nextBlinkDelayMs(() => 1)).toBe(AVATAR_BLINK.maxIntervalMs)
    const mid = nextBlinkDelayMs(() => 0.5)
    expect(mid).toBeGreaterThan(AVATAR_BLINK.minIntervalMs)
    expect(mid).toBeLessThan(AVATAR_BLINK.maxIntervalMs)
  })
  it('isDoubleBlink は確率', () => {
    expect(isDoubleBlink(() => 0)).toBe(true)
    expect(isDoubleBlink(() => 0.99)).toBe(false)
  })
})

describe('#13 nod schedule（listening のみ・時々・機械的でない）', () => {
  it('nextNodDelayMs は min..max', () => {
    expect(nextNodDelayMs(() => 0)).toBe(AVATAR_NOD.minIntervalMs)
    expect(nextNodDelayMs(() => 1)).toBe(AVATAR_NOD.maxIntervalMs)
  })
  it('shouldNodNow は確率（延々頷かない）', () => {
    expect(shouldNodNow(() => 0)).toBe(true)
    expect(shouldNodNow(() => 0.99)).toBe(false)
  })
  it('nodAllowed は listening かつ非 reduced-motion のみ', () => {
    expect(nodAllowed('listening', false)).toBe(true)
    expect(nodAllowed('speaking', false)).toBe(false)
    expect(nodAllowed('neutral', false)).toBe(false)
    expect(nodAllowed('listening', true)).toBe(false) // reduced-motion
  })
})

describe('#14 reduced-motion', () => {
  it('blink/nod は reduced-motion で無効', () => {
    expect(blinkAllowed('speaking', true)).toBe(false)
    expect(blinkAllowed('speaking', false)).toBe(true)
    expect(nodAllowed('listening', true)).toBe(false)
  })
})

describe('#15 analyzer unavailable → null（面接を壊さない fallback）', () => {
  it('AudioContext 非対応環境では null', () => {
    // node 環境（window 無し）では null。
    expect(createRemoteAudioAnalyzer({ getAudioTracks: () => [] } as unknown as MediaStream)).toBeNull()
  })
  it('audio track 無し stream は null', () => {
    // window はあっても track が無ければ null（呼び出し側は静止 3 状態へ）。
    const fakeStream = { getAudioTracks: () => [] } as unknown as MediaStream
    expect(createRemoteAudioAnalyzer(fakeStream)).toBeNull()
  })
})

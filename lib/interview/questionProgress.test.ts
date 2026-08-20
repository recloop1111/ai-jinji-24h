import { describe, it, expect } from 'vitest'
import { computeQuestionProgress, turnHintForPhase } from './questionProgress'
import type { InterviewPhase } from './presence'

// Phase I-3: 進捗表示ロジック（誤った進捗を作らない・範囲外を作らない）。
describe('computeQuestionProgress (mock)', () => {
  it('1問目', () => {
    expect(computeQuestionProgress({ mode: 'mock', currentIndex: 1, total: 11 })).toEqual({
      visible: true,
      label: '質問 1 / 11',
      current: 1,
      total: 11,
    })
  })
  it('中間質問', () => {
    expect(computeQuestionProgress({ mode: 'mock', currentIndex: 3, total: 11 }).label).toBe('質問 3 / 11')
  })
  it('最終質問', () => {
    expect(computeQuestionProgress({ mode: 'mock', currentIndex: 11, total: 11 }).label).toBe('質問 11 / 11')
  })
  it('total=1', () => {
    expect(computeQuestionProgress({ mode: 'mock', currentIndex: 1, total: 1 }).label).toBe('質問 1 / 1')
  })
  it('index が total を超える → total にクランプ（範囲外を作らない）', () => {
    expect(computeQuestionProgress({ mode: 'mock', currentIndex: 99, total: 11 }).current).toBe(11)
  })
  it('index<1（未提示）→ 非表示', () => {
    expect(computeQuestionProgress({ mode: 'mock', currentIndex: 0, total: 11 }).visible).toBe(false)
  })
})

describe('computeQuestionProgress (非表示条件)', () => {
  it('total 不明(0/負/NaN) → 非表示', () => {
    for (const total of [0, -1, NaN]) {
      expect(computeQuestionProgress({ mode: 'mock', currentIndex: 1, total }).visible).toBe(false)
    }
  })
  it('realtime は index 不確定 → 非表示（誤進捗を出さない）', () => {
    expect(computeQuestionProgress({ mode: 'realtime', currentIndex: 3, total: 11 }).visible).toBe(false)
  })
  it('connecting → 非表示', () => {
    expect(computeQuestionProgress({ mode: 'connecting', currentIndex: 3, total: 11 }).visible).toBe(false)
  })
  it('NaN index → 非表示', () => {
    expect(computeQuestionProgress({ mode: 'mock', currentIndex: NaN, total: 11 }).visible).toBe(false)
  })
})

describe('turnHintForPhase', () => {
  it('listening のときだけ「あなたの番」ガイド', () => {
    expect(turnHintForPhase('listening')).toContain('あなたの番')
  })
  it('listening 以外は null（矛盾文言を出さない）', () => {
    const others: InterviewPhase[] = ['connecting', 'idle', 'speaking', 'thinking', 'ending']
    for (const p of others) expect(turnHintForPhase(p)).toBeNull()
  })
})

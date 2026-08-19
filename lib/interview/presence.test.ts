import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  INTERVIEW_PHASE_LABELS,
  mockPhaseOffsets,
  createMockPresenceDriver,
  type InterviewPhase,
} from './presence'

// Phase I-1: 面接プレゼンス状態の遷移ロジック（純モジュール）。Realtime 非依存。
const INTERVAL = 8000

describe('INTERVIEW_PHASE_LABELS', () => {
  it('全6状態のラベルを持つ（idle は非表示＝空文字）', () => {
    const phases: InterviewPhase[] = ['connecting', 'idle', 'listening', 'thinking', 'speaking', 'ending']
    for (const p of phases) expect(typeof INTERVIEW_PHASE_LABELS[p]).toBe('string')
    expect(INTERVIEW_PHASE_LABELS.idle).toBe('')
    expect(INTERVIEW_PHASE_LABELS.speaking).not.toBe('')
    expect(INTERVIEW_PHASE_LABELS.listening).not.toBe('')
    expect(INTERVIEW_PHASE_LABELS.thinking).not.toBe('')
    expect(INTERVIEW_PHASE_LABELS.connecting).not.toBe('')
    expect(INTERVIEW_PHASE_LABELS.ending).not.toBe('')
  })
})

describe('mockPhaseOffsets', () => {
  it('speaking(0-30%) → listening(30%) → thinking(80%) を interval 内に収める', () => {
    expect(mockPhaseOffsets(8000)).toEqual({ listeningAtMs: 2400, thinkingAtMs: 6400 })
  })
  it('listeningAt <= thinkingAt <= interval を保つ', () => {
    const { listeningAtMs, thinkingAtMs } = mockPhaseOffsets(10000)
    expect(listeningAtMs).toBeLessThanOrEqual(thinkingAtMs)
    expect(thinkingAtMs).toBeLessThanOrEqual(10000)
  })
  it('不正な interval は 0 扱い', () => {
    expect(mockPhaseOffsets(0)).toEqual({ listeningAtMs: 0, thinkingAtMs: 0 })
    expect(mockPhaseOffsets(-1)).toEqual({ listeningAtMs: 0, thinkingAtMs: 0 })
    expect(mockPhaseOffsets(NaN)).toEqual({ listeningAtMs: 0, thinkingAtMs: 0 })
  })
})

describe('createMockPresenceDriver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('初期→onQuestionPresented で speaking→listening→thinking の順に遷移', () => {
    const phases: InterviewPhase[] = []
    const d = createMockPresenceDriver({ setPhase: (p) => phases.push(p), intervalMs: INTERVAL })

    d.onQuestionPresented()
    expect(phases).toEqual(['speaking']) // 即 speaking
    vi.advanceTimersByTime(2400)
    expect(phases).toEqual(['speaking', 'listening'])
    vi.advanceTimersByTime(4000) // 合計 6400
    expect(phases).toEqual(['speaking', 'listening', 'thinking'])
  })

  it('次の質問提示で speaking に戻り、前質問の未発火 timer は破棄される', () => {
    const phases: InterviewPhase[] = []
    const d = createMockPresenceDriver({ setPhase: (p) => phases.push(p), intervalMs: INTERVAL })

    d.onQuestionPresented() // speaking
    vi.advanceTimersByTime(2400) // listening
    // まだ thinking 前（6400 未満）に次質問 → speaking へ戻り、前の thinking timer は破棄
    d.onQuestionPresented()
    expect(phases).toEqual(['speaking', 'listening', 'speaking'])
    vi.advanceTimersByTime(2400)
    expect(phases[phases.length - 1]).toBe('listening')
    // 破棄済みの前 thinking は発火しない（listening の直後に余計な thinking が挟まらない）
    vi.advanceTimersByTime(10000)
    expect(phases).toEqual(['speaking', 'listening', 'speaking', 'listening', 'thinking'])
  })

  it('stop 後は予約済み timer が発火しても setPhase を呼ばない（古い timer による書き換え防止）', () => {
    const phases: InterviewPhase[] = []
    const d = createMockPresenceDriver({ setPhase: (p) => phases.push(p), intervalMs: INTERVAL })

    d.onQuestionPresented() // speaking + listening/thinking を予約
    expect(phases).toEqual(['speaking'])
    d.stop()
    vi.advanceTimersByTime(10000)
    expect(phases).toEqual(['speaking']) // listening/thinking は発火しない
  })

  it('stop 後は onQuestionPresented も no-op（終了後に状態遷移しない）', () => {
    const phases: InterviewPhase[] = []
    const d = createMockPresenceDriver({ setPhase: (p) => phases.push(p), intervalMs: INTERVAL })
    d.stop()
    d.onQuestionPresented()
    vi.advanceTimersByTime(10000)
    expect(phases).toEqual([])
  })
})

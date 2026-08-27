import { describe, it, expect } from 'vitest'
import { interviewerVisualForPhase, resolveInterviewerVisual } from './interviewer-visual'
import { interviewerFrameSrc } from './interviewer-identity'
import type { InterviewPhase } from './presence'

// AI面接官の視覚状態写像（neutral/speaking/listening）+ 優先順位を固定（OpenAI 非接続・純ロジック）。

describe('interviewerVisualForPhase: presence phase → 3状態', () => {
  it('speaking → speaking / listening → listening', () => {
    expect(interviewerVisualForPhase('speaking')).toBe('speaking')
    expect(interviewerVisualForPhase('listening')).toBe('listening')
  })
  it('その他（connecting/idle/thinking/ending/null）→ neutral フォールバック', () => {
    for (const p of ['connecting', 'idle', 'thinking', 'ending'] as InterviewPhase[]) {
      expect(interviewerVisualForPhase(p)).toBe('neutral')
    }
    expect(interviewerVisualForPhase(null)).toBe('neutral')
    expect(interviewerVisualForPhase(undefined)).toBe('neutral')
  })
  it('synthetic: 全 InterviewPhase を写像しても crash せず 3状態のいずれか', () => {
    for (const p of ['connecting', 'idle', 'listening', 'thinking', 'speaking', 'ending'] as InterviewPhase[]) {
      const v = interviewerVisualForPhase(p)
      expect(['neutral', 'speaking', 'listening']).toContain(v)
      // frame は常に実在アセット（未解析 speaking も neutral へ安全退避）。
      expect(interviewerFrameSrc({ visualState: v })).toMatch(/ai-interviewer-(neutral|mouth-(small|medium|large)|blink)\.webp$/)
    }
  })
})

describe('resolveInterviewerVisual: precedence（speaking > listening > neutral）', () => {
  it('AI speaking が最優先（listening と競合しても speaking）', () => {
    expect(resolveInterviewerVisual({ aiSpeaking: true, applicantListening: true })).toBe('speaking')
    expect(resolveInterviewerVisual({ aiSpeaking: true })).toBe('speaking')
  })
  it('applicant listening は AI 非発話時のみ', () => {
    expect(resolveInterviewerVisual({ aiSpeaking: false, applicantListening: true })).toBe('listening')
  })
  it('どちらも無ければ neutral', () => {
    expect(resolveInterviewerVisual({})).toBe('neutral')
    expect(resolveInterviewerVisual({ aiSpeaking: false, applicantListening: false })).toBe('neutral')
  })
})

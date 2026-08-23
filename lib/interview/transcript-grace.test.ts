import { describe, it, expect } from 'vitest'
import { isWithinCompletionGrace, TRANSCRIPT_COMPLETION_GRACE_MS } from './transcript-grace'

// PR-19D: completion grace 判定（純ロジック）。
const T0 = Date.parse('2026-01-01T00:00:00.000Z')

describe('isWithinCompletionGrace', () => {
  it('AF: completed かつ grace 以内 → true', () => {
    expect(isWithinCompletionGrace('completed', new Date(T0).toISOString(), T0 + 10_000)).toBe(true)
    expect(isWithinCompletionGrace('completed', new Date(T0).toISOString(), T0 + TRANSCRIPT_COMPLETION_GRACE_MS)).toBe(true)
  })

  it('AG: completed だが grace 超過 → false', () => {
    expect(isWithinCompletionGrace('completed', new Date(T0).toISOString(), T0 + TRANSCRIPT_COMPLETION_GRACE_MS + 1)).toBe(false)
  })

  it('AH: cancelled → 常に false', () => {
    expect(isWithinCompletionGrace('cancelled', new Date(T0).toISOString(), T0 + 1_000)).toBe(false)
  })

  it('AI 相当: in_progress → false（grace の対象外・authz が許可する）', () => {
    expect(isWithinCompletionGrace('in_progress', new Date(T0).toISOString(), T0 + 1_000)).toBe(false)
  })

  it('ended_at 欠落 / 無効 → false', () => {
    expect(isWithinCompletionGrace('completed', null, T0)).toBe(false)
    expect(isWithinCompletionGrace('completed', undefined, T0)).toBe(false)
    expect(isWithinCompletionGrace('completed', 'not-a-date', T0)).toBe(false)
    expect(isWithinCompletionGrace('completed', '', T0)).toBe(false)
  })

  it('ended_at がわずかに未来（時計差）→ 小さな許容内なら true', () => {
    expect(isWithinCompletionGrace('completed', new Date(T0).toISOString(), T0 - 3_000)).toBe(true) // 3秒未来
    expect(isWithinCompletionGrace('completed', new Date(T0).toISOString(), T0 - 10_000)).toBe(false) // 10秒未来は不許可
  })
})

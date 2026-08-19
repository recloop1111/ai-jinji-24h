import { describe, it, expect } from 'vitest'
import { avatarVariantForPhase } from './avatarVisual'
import type { InterviewPhase } from './presence'

// Phase I-2: phase → 視覚バリアントの写像。各 phase が正しい variant になること。
describe('avatarVariantForPhase', () => {
  it('connecting → 控えめ・非活動・インジケータ無し', () => {
    expect(avatarVariantForPhase('connecting')).toEqual({
      motion: 'connecting',
      indicator: 'none',
      tone: 'slate',
      active: false,
    })
  })

  it('idle → breathing・非活動・インジケータ無し', () => {
    expect(avatarVariantForPhase('idle')).toEqual({
      motion: 'breathing',
      indicator: 'none',
      tone: 'blue',
      active: false,
    })
  })

  it('speaking → pulse・waveform・活動', () => {
    expect(avatarVariantForPhase('speaking')).toEqual({
      motion: 'speaking',
      indicator: 'waveform',
      tone: 'blue',
      active: true,
    })
  })

  it('listening → 傾聴・listening 波・活動（speaking と別トーン/インジケータ）', () => {
    expect(avatarVariantForPhase('listening')).toEqual({
      motion: 'listening',
      indicator: 'listening',
      tone: 'green',
      active: true,
    })
  })

  it('thinking → 思考・dots・活動（speaking/listening と区別）', () => {
    expect(avatarVariantForPhase('thinking')).toEqual({
      motion: 'thinking',
      indicator: 'dots',
      tone: 'indigo',
      active: true,
    })
  })

  it('ending → 静止・非活動（活動状態に見せない）', () => {
    expect(avatarVariantForPhase('ending')).toEqual({
      motion: 'none',
      indicator: 'none',
      tone: 'slate',
      active: false,
    })
  })

  it('active な phase は speaking/listening/thinking のみ', () => {
    const phases: InterviewPhase[] = ['connecting', 'idle', 'speaking', 'listening', 'thinking', 'ending']
    const active = phases.filter((p) => avatarVariantForPhase(p).active)
    expect(active.sort()).toEqual(['listening', 'speaking', 'thinking'])
  })

  it('speaking/listening/thinking のインジケータは互いに異なる（形で区別できる）', () => {
    const inds = ['speaking', 'listening', 'thinking'].map((p) => avatarVariantForPhase(p as InterviewPhase).indicator)
    expect(new Set(inds).size).toBe(3)
  })
})

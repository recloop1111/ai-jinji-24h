import { describe, it, expect } from 'vitest'
import {
  AI_INTERVIEWER,
  AI_INTERVIEWER_DEFAULT_IMAGE,
  AI_INTERVIEWER_IMAGE_LIST,
  AI_INTERVIEWER_PRELOAD_LIST,
  interviewerFrameSrc,
  interviewerMouthOverlaySrc,
} from './interviewer-identity'
import { REALTIME_VOICE } from '@/lib/config/openai'

// AIMEN24 標準AI面接官（全企業共通）の SoT を固定。

describe('AI_INTERVIEWER（全企業共通の SoT・5枚アセット）', () => {
  it('表示名/alt/5枚画像path を1箇所で提供する（Web配信は WebP 最適化）', () => {
    expect(AI_INTERVIEWER.displayName).toBe('AI面接官')
    expect(AI_INTERVIEWER.imageAlt).toBe('AI面接官')
    expect(AI_INTERVIEWER.images.neutral).toBe('/images/interviewer/ai-interviewer-neutral.webp')
    expect(AI_INTERVIEWER.images.mouthSmall).toBe('/images/interviewer/ai-interviewer-mouth-small.webp')
    expect(AI_INTERVIEWER.images.mouthMedium).toBe('/images/interviewer/ai-interviewer-mouth-medium.webp')
    expect(AI_INTERVIEWER.images.mouthLarge).toBe('/images/interviewer/ai-interviewer-mouth-large.webp')
    expect(AI_INTERVIEWER.images.blink).toBe('/images/interviewer/ai-interviewer-blink.webp')
  })
  it('既定画像は neutral', () => {
    expect(AI_INTERVIEWER_DEFAULT_IMAGE).toBe(AI_INTERVIEWER.images.neutral)
  })
  it('preload リストは 5 枚を全て含む', () => {
    expect(AI_INTERVIEWER_IMAGE_LIST).toHaveLength(5)
    expect(AI_INTERVIEWER_IMAGE_LIST).toContain(AI_INTERVIEWER.images.neutral)
    expect(AI_INTERVIEWER_IMAGE_LIST).toContain(AI_INTERVIEWER.images.blink)
    expect(AI_INTERVIEWER_IMAGE_LIST).toContain(AI_INTERVIEWER.images.mouthLarge)
  })
  it('voice 方針は共通 SoT（REALTIME_VOICE）を単一の真実にする（企業別 voice を持たない）', () => {
    expect(AI_INTERVIEWER.voicePolicy).toBe(REALTIME_VOICE)
  })
  it('企業別のキー（companyId/name/voiceType/tone 等）を持たない＝共通資産', () => {
    const keys = Object.keys(AI_INTERVIEWER)
    for (const forbidden of ['companyId', 'company_id', 'voiceType', 'tone', 'toneTemplate', 'avatar_config']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

describe('interviewerFrameSrc（描画フレーム解決・優先順位 blink > mouth > neutral）', () => {
  it('blink は最優先（speaking/mouth より優先）', () => {
    expect(interviewerFrameSrc({ visualState: 'speaking', mouthState: 'large', blinking: true })).toBe(AI_INTERVIEWER.images.blink)
    expect(interviewerFrameSrc({ visualState: 'neutral', blinking: true })).toBe(AI_INTERVIEWER.images.blink)
  })
  it('speaking + mouthState → 対応 mouth フレーム / closed は neutral', () => {
    expect(interviewerFrameSrc({ visualState: 'speaking', mouthState: 'small' })).toBe(AI_INTERVIEWER.images.mouthSmall)
    expect(interviewerFrameSrc({ visualState: 'speaking', mouthState: 'medium' })).toBe(AI_INTERVIEWER.images.mouthMedium)
    expect(interviewerFrameSrc({ visualState: 'speaking', mouthState: 'large' })).toBe(AI_INTERVIEWER.images.mouthLarge)
    expect(interviewerFrameSrc({ visualState: 'speaking', mouthState: 'closed' })).toBe(AI_INTERVIEWER.images.neutral)
    expect(interviewerFrameSrc({ visualState: 'speaking' })).toBe(AI_INTERVIEWER.images.neutral) // 未解析
  })
  it('listening / neutral は neutral（口を開けたまま残さない）', () => {
    expect(interviewerFrameSrc({ visualState: 'listening', mouthState: 'large' })).toBe(AI_INTERVIEWER.images.neutral)
    expect(interviewerFrameSrc({ visualState: 'neutral', mouthState: 'medium' })).toBe(AI_INTERVIEWER.images.neutral)
  })
})

describe('口 overlay（採用方式＝neutral 固定 base ＋ 口領域のみ overlay）', () => {
  it('3 段階の透過 overlay path を 1 箇所で提供する', () => {
    expect(AI_INTERVIEWER.mouthOverlays.small).toBe('/images/interviewer/ai-interviewer-mouth-small-overlay.webp')
    expect(AI_INTERVIEWER.mouthOverlays.medium).toBe('/images/interviewer/ai-interviewer-mouth-medium-overlay.webp')
    expect(AI_INTERVIEWER.mouthOverlays.large).toBe('/images/interviewer/ai-interviewer-mouth-large-overlay.webp')
  })
  it('preload は通常 Production 経路（overlay ON / full-frame OFF）で実描画する 5 枚のみ（旧 full-frame mouth を含めない）', () => {
    // neutral + blink + 口 overlay 3 枚 = 5。旧 full-frame mouth を通常経路で無駄 download しない。
    expect(AI_INTERVIEWER_PRELOAD_LIST).toHaveLength(5)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(AI_INTERVIEWER.images.neutral)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(AI_INTERVIEWER.images.blink)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(AI_INTERVIEWER.mouthOverlays.small)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(AI_INTERVIEWER.mouthOverlays.medium)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(AI_INTERVIEWER.mouthOverlays.large)
    // 旧 full-frame mouth（実験用 asset）は通常経路では preload しない。
    expect(AI_INTERVIEWER_PRELOAD_LIST).not.toContain(AI_INTERVIEWER.images.mouthSmall)
    expect(AI_INTERVIEWER_PRELOAD_LIST).not.toContain(AI_INTERVIEWER.images.mouthMedium)
    expect(AI_INTERVIEWER_PRELOAD_LIST).not.toContain(AI_INTERVIEWER.images.mouthLarge)
  })
})

describe('interviewerMouthOverlaySrc（speaking のみ・small/medium/large だけ overlay・他は null）', () => {
  it('speaking + small/medium/large → 対応 overlay', () => {
    expect(interviewerMouthOverlaySrc({ visualState: 'speaking', mouthState: 'small' })).toBe(AI_INTERVIEWER.mouthOverlays.small)
    expect(interviewerMouthOverlaySrc({ visualState: 'speaking', mouthState: 'medium' })).toBe(AI_INTERVIEWER.mouthOverlays.medium)
    expect(interviewerMouthOverlaySrc({ visualState: 'speaking', mouthState: 'large' })).toBe(AI_INTERVIEWER.mouthOverlays.large)
  })
  it('speaking + closed / 未解析 → null（base neutral の口閉じのまま）', () => {
    expect(interviewerMouthOverlaySrc({ visualState: 'speaking', mouthState: 'closed' })).toBeNull()
    expect(interviewerMouthOverlaySrc({ visualState: 'speaking' })).toBeNull()
  })
  it('非 speaking（listening/neutral）は mouthState に関わらず null（fail-safe＝発話外で口を出さない）', () => {
    expect(interviewerMouthOverlaySrc({ visualState: 'listening', mouthState: 'large' })).toBeNull()
    expect(interviewerMouthOverlaySrc({ visualState: 'neutral', mouthState: 'medium' })).toBeNull()
  })
})

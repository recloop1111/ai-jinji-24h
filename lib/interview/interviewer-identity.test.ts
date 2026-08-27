import { describe, it, expect } from 'vitest'
import {
  AI_INTERVIEWER,
  AI_INTERVIEWER_DEFAULT_IMAGE,
  AI_INTERVIEWER_IMAGE_LIST,
  AI_INTERVIEWER_PRELOAD_LIST,
  interviewerFrameSrc,
  interviewerMouthOverlaySrc,
  interviewerLowerFaceOverlaySrc,
  interviewerOverlaySrc,
} from './interviewer-identity'
import { AVATAR_LIPSYNC_MODE } from '@/lib/interview/avatar/avatar-config'
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

describe('overlay アセット（mouth-only / lower-face の 2 方式を 1 箇所で提供）', () => {
  it('mouth-only overlay path', () => {
    expect(AI_INTERVIEWER.mouthOverlays.small).toBe('/images/interviewer/ai-interviewer-mouth-small-overlay.webp')
    expect(AI_INTERVIEWER.mouthOverlays.medium).toBe('/images/interviewer/ai-interviewer-mouth-medium-overlay.webp')
    expect(AI_INTERVIEWER.mouthOverlays.large).toBe('/images/interviewer/ai-interviewer-mouth-large-overlay.webp')
  })
  it('lower-face overlay path（採用候補・color-matched）', () => {
    expect(AI_INTERVIEWER.lowerFaceOverlays.small).toBe('/images/interviewer/ai-interviewer-lowerface-small-overlay.webp')
    expect(AI_INTERVIEWER.lowerFaceOverlays.medium).toBe('/images/interviewer/ai-interviewer-lowerface-medium-overlay.webp')
    expect(AI_INTERVIEWER.lowerFaceOverlays.large).toBe('/images/interviewer/ai-interviewer-lowerface-large-overlay.webp')
  })
  it('独立 Eye Layer overlay path（v2・口と独立に瞬き）', () => {
    expect(AI_INTERVIEWER.eyesClosedOverlay).toBe('/images/interviewer/ai-interviewer-eyes-closed-overlay.webp')
  })
  it('preload は通常 Production 経路（overlay ON / full-frame OFF）で実描画する 5 枚のみ（neutral + eye overlay + mode口 overlay 3）', () => {
    const active = AVATAR_LIPSYNC_MODE === 'lowerface' ? AI_INTERVIEWER.lowerFaceOverlays : AI_INTERVIEWER.mouthOverlays
    // neutral + eyesClosedOverlay(独立 Eye Layer) + 有効 mode の口 overlay 3 枚 = 5。旧 full-frame(blink/mouth) は無駄 download しない。
    expect(AI_INTERVIEWER_PRELOAD_LIST).toHaveLength(5)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(AI_INTERVIEWER.images.neutral)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(AI_INTERVIEWER.eyesClosedOverlay)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(active.small)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(active.medium)
    expect(AI_INTERVIEWER_PRELOAD_LIST).toContain(active.large)
    // 旧 full-frame（blink / mouth）は overlay 経路では preload しない（Eye Layer が瞬きを担う）。
    expect(AI_INTERVIEWER_PRELOAD_LIST).not.toContain(AI_INTERVIEWER.images.blink)
    expect(AI_INTERVIEWER_PRELOAD_LIST).not.toContain(AI_INTERVIEWER.images.mouthSmall)
    expect(AI_INTERVIEWER_PRELOAD_LIST).not.toContain(AI_INTERVIEWER.images.mouthLarge)
  })
})

describe('interviewerOverlaySrc（mode で lowerface/mouth 切替・speaking のみ・他は null）', () => {
  it('既定 mode（AVATAR_LIPSYNC_MODE）で speaking + small/medium/large → 対応 overlay', () => {
    const active = AVATAR_LIPSYNC_MODE === 'lowerface' ? AI_INTERVIEWER.lowerFaceOverlays : AI_INTERVIEWER.mouthOverlays
    expect(interviewerOverlaySrc({ visualState: 'speaking', mouthState: 'small' })).toBe(active.small)
    expect(interviewerOverlaySrc({ visualState: 'speaking', mouthState: 'medium' })).toBe(active.medium)
    expect(interviewerOverlaySrc({ visualState: 'speaking', mouthState: 'large' })).toBe(active.large)
  })
  it('mode=lowerface / mode=mouth を明示すると対応 set を返す', () => {
    expect(interviewerOverlaySrc({ visualState: 'speaking', mouthState: 'large', mode: 'lowerface' })).toBe(AI_INTERVIEWER.lowerFaceOverlays.large)
    expect(interviewerOverlaySrc({ visualState: 'speaking', mouthState: 'large', mode: 'mouth' })).toBe(AI_INTERVIEWER.mouthOverlays.large)
  })
  it('speaking + closed / 未解析 → null（base neutral の口閉じのまま）', () => {
    expect(interviewerOverlaySrc({ visualState: 'speaking', mouthState: 'closed' })).toBeNull()
    expect(interviewerOverlaySrc({ visualState: 'speaking' })).toBeNull()
  })
  it('非 speaking（listening/neutral）は mouthState に関わらず null（fail-safe＝発話外で口を出さない）', () => {
    expect(interviewerOverlaySrc({ visualState: 'listening', mouthState: 'large' })).toBeNull()
    expect(interviewerOverlaySrc({ visualState: 'neutral', mouthState: 'medium' })).toBeNull()
    expect(interviewerOverlaySrc({ visualState: 'listening', mouthState: 'large', mode: 'lowerface' })).toBeNull()
  })
})

describe('QA 比較用の明示 helper（interviewerMouthOverlaySrc / interviewerLowerFaceOverlaySrc）', () => {
  it('mouth-only helper は常に mouthOverlays を返す', () => {
    expect(interviewerMouthOverlaySrc({ visualState: 'speaking', mouthState: 'medium' })).toBe(AI_INTERVIEWER.mouthOverlays.medium)
    expect(interviewerMouthOverlaySrc({ visualState: 'listening', mouthState: 'large' })).toBeNull()
  })
  it('lower-face helper は常に lowerFaceOverlays を返す', () => {
    expect(interviewerLowerFaceOverlaySrc({ visualState: 'speaking', mouthState: 'medium' })).toBe(AI_INTERVIEWER.lowerFaceOverlays.medium)
    expect(interviewerLowerFaceOverlaySrc({ visualState: 'speaking', mouthState: 'closed' })).toBeNull()
  })
})

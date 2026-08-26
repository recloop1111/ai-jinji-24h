import { describe, it, expect } from 'vitest'
import { AI_INTERVIEWER, AI_INTERVIEWER_DEFAULT_IMAGE, AI_INTERVIEWER_IMAGE_LIST, interviewerImageForState } from './interviewer-identity'
import { REALTIME_VOICE } from '@/lib/config/openai'

// AIMEN24 標準AI面接官（全企業共通）の SoT を固定。

describe('AI_INTERVIEWER（全企業共通の SoT・3状態画像）', () => {
  it('表示名/alt/3状態画像path を1箇所で提供する（Web配信は WebP 最適化）', () => {
    expect(AI_INTERVIEWER.displayName).toBe('AI面接官')
    expect(AI_INTERVIEWER.imageAlt).toBe('AI面接官')
    expect(AI_INTERVIEWER.images.neutral).toBe('/images/interviewer/ai-interviewer-neutral.webp')
    expect(AI_INTERVIEWER.images.speaking).toBe('/images/interviewer/ai-interviewer-speaking.webp')
    expect(AI_INTERVIEWER.images.listening).toBe('/images/interviewer/ai-interviewer-listening.webp')
  })
  it('既定画像は neutral', () => {
    expect(AI_INTERVIEWER_DEFAULT_IMAGE).toBe(AI_INTERVIEWER.images.neutral)
  })
  it('preload リストは 3 状態画像を全て含む', () => {
    expect(AI_INTERVIEWER_IMAGE_LIST).toHaveLength(3)
    expect(AI_INTERVIEWER_IMAGE_LIST).toEqual([AI_INTERVIEWER.images.neutral, AI_INTERVIEWER.images.speaking, AI_INTERVIEWER.images.listening])
  })
  it('interviewerImageForState: 各状態→対応画像 / 未知・null は neutral フォールバック', () => {
    expect(interviewerImageForState('neutral')).toBe(AI_INTERVIEWER.images.neutral)
    expect(interviewerImageForState('speaking')).toBe(AI_INTERVIEWER.images.speaking)
    expect(interviewerImageForState('listening')).toBe(AI_INTERVIEWER.images.listening)
    expect(interviewerImageForState(null)).toBe(AI_INTERVIEWER.images.neutral)
    expect(interviewerImageForState(undefined)).toBe(AI_INTERVIEWER.images.neutral)
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

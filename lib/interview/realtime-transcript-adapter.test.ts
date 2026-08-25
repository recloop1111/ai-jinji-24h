import { describe, it, expect } from 'vitest'
import {
  normalizeRealtimeSpeaker,
  parseRealtimeTranscriptEvent,
  buildTranscriptIngestionDTO,
  realtimeEventToIngestionDTO,
} from './realtime-transcript-adapter'
import { TRANSCRIPT_TEXT_MAX } from './transcript-write'

// PR-19A: Realtime transcript adapter（純関数・synthetic event のみ・実応募者データなし）。
const applicantEvent = (over: Record<string, unknown> = {}) => ({
  type: 'conversation.item.input_audio_transcription.completed',
  transcript: '前職では営業をしていました。',
  item_id: 'item_APP',
  content_index: 0,
  ...over,
})
const aiEvent = (over: Record<string, unknown> = {}) => ({
  type: 'response.audio_transcript.done',
  transcript: '志望動機を教えてください。',
  item_id: 'item_AI',
  content_index: 0,
  response_id: 'resp_1',
  ...over,
})

describe('normalizeRealtimeSpeaker (1箇所集約・ai→interviewer)', () => {
  it('ai/assistant → interviewer', () => {
    expect(normalizeRealtimeSpeaker('ai')).toBe('interviewer')
    expect(normalizeRealtimeSpeaker('assistant')).toBe('interviewer')
  })
  it('applicant/user → applicant', () => {
    expect(normalizeRealtimeSpeaker('applicant')).toBe('applicant')
    expect(normalizeRealtimeSpeaker('user')).toBe('applicant')
  })
  it('未知/不正 → null', () => {
    expect(normalizeRealtimeSpeaker('interviewer_spoof')).toBeNull()
    expect(normalizeRealtimeSpeaker(null)).toBeNull()
    expect(normalizeRealtimeSpeaker(5)).toBeNull()
  })
})

describe('parseRealtimeTranscriptEvent', () => {
  it('1: applicant completed → role applicant', () => {
    expect(parseRealtimeTranscriptEvent(applicantEvent())).toMatchObject({ role: 'applicant', text: '前職では営業をしていました。' })
  })
  it('2: AI done → role ai', () => {
    expect(parseRealtimeTranscriptEvent(aiEvent())).toMatchObject({ role: 'ai' })
  })
  it('5/6/7: item_id / content_index / response_id 保持', () => {
    const m = parseRealtimeTranscriptEvent(aiEvent())!
    expect(m.itemId).toBe('item_AI')
    expect(m.contentIndex).toBe(0)
    expect(m.responseId).toBe('resp_1')
  })
  it('12: item_id 欠落 → null 保持（crash しない）', () => {
    const m = parseRealtimeTranscriptEvent(applicantEvent({ item_id: undefined }))!
    expect(m.itemId).toBeNull()
  })
  it('11: malformed content_index（string/float/negative）→ null', () => {
    expect(parseRealtimeTranscriptEvent(applicantEvent({ content_index: '0' }))!.contentIndex).toBeNull()
    expect(parseRealtimeTranscriptEvent(applicantEvent({ content_index: 1.5 }))!.contentIndex).toBeNull()
    expect(parseRealtimeTranscriptEvent(applicantEvent({ content_index: -1 }))!.contentIndex).toBeNull()
  })
  it('8: unknown event → null', () => {
    expect(parseRealtimeTranscriptEvent({ type: 'response.created' })).toBeNull()
    expect(parseRealtimeTranscriptEvent({ type: 'session.updated' })).toBeNull()
    expect(parseRealtimeTranscriptEvent(null)).toBeNull()
    expect(parseRealtimeTranscriptEvent('x')).toBeNull()
    expect(parseRealtimeTranscriptEvent({})).toBeNull()
  })
  it('17: partial/delta を FINAL として扱わない → null', () => {
    expect(parseRealtimeTranscriptEvent({ type: 'response.audio_transcript.delta', transcript: '途中' })).toBeNull()
    expect(parseRealtimeTranscriptEvent({ type: 'conversation.item.input_audio_transcription.delta', transcript: '途中' })).toBeNull()
  })
})

describe('buildTranscriptIngestionDTO (正規化 + text 検証)', () => {
  it('3/4/16: applicant→applicant / ai→interviewer（domain に ai を漏らさない）', () => {
    expect(buildTranscriptIngestionDTO({ role: 'applicant', text: 'x', itemId: 'i', contentIndex: 0, responseId: null })!.speaker).toBe('applicant')
    const ai = buildTranscriptIngestionDTO({ role: 'ai', text: 'x', itemId: 'i', contentIndex: 0, responseId: 'r' })!
    expect(ai.speaker).toBe('interviewer')
    // 'ai' が DTO のどこにも残らない
    expect(JSON.stringify(ai)).not.toContain('"ai"')
  })
  it('9/10: empty / whitespace transcript → null（reject）', () => {
    expect(buildTranscriptIngestionDTO({ role: 'applicant', text: '', itemId: null, contentIndex: null, responseId: null })).toBeNull()
    expect(buildTranscriptIngestionDTO({ role: 'applicant', text: '   ', itemId: null, contentIndex: null, responseId: null })).toBeNull()
  })
  it('15: oversized text → null（reject）', () => {
    expect(buildTranscriptIngestionDTO({ role: 'applicant', text: 'あ'.repeat(TRANSCRIPT_TEXT_MAX + 1), itemId: null, contentIndex: null, responseId: null })).toBeNull()
  })
  it('13: HTML/script 風テキストは通常 text として保持（エスケープ/実行しない）', () => {
    const dto = buildTranscriptIngestionDTO({ role: 'applicant', text: '<script>alert(1)</script>', itemId: null, contentIndex: null, responseId: null })!
    expect(dto.text).toBe('<script>alert(1)</script>')
    expect(dto.text).not.toContain('&lt;')
  })
  it('14: Unicode / 改行を保持', () => {
    const dto = buildTranscriptIngestionDTO({ role: 'applicant', text: '絵文字😀\n改行', itemId: null, contentIndex: null, responseId: null })!
    expect(dto.text).toBe('絵文字😀\n改行')
  })
  it('final は常に true（v1）', () => {
    expect(buildTranscriptIngestionDTO({ role: 'ai', text: 'x', itemId: 'i', contentIndex: 0, responseId: 'r' })!.final).toBe(true)
  })
  it('不正 speaker role → null', () => {
    // @ts-expect-error 故意に不正な role（domain speaker）を渡す（adapter が reject することの確認）
    expect(buildTranscriptIngestionDTO({ role: 'interviewer', text: 'x', itemId: null, contentIndex: null, responseId: null })).toBeNull()
    expect(buildTranscriptIngestionDTO(null)).toBeNull()
  })
})

describe('realtimeEventToIngestionDTO (event→DTO)', () => {
  it('applicant event → DTO(applicant) / AI event → DTO(interviewer)', () => {
    expect(realtimeEventToIngestionDTO(applicantEvent())!.speaker).toBe('applicant')
    expect(realtimeEventToIngestionDTO(aiEvent())!.speaker).toBe('interviewer')
  })
  it('empty transcript event → null / unknown → null', () => {
    expect(realtimeEventToIngestionDTO(applicantEvent({ transcript: '   ' }))).toBeNull()
    expect(realtimeEventToIngestionDTO({ type: 'response.created' })).toBeNull()
  })
})

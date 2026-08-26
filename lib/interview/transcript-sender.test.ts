import { describe, it, expect, vi } from 'vitest'
import { buildTranscriptPostPlan, sendTranscriptEvent } from './transcript-sender'

// PR-R1-A: Realtime 生 event → server 権威 transcript ingest への client sender（実 network なし）。

const ctx = { slug: 'acme', token: 'tok', applicantId: 'app-1', interviewId: 'iv-1', language: 'ja' }
const applicantEvt = {
  type: 'conversation.item.input_audio_transcription.completed',
  transcript: '前職では法人営業をしていました',
  item_id: 'item_1',
  content_index: 0,
  response_id: null,
}
const aiEvt = {
  type: 'response.audio_transcript.done',
  transcript: 'ご経験を教えてください',
  item_id: 'item_2',
  content_index: 0,
  response_id: 'resp_1',
}

describe('buildTranscriptPostPlan: server 権威（speaker/source/seq を送らない）', () => {
  it('応募者 FINAL event → event_type/transcript/item_id/content_index を送る（speaker/source/seq/final は含めない）', () => {
    const plan = buildTranscriptPostPlan(applicantEvt, ctx)!
    expect(plan.url).toBe('/api/interview/acme/transcript')
    expect(plan.body.event_type).toBe(applicantEvt.type)
    expect(plan.body.transcript).toBe(applicantEvt.transcript)
    expect(plan.body.item_id).toBe('item_1')
    expect(plan.body.content_index).toBe(0)
    expect(plan.body.token).toBe('tok')
    expect(plan.body.interview_id).toBe('iv-1')
    // client は speaker/source/seq/final/dedup_key を送らない（server が導出）。
    for (const forbidden of ['speaker', 'source', 'seq', 'final', 'dedup_key']) {
      expect(Object.prototype.hasOwnProperty.call(plan.body, forbidden)).toBe(false)
    }
  })
  it('AI FINAL event も同様（response_id を含む）', () => {
    const plan = buildTranscriptPostPlan(aiEvt, ctx)!
    expect(plan.body.event_type).toBe(aiEvt.type)
    expect(plan.body.response_id).toBe('resp_1')
  })
  it('partial/delta/未知 event は null（送らない）', () => {
    expect(buildTranscriptPostPlan({ type: 'response.audio_transcript.delta', transcript: 'x' }, ctx)).toBeNull()
    expect(buildTranscriptPostPlan({ type: 'foo' }, ctx)).toBeNull()
    expect(buildTranscriptPostPlan(null, ctx)).toBeNull()
  })
  it('item_id / content_index 欠損の FINAL は null（server dedup 不能＝手前で捨てる）', () => {
    expect(buildTranscriptPostPlan({ ...applicantEvt, item_id: null }, ctx)).toBeNull()
    expect(buildTranscriptPostPlan({ ...applicantEvt, content_index: undefined }, ctx)).toBeNull()
  })
  it('空 transcript は null', () => {
    expect(buildTranscriptPostPlan({ ...applicantEvt, transcript: '   ' }, ctx)).toBeNull()
  })
})

describe('sendTranscriptEvent: best-effort（例外を投げない・gate OFF は disabled）', () => {
  it('200 → sent', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch
    expect(await sendTranscriptEvent(applicantEvt, ctx, fetchImpl)).toBe('sent')
  })
  it('503（TRANSCRIPT_INGEST_ENABLED OFF）→ disabled（no-op・面接を止めない）', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch
    expect(await sendTranscriptEvent(applicantEvt, ctx, fetchImpl)).toBe('disabled')
  })
  it('非FINAL → skipped（fetch を呼ばない）', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch
    expect(await sendTranscriptEvent({ type: 'x' }, ctx, fetchImpl)).toBe('skipped')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('ネットワーク失敗 → error（例外を投げない）', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    await expect(sendTranscriptEvent(applicantEvt, ctx, fetchImpl)).resolves.toBe('error')
  })
})

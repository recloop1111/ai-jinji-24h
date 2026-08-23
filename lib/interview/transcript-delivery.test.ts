import { describe, it, expect, vi, afterEach } from 'vitest'
import { TranscriptDelivery, type DeliveryPoster, type TranscriptPostBody } from './transcript-delivery'
import type { RealtimeTranscriptEventMeta } from './realtime-transcript-adapter'

// PR-19D: client delivery layer（fake poster のみ・実 network/OpenAI/DB 非接続）。
const ctx = { token: 'tok', applicantId: 'app-1', interviewId: 'iv-1', language: 'ja' }
const applicantMeta = (over: Partial<RealtimeTranscriptEventMeta> = {}): RealtimeTranscriptEventMeta => ({
  role: 'applicant',
  text: '前職では営業をしていました',
  itemId: 'item_1',
  contentIndex: 0,
  responseId: null,
  ...over,
})
const aiMeta = (over: Partial<RealtimeTranscriptEventMeta> = {}): RealtimeTranscriptEventMeta => ({
  role: 'ai',
  text: '志望動機を教えてください',
  itemId: 'item_ai',
  contentIndex: 0,
  responseId: 'resp_1',
  ...over,
})
const okPoster: DeliveryPoster = async () => ({ status: 200 })
const mk = (poster: DeliveryPoster, opts = {}) => new TranscriptDelivery(ctx, { poster, maxRetries: 3, retryBaseMs: 2, flushTimeoutMs: 200, ...opts })

afterEach(() => vi.restoreAllMocks())

describe('enqueue / payload', () => {
  it('A: applicant FINAL → event_type=input_audio_transcription.completed', async () => {
    const bodies: TranscriptPostBody[] = []
    const d = mk(async (b) => { bodies.push(b); return { status: 200 } })
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('success')
    expect(bodies[0].event_type).toBe('conversation.item.input_audio_transcription.completed')
    expect(bodies[0]).toMatchObject({ token: 'tok', applicant_id: 'app-1', interview_id: 'iv-1', item_id: 'item_1', content_index: 0, language: 'ja' })
  })

  it('B: AI FINAL → event_type=audio_transcript.done（response_id 付与）', async () => {
    const bodies: TranscriptPostBody[] = []
    const d = mk(async (b) => { bodies.push(b); return { status: 200 } })
    d.enqueue(aiMeta())
    await d.flush()
    expect(bodies[0].event_type).toBe('response.audio_transcript.done')
    expect(bodies[0].response_id).toBe('resp_1')
  })

  it('AB: server が信用しない speaker/source/seq/final/dedup_key を送らない', async () => {
    const bodies: TranscriptPostBody[] = []
    const d = mk(async (b) => { bodies.push(b); return { status: 200 } })
    d.enqueue(applicantMeta())
    await d.flush()
    const keys = Object.keys(bodies[0])
    for (const k of ['speaker', 'source', 'seq', 'final', 'dedup_key', 'companyId']) expect(keys).not.toContain(k)
  })

  it('C/D: item metadata 欠落（partial 相当）は POST しない', async () => {
    const poster = vi.fn(okPoster)
    const d = mk(poster)
    d.enqueue(applicantMeta({ itemId: null }))
    d.enqueue(applicantMeta({ contentIndex: null }))
    d.enqueue(applicantMeta({ text: '   ' })) // 空
    expect(await d.flush()).toBe('success')
    expect(poster).not.toHaveBeenCalled()
  })

  it('E: 同一 FINAL の重複 enqueue は 1 回だけ POST（browser dedup）', async () => {
    const poster = vi.fn(okPoster)
    const d = mk(poster)
    d.enqueue(applicantMeta())
    d.enqueue(applicantMeta())
    d.enqueue(applicantMeta())
    await d.flush()
    expect(poster).toHaveBeenCalledTimes(1)
  })

  it('Y: reconnect で別 item_id なら新発話として送る', async () => {
    const poster = vi.fn(okPoster)
    const d = mk(poster)
    d.enqueue(applicantMeta({ itemId: 'item_1' }))
    d.enqueue(applicantMeta({ itemId: 'item_2' }))
    await d.flush()
    expect(poster).toHaveBeenCalledTimes(2)
  })
})

describe('retry policy', () => {
  it('G: 200 → success（retry なし）', async () => {
    const poster = vi.fn(okPoster)
    const d = mk(poster)
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('success')
    expect(poster).toHaveBeenCalledTimes(1)
  })

  it('H: network 例外 → retry 後 success', async () => {
    let n = 0
    const poster = vi.fn(async () => { if (++n === 1) throw new Error('network'); return { status: 200 } })
    const d = mk(poster)
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('success')
    expect(poster).toHaveBeenCalledTimes(2)
  })

  it('I: 500 → retry 後 success', async () => {
    let n = 0
    const poster = vi.fn(async () => (++n === 1 ? { status: 500 } : { status: 200 }))
    const d = mk(poster)
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('success')
    expect(poster).toHaveBeenCalledTimes(2)
  })

  it('J: 429 → retry 対象', async () => {
    let n = 0
    const poster = vi.fn(async () => (++n === 1 ? { status: 429 } : { status: 200 }))
    const d = mk(poster)
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('success')
    expect(poster).toHaveBeenCalledTimes(2)
  })

  it('K: 400 → retry しない・partial_failure', async () => {
    const poster = vi.fn(async () => ({ status: 400 }))
    const d = mk(poster)
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('partial_failure')
    expect(poster).toHaveBeenCalledTimes(1)
  })

  it('L/M/N: 401/403/409 → retry しない', async () => {
    for (const status of [401, 403, 409]) {
      const poster = vi.fn(async () => ({ status }))
      const d = mk(poster)
      d.enqueue(applicantMeta())
      expect(await d.flush()).toBe('partial_failure')
      expect(poster).toHaveBeenCalledTimes(1)
    }
  })

  it('O: 一時失敗が続く → maxRetries で停止（無限 retry しない）', async () => {
    const poster = vi.fn(async () => ({ status: 500 }))
    const d = mk(poster, { maxRetries: 3, retryBaseMs: 1, flushTimeoutMs: 500 })
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('partial_failure')
    expect(poster).toHaveBeenCalledTimes(4) // 初回 + retry 3
  })
})

describe('flush', () => {
  it('P: queued を送り終えるまで待つ', async () => {
    const poster = vi.fn(okPoster)
    const d = mk(poster)
    d.enqueue(applicantMeta({ itemId: 'a' }))
    d.enqueue(applicantMeta({ itemId: 'b' }))
    expect(await d.flush()).toBe('success')
    expect(poster).toHaveBeenCalledTimes(2)
  })

  it('Q: in-flight POST を待つ', async () => {
    let resolved = false
    const poster: DeliveryPoster = async () => { await new Promise((r) => setTimeout(r, 20)); resolved = true; return { status: 200 } }
    const d = mk(poster, { flushTimeoutMs: 500 })
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('success')
    expect(resolved).toBe(true)
  })

  it('S/T: flush timeout（ハング poster）でも deadlock せず timeout を返す', async () => {
    const poster: DeliveryPoster = () => new Promise(() => {}) // 永久に resolve しない
    const d = mk(poster, { flushTimeoutMs: 30 })
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('timeout')
  })

  it('何も enqueue していない flush → success（即 resolve）', async () => {
    const d = mk(okPoster)
    expect(await d.flush()).toBe('success')
  })
})

describe('gate OFF / lifecycle', () => {
  it('X: 503（gate OFF）→ 以後 POST しない（storm なし）・flush は success（benign）', async () => {
    const poster = vi.fn(async () => ({ status: 503 }))
    const d = mk(poster)
    d.enqueue(applicantMeta({ itemId: 'a' }))
    expect(await d.flush()).toBe('success')
    d.enqueue(applicantMeta({ itemId: 'b' })) // disabled 後は enqueue しても送らない
    d.enqueue(applicantMeta({ itemId: 'c' }))
    await d.flush()
    expect(poster).toHaveBeenCalledTimes(1) // 最初の 1 回だけ（503 で無効化）
    expect(d.stats.disabled).toBe(true)
  })

  it('Z: destroy 後は enqueue を受けない・timer を残さない', async () => {
    const poster = vi.fn(okPoster)
    const d = mk(poster)
    d.destroy()
    d.enqueue(applicantMeta())
    expect(await d.flush()).toBe('success')
    expect(poster).not.toHaveBeenCalled()
  })
})

describe('PII / logging', () => {
  it('AC/AD: transcript 本文・token を console へ出さない', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 成功 + 恒久失敗 + network 例外 を混ぜる
    let n = 0
    const poster: DeliveryPoster = async () => { n++; if (n === 1) return { status: 200 }; if (n === 2) throw new Error('net'); return { status: 400 } }
    const d = mk(poster, { maxRetries: 1, retryBaseMs: 1 })
    d.enqueue(applicantMeta({ itemId: 'a' }))
    d.enqueue(applicantMeta({ itemId: 'b' }))
    await d.flush()
    expect(errSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

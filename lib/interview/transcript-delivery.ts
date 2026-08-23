// PR-19D: Realtime FINAL transcript event → secure ingestion API への client delivery layer。
//
// 責務:
//   - FINAL transcript event（PR-19A onTranscriptEvent の meta）を queue し、ingestion API へ POST する。
//   - browser 側の重複 POST を local dedup で抑制（最終的な冪等の権威は server/DB＝PR-19C + saveUtterance + DB unique）。
//   - 一時失敗（network / 408 / 429 / 5xx）だけ限定 retry（指数 backoff・最大回数あり・無限 retry しない）。
//   - permanent（400/401/403/404/409/413 等）は retry しない。
//   - gate OFF（503 = TRANSCRIPT_INGEST_DISABLED）は「session 中 delivery を無効化」して storm を防ぐ（benign）。
//   - flush() で queued/in-flight/retry 中を規定 timeout まで待って settle する（終了処理を永久に止めない）。
//   - transcript 本文 / token / PII を log しない（console 追加なし）。error にも本文を入れない。
//
// RealtimeClient は Realtime event 取得の責務を維持し、本 layer が delivery を所有する（session が本 layer を保持）。
// React rerender で queue を失わないよう、session 側は useRef で 1 インスタンスを保持する（本 class は状態を内部保持）。

import type { RealtimeTranscriptEventMeta } from './realtime-transcript-adapter'

export type DeliveryFlushStatus = 'success' | 'partial_failure' | 'timeout'

// server contract（PR-19C route）に厳密一致する POST body。speaker/source/seq/final/dedup_key/companyId は送らない。
export interface TranscriptPostBody {
  token: string
  applicant_id: string
  interview_id: string
  event_type: string
  transcript: string
  item_id: string
  content_index: number
  response_id?: string
  language?: string
}

// poster は HTTP status だけ返せばよい（body は不要・server が冪等/権威）。network 例外は status 0 とみなす。
export type DeliveryPoster = (body: TranscriptPostBody) => Promise<{ status: number }>

export interface TranscriptDeliveryContext {
  token: string
  applicantId: string
  interviewId: string
  language?: string | null
}

export interface TranscriptDeliveryOptions {
  poster: DeliveryPoster
  maxRetries?: number // default 3（無限 retry しない）
  retryBaseMs?: number // default 500（backoff = base * 2^(attempt-1)）
  flushTimeoutMs?: number // default 5000（終了処理を永久に止めない）
  now?: () => number
}

// role → FINAL event_type（PR-19A の逆写像）。server は event_type から speaker を再導出する。
function roleToEventType(role: RealtimeTranscriptEventMeta['role']): string {
  return role === 'ai' ? 'response.audio_transcript.done' : 'conversation.item.input_audio_transcription.completed'
}

// browser local な dedup key（server の `${speaker}:${itemId}:${contentIndex}` と整合的だが、local 最適化に過ぎない）。
function localDedupKey(meta: RealtimeTranscriptEventMeta): string | null {
  if (typeof meta.itemId !== 'string' || meta.itemId.length === 0) return null
  if (typeof meta.contentIndex !== 'number' || !Number.isInteger(meta.contentIndex)) return null
  return `${meta.role}:${meta.itemId}:${meta.contentIndex}`
}

// status 分類: ok=成功 / disable=gate OFF（503）/ retry=一時失敗 / permanent=恒久失敗。
function classify(status: number): 'ok' | 'disable' | 'retry' | 'permanent' {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 503) return 'disable' // TRANSCRIPT_INGEST_DISABLED（本番 gate OFF）→ session 中無効化
  if (status === 0 || status === 408 || status === 429 || status === 500 || status === 502 || status === 504) return 'retry'
  return 'permanent' // 400/401/403/404/409/413 等（retry しない）
}

interface DeliveryItem {
  body: TranscriptPostBody
  attempts: number
  nextAt: number
}

export class TranscriptDelivery {
  private readonly poster: DeliveryPoster
  private readonly maxRetries: number
  private readonly retryBaseMs: number
  private readonly flushTimeoutMs: number
  private readonly now: () => number

  private queue: DeliveryItem[] = []
  private readonly seen = new Set<string>() // local dedup（session 中保持）
  private processing = false
  private disabled = false // gate OFF or destroy
  private destroyed = false
  private sentCount = 0
  private failedCount = 0 // permanent / maxRetries 到達
  private idleWaiters: Array<() => void> = []
  private timers = new Set<ReturnType<typeof setTimeout>>()

  constructor(private readonly ctx: TranscriptDeliveryContext, opts: TranscriptDeliveryOptions) {
    this.poster = opts.poster
    this.maxRetries = opts.maxRetries ?? 3
    this.retryBaseMs = opts.retryBaseMs ?? 500
    this.flushTimeoutMs = opts.flushTimeoutMs ?? 5000
    this.now = opts.now ?? (() => Date.now())
  }

  // FINAL event を 1 件 enqueue（partial/delta は onTranscriptEvent が発火しない＝ここには来ない）。
  enqueue(meta: RealtimeTranscriptEventMeta): void {
    if (this.disabled || this.destroyed) return
    const key = localDedupKey(meta)
    if (key === null) return // item metadata 欠落 → server で fail-safe 拒否される。無駄な POST をしない
    if (this.seen.has(key)) return // local dedup（reconnect 再送を抑制）
    if (typeof meta.text !== 'string' || meta.text.trim().length === 0) return // 空は送らない
    this.seen.add(key)
    const body: TranscriptPostBody = {
      token: this.ctx.token,
      applicant_id: this.ctx.applicantId,
      interview_id: this.ctx.interviewId,
      event_type: roleToEventType(meta.role),
      transcript: meta.text,
      item_id: meta.itemId as string,
      content_index: meta.contentIndex as number,
    }
    if (typeof meta.responseId === 'string' && meta.responseId) body.response_id = meta.responseId
    if (typeof this.ctx.language === 'string' && this.ctx.language) body.language = this.ctx.language
    this.queue.push({ body, attempts: 0, nextAt: 0 })
    void this.process()
  }

  // queued / in-flight / retry 中が settle するまで flushTimeoutMs まで待つ。永久には待たない。
  async flush(): Promise<DeliveryFlushStatus> {
    void this.process()
    if (!this.processing && this.queue.length === 0) {
      return this.failedCount > 0 ? 'partial_failure' : 'success'
    }
    const idle = new Promise<'idle'>((res) => this.idleWaiters.push(() => res('idle')))
    let to: ReturnType<typeof setTimeout> | null = null
    const timeout = new Promise<'timeout'>((res) => {
      to = setTimeout(() => res('timeout'), this.flushTimeoutMs)
      this.timers.add(to)
    })
    const r = await Promise.race([idle, timeout])
    if (to) {
      clearTimeout(to)
      this.timers.delete(to)
    }
    if (r === 'timeout') return 'timeout'
    return this.failedCount > 0 ? 'partial_failure' : 'success'
  }

  // ページ離脱/終了で全 timer を止め、以後 enqueue を受けない（永遠に timer を残さない）。
  destroy(): void {
    this.destroyed = true
    this.disabled = true
    this.queue = []
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    this.notifyIdle()
  }

  // テスト観測用（本番挙動には影響しない）。
  get stats(): { sent: number; failed: number; disabled: boolean; queued: number } {
    return { sent: this.sentCount, failed: this.failedCount, disabled: this.disabled, queued: this.queue.length }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => {
      const t = setTimeout(() => {
        this.timers.delete(t)
        res()
      }, ms)
      this.timers.add(t)
    })
  }

  private takeReady(): DeliveryItem | null {
    const now = this.now()
    const idx = this.queue.findIndex((it) => it.nextAt <= now)
    if (idx < 0) return null
    return this.queue.splice(idx, 1)[0]
  }

  private earliestWaitMs(): number | null {
    if (this.queue.length === 0) return null
    const now = this.now()
    return Math.max(0, Math.min(...this.queue.map((it) => it.nextAt - now)))
  }

  private async process(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (!this.destroyed && !this.disabled) {
        const item = this.takeReady()
        if (!item) {
          const wait = this.earliestWaitMs()
          if (wait === null) break // 何も残っていない
          await this.sleep(Math.min(wait, this.retryBaseMs * 8)) // retry-ready まで待つ（上限あり）
          continue
        }
        let status: number
        try {
          status = (await this.poster(item.body)).status
        } catch {
          status = 0 // network 例外 → retry 対象（本文は握りつぶす・log しない）
        }
        const cls = classify(status)
        if (cls === 'ok') {
          this.sentCount++
        } else if (cls === 'disable') {
          this.disabled = true // gate OFF: 以後 POST しない（storm 防止・失敗扱いにしない）
          this.queue = []
        } else if (cls === 'permanent') {
          this.failedCount++ // retry しない
        } else {
          item.attempts++
          if (item.attempts > this.maxRetries) {
            this.failedCount++ // 上限到達 → 諦める（無限 retry しない）
          } else {
            item.nextAt = this.now() + this.retryBaseMs * 2 ** (item.attempts - 1)
            this.queue.push(item)
          }
        }
      }
    } finally {
      this.processing = false
      this.notifyIdle()
    }
  }

  private notifyIdle(): void {
    if (this.queue.length === 0 && !this.processing) {
      const waiters = this.idleWaiters
      this.idleWaiters = []
      for (const w of waiters) w()
    }
  }
}

// fetch ベースの poster を作る（session が使う）。token を URL/log に出さない（body のみ）。
export function createFetchTranscriptPoster(slug: string): DeliveryPoster {
  return async (body: TranscriptPostBody) => {
    const res = await fetch(`/api/interview/${slug}/transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status }
  }
}

// session 用ファクトリ（fetch poster を束ねる）。
export function createTranscriptDelivery(args: {
  slug: string
  context: TranscriptDeliveryContext
  options?: Omit<Partial<TranscriptDeliveryOptions>, 'poster'>
}): TranscriptDelivery {
  return new TranscriptDelivery(args.context, { poster: createFetchTranscriptPoster(args.slug), ...args.options })
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createDisconnectController,
  postOfferAndReadAnswer,
  isInterviewCompleteEvent,
  isTerminalRealtimeError,
  dispatchEvent,
  COMPLETE_INTERVIEW_TOOL,
} from './realtime-client'

// fetch/Response をモックするための最小ヘルパ。text() は制御可能（stall を再現できる）。
function makeRes(opts: {
  ok: boolean
  status: number
  text: () => Promise<string>
}): Response {
  return { ok: opts.ok, status: opts.status, text: opts.text } as unknown as Response
}

// PR-2 実装P2（Codex）: 一時的な WebRTC 'disconnected' で面接を確定終了しないための grace 制御。
// - 'failed' / 'closed'（終端）→ 即 onDisconnect
// - 'disconnected'（復旧可能）→ 8s grace。猶予内に 'connected' なら継続、超過で onDisconnect
// - onDisconnect は多重発火しない。close()/teardown（=clear）で grace timer を必ず解除
const GRACE = 8000

describe('createDisconnectController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // 1. disconnected → 8秒以内に connected へ復旧 → onDisconnect 非発火
  it('disconnected → grace 内に connected 復旧 → onDisconnect を呼ばない', () => {
    const onDisconnect = vi.fn()
    let state: RTCPeerConnectionState = 'connected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    state = 'disconnected'
    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(GRACE - 1) // まだ猶予内
    state = 'connected'
    ctl.handleStateChange('connected') // 復旧 → grace 解除

    vi.advanceTimersByTime(GRACE) // 元の timer が生きていれば発火してしまう
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  // 2. disconnected → grace 満了 → onDisconnect 1回だけ発火
  it('disconnected → grace 満了（復旧せず）→ onDisconnect を1回だけ発火', () => {
    const onDisconnect = vi.fn()
    const state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    ctl.handleStateChange('disconnected')
    expect(onDisconnect).not.toHaveBeenCalled() // まだ猶予中
    vi.advanceTimersByTime(GRACE)

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 3. failed → grace を待たず即 onDisconnect
  it('failed → 即 onDisconnect（grace を待たない）', () => {
    const onDisconnect = vi.fn()
    const ctl = createDisconnectController(() => 'failed', onDisconnect, GRACE)

    ctl.handleStateChange('failed')

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 4. closed → grace を待たず即 onDisconnect
  it('closed → 即 onDisconnect（grace を待たない）', () => {
    const onDisconnect = vi.fn()
    const ctl = createDisconnectController(() => 'closed', onDisconnect, GRACE)

    ctl.handleStateChange('closed')

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 5. disconnected 中に close()（=clear）→ timer 解除、後から onDisconnect 非発火
  it('disconnected 中に clear() → grace timer 解除・後から発火しない', () => {
    const onDisconnect = vi.fn()
    const state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    ctl.handleStateChange('disconnected')
    ctl.clear() // teardown / unmount 相当

    vi.advanceTimersByTime(GRACE * 2)
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  // 6. disconnected が複数回来ても timer 重複作成・二重発火しない
  it('disconnected が連続到来しても onDisconnect は1回だけ（timer 重複なし）', () => {
    const onDisconnect = vi.fn()
    const state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(1000)
    ctl.handleStateChange('disconnected') // 重複イベント（新規 timer を作らない）
    vi.advanceTimersByTime(1000)
    ctl.handleStateChange('disconnected')

    // 最初の disconnected から GRACE 経過時点で1回だけ発火（重複 timer なら複数回になる）
    vi.advanceTimersByTime(GRACE - 2000)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GRACE)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 7. disconnected → connected → 再度 disconnected で新しい grace timer が正常動作
  it('disconnected → connected 復旧 → 再 disconnected → 新しい grace で発火', () => {
    const onDisconnect = vi.fn()
    let state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    // 1回目: 復旧して発火しない
    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(GRACE - 1)
    state = 'connected'
    ctl.handleStateChange('connected')
    vi.advanceTimersByTime(GRACE)
    expect(onDisconnect).not.toHaveBeenCalled()

    // 2回目: 新しい grace が張られ、復旧しなければ発火
    state = 'disconnected'
    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(GRACE - 1)
    expect(onDisconnect).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })
})

// P1（Codex）: fetch timeout は answer SDP の body 読み取り完了まで有効。
// body stall でも必ず timeout して fallback へ。401/404 は blocking、その他は fallback。
describe('postOfferAndReadAnswer', () => {
  const URL = '/api/interview/x/realtime-call'
  const INIT = { method: 'POST', body: '{}' }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('正常: ok かつ text 解決 → { ok:true, sdp }', async () => {
    const fetchImpl = vi.fn(async () => makeRes({ ok: true, status: 200, text: async () => 'answer-sdp' }))
    const r = await postOfferAndReadAnswer(URL, INIT, 5000, fetchImpl as unknown as typeof fetch)
    expect(r).toEqual({ ok: true, sdp: 'answer-sdp' })
  })

  it('body stall: ヘッダは来たが text() が止まる → timeout で abort → fallback', async () => {
    // fetch は即 resolve（ヘッダ受信）。text() は signal.abort でのみ reject（body stall を再現）。
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal
      return makeRes({
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      })
    })
    const p = postOfferAndReadAnswer(URL, INIT, 5000, fetchImpl as unknown as typeof fetch)
    await vi.advanceTimersByTimeAsync(5000) // timeout がヘッダ後の body 読み取り中に発火する
    const r = await p
    expect(r).toEqual({ ok: false, reason: 'fallback', status: 200 })
  })

  it('401 → blocking, 404 → blocking', async () => {
    for (const status of [401, 404]) {
      const fetchImpl = vi.fn(async () => makeRes({ ok: false, status, text: async () => '' }))
      const r = await postOfferAndReadAnswer(URL, INIT, 5000, fetchImpl as unknown as typeof fetch)
      expect(r).toEqual({ ok: false, reason: 'blocking', status })
    }
  })

  it('503/403/409/500 → fallback', async () => {
    for (const status of [503, 403, 409, 500]) {
      const fetchImpl = vi.fn(async () => makeRes({ ok: false, status, text: async () => '' }))
      const r = await postOfferAndReadAnswer(URL, INIT, 5000, fetchImpl as unknown as typeof fetch)
      expect(r).toEqual({ ok: false, reason: 'fallback', status })
    }
  })

  it('fetch 自体が reject（通信障害）→ fallback', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network')
    })
    const r = await postOfferAndReadAnswer(URL, INIT, 5000, fetchImpl as unknown as typeof fetch)
    expect(r).toEqual({ ok: false, reason: 'fallback' })
  })

  it('空 body → fallback', async () => {
    const fetchImpl = vi.fn(async () => makeRes({ ok: true, status: 200, text: async () => '' }))
    const r = await postOfferAndReadAnswer(URL, INIT, 5000, fetchImpl as unknown as typeof fetch)
    expect(r).toEqual({ ok: false, reason: 'fallback', status: 200 })
  })

  // 追加P2（Codex）: 外部signalが既に abort 済みなら、fetch は即 abort されて fallback（POST しない=ロック取得/有料呼び出しに至らない）。
  it('外部signalが事前に aborted → fetch が abort されて fallback', async () => {
    vi.useRealTimers() // このテストは fake timer 不要（signal 経由の即時 abort）
    const ac = new AbortController()
    ac.abort() // 事前に破棄
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      // 実 fetch 同様、signal が aborted なら reject する
      if (init?.signal?.aborted) throw new Error('aborted')
      return makeRes({ ok: true, status: 200, text: async () => 'sdp' })
    })
    const r = await postOfferAndReadAnswer(URL, INIT, 5000, fetchImpl as unknown as typeof fetch, ac.signal)
    expect(r).toEqual({ ok: false, reason: 'fallback' })
  })

  // 外部signalが body 読み取り中に abort → fallback。
  it('外部signalが in-flight で abort → fallback', async () => {
    vi.useRealTimers()
    const ac = new AbortController()
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal
      return makeRes({
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            // 実 fetch 同様、既に abort 済みなら即 reject、以降の abort でも reject。
            if (signal?.aborted) return reject(new Error('aborted'))
            signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      })
    })
    const p = postOfferAndReadAnswer(URL, INIT, 60_000, fetchImpl as unknown as typeof fetch, ac.signal)
    await new Promise((r) => setTimeout(r, 10)) // fetch 解決 & text() 開始まで待つ
    ac.abort() // in-flight で破棄
    const r = await p
    expect(r).toEqual({ ok: false, reason: 'fallback', status: 200 })
  })
})

// 追加P1（Codex）: 全質問完了は complete_interview tool の明示シグナルでのみ発火（発話数に非依存）。
describe('isInterviewCompleteEvent / dispatchEvent completion signal', () => {
  it('response.function_call_arguments.done + name=complete_interview → true', () => {
    expect(
      isInterviewCompleteEvent({ type: 'response.function_call_arguments.done', name: COMPLETE_INTERVIEW_TOOL }),
    ).toBe(true)
  })

  it('response.output_item.done + item.type=function_call + item.name=complete_interview → true', () => {
    expect(
      isInterviewCompleteEvent({
        type: 'response.output_item.done',
        item: { type: 'function_call', name: COMPLETE_INTERVIEW_TOOL },
      }),
    ).toBe(true)
  })

  it('別 tool 名の function 呼び出し → false（誤終了しない）', () => {
    expect(
      isInterviewCompleteEvent({ type: 'response.function_call_arguments.done', name: 'other_tool' }),
    ).toBe(false)
  })

  it('発話文字起こし完了イベントは completion ではない → false', () => {
    expect(
      isInterviewCompleteEvent({ type: 'conversation.item.input_audio_transcription.completed' }),
    ).toBe(false)
  })

  it('dispatchEvent: completion シグナルで onInterviewComplete のみ発火（turn/transcript は呼ばれない）', () => {
    const cb = {
      onInterviewComplete: vi.fn(),
      onApplicantTurnComplete: vi.fn(),
      onTranscript: vi.fn(),
    }
    dispatchEvent(
      JSON.stringify({ type: 'response.function_call_arguments.done', name: COMPLETE_INTERVIEW_TOOL, call_id: 'c1' }),
      cb,
    )
    expect(cb.onInterviewComplete).toHaveBeenCalledTimes(1)
    expect(cb.onApplicantTurnComplete).not.toHaveBeenCalled()
    expect(cb.onTranscript).not.toHaveBeenCalled()
  })

  it('dispatchEvent: 応募者発話完了では onInterviewComplete を呼ばない（発話数で終了しない）', () => {
    const cb = { onInterviewComplete: vi.fn(), onApplicantTurnComplete: vi.fn() }
    dispatchEvent(
      JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'はい' }),
      cb,
    )
    expect(cb.onInterviewComplete).not.toHaveBeenCalled()
    expect(cb.onApplicantTurnComplete).toHaveBeenCalledTimes(1)
  })
})

// 追加P1/P2（Codex）: server error（{type:'error'}）は surface するが、多くは recoverable。
// terminal（session_expired 等）のみ terminal:true。呼び出し側は terminal のときだけ面接を終了する。
describe('isTerminalRealtimeError', () => {
  it('session_expired → terminal', () => {
    expect(isTerminalRealtimeError({ code: 'session_expired' })).toBe(true)
  })
  it('recoverable な error（server_error / invalid_request_error / 未指定）→ 非terminal', () => {
    expect(isTerminalRealtimeError({ code: 'server_error' })).toBe(false)
    expect(isTerminalRealtimeError({ code: 'invalid_request_error' })).toBe(false)
    expect(isTerminalRealtimeError({})).toBe(false)
    expect(isTerminalRealtimeError(null)).toBe(false)
    expect(isTerminalRealtimeError(undefined)).toBe(false)
  })
})

describe('dispatchEvent server error ({type:"error"})', () => {
  it('terminal error（session_expired）→ onServerError terminal:true で1回発火（他は呼ばない）', () => {
    const cb = {
      onServerError: vi.fn(),
      onInterviewComplete: vi.fn(),
      onApplicantTurnComplete: vi.fn(),
      onTranscript: vi.fn(),
    }
    dispatchEvent(
      JSON.stringify({ type: 'error', error: { code: 'session_expired', message: 'max duration' } }),
      cb,
    )
    expect(cb.onServerError).toHaveBeenCalledTimes(1)
    expect(cb.onServerError).toHaveBeenCalledWith({ code: 'session_expired', message: 'max duration', terminal: true })
    expect(cb.onInterviewComplete).not.toHaveBeenCalled()
    expect(cb.onApplicantTurnComplete).not.toHaveBeenCalled()
    expect(cb.onTranscript).not.toHaveBeenCalled()
  })

  it('recoverable error → surface はするが terminal:false（面接を終了させない）', () => {
    const cb = { onServerError: vi.fn() }
    dispatchEvent(
      JSON.stringify({ type: 'error', error: { code: 'server_error', message: 'transient' } }),
      cb,
    )
    expect(cb.onServerError).toHaveBeenCalledTimes(1)
    expect(cb.onServerError).toHaveBeenCalledWith({ code: 'server_error', message: 'transient', terminal: false })
  })

  it('error 詳細が無くても surface（terminal:false）', () => {
    const cb = { onServerError: vi.fn() }
    dispatchEvent(JSON.stringify({ type: 'error' }), cb)
    expect(cb.onServerError).toHaveBeenCalledTimes(1)
    expect(cb.onServerError).toHaveBeenCalledWith({ code: undefined, message: undefined, terminal: false })
  })

  it('通常イベントでは onServerError を呼ばない', () => {
    const cb = { onServerError: vi.fn(), onTranscript: vi.fn() }
    dispatchEvent(JSON.stringify({ type: 'response.audio_transcript.done', transcript: 'こんにちは' }), cb)
    expect(cb.onServerError).not.toHaveBeenCalled()
    expect(cb.onTranscript).toHaveBeenCalledTimes(1)
  })
})

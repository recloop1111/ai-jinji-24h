// ブラウザ側 WebRTC クライアント（PR-2・SDP proxy 方式）。
// ブラウザは OpenAI と直接ではなく、自社 /api/interview/[slug]/realtime-call へ offer SDP を送り、
// application/sdp の answer を受け取って P2P メディアを確立する。API キー/client_secret は扱わない。
// 音声メディアは確立後 browser↔OpenAI の P2P（自社は SDP 交換の初期化のみ）。

export type RealtimeCallbacks = {
  // AI 音声を再生するための remote MediaStream。
  onRemoteStream?: (stream: MediaStream) => void
  // 文字起こし（PR-2 はメモリ保持のみ。永続化は PR-3）。
  onTranscript?: (t: { role: 'applicant' | 'ai'; text: string }) => void
  // R1-A: FINAL transcript event の「生 event」を渡す（server 権威 ingest 用に item_id/content_index/response_id を含む）。
  //   呼び出し側が /api/interview/[slug]/transcript へ best-effort POST する（gate OFF なら 503・no-op）。
  onTranscriptEvent?: (evt: unknown) => void
  // 応募者ターンの完了（進捗表示用。PR-2 では /end を自動発火しない）。
  onApplicantTurnComplete?: () => void
  // 全質問完了シグナル（サーバー定義 tool complete_interview を AI が呼んだとき）。
  // 呼び出し側だけが handleEndInterview('全質問完了') を発火する（発話数カウントには依存しない）。
  onInterviewComplete?: () => void
  // 確立後の切断（呼び出し側で handleEndInterview 終了処理）。
  onDisconnect?: () => void
  // OpenAI がデータチャネルに送る server error（{type:'error'}）。黙殺しない（surface する）。
  // ただし多くの error は recoverable でセッション継続のため、terminal（session_expired 等・セッション終了）
  // のみ呼び出し側が面接を終了させる。recoverable は通知のみ（面接は継続）。
  onServerError?: (info: { code?: string; message?: string; terminal: boolean }) => void
}

// 面接完了シグナル用のサーバー定義 function tool 名（realtime.ts の tools 定義と一致させる）。
export const COMPLETE_INTERVIEW_TOOL = 'complete_interview'

export type RealtimeConnectResult =
  | { ok: true; close: () => void }
  // fallback: モック面接へ / blocking: token/flow 異常でブロッキング表示
  | { ok: false; reason: 'fallback' | 'blocking'; status?: number }

// realtime-call POST → answer SDP 読み取りまでの結果。
export type SdpAnswerResult =
  | { ok: true; sdp: string }
  | { ok: false; reason: 'fallback' | 'blocking'; status?: number }

// realtime-call へ offer を POST し answer SDP を読み取る。
// P1（Codex）: timeout はヘッダ受信時ではなく res.text()（body 読み取り）完了まで有効に保つ。
// body が stall しても必ず abort されて fallback へ進む（mode='connecting' で無限ハングしない）。
// 401/404 は blocking、それ以外の非OK（503/403/409/5xx）と通信/abort/空bodyは fallback。
export async function postOfferAndReadAnswer(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  externalSignal?: AbortSignal,
): Promise<SdpAnswerResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  // 追加P2（Codex）: 呼び出し側が試行を破棄したら（Strict Mode/依存変化での再setup）、この POST も
  // 中断してサーバのロック取得/有料 OpenAI 呼び出しに至らせない。外部signalを内部controllerへ橋渡し。
  const onExtAbort = () => ctrl.abort()
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort()
    else externalSignal.addEventListener('abort', onExtAbort, { once: true })
  }
  try {
    let res: Response
    try {
      res = await fetchImpl(url, { ...init, signal: ctrl.signal })
    } catch {
      // abort（ヘッダ待ちで timeout / 外部中断）/通信障害 → fallback。
      return { ok: false, reason: 'fallback' }
    }
    if (!res.ok) {
      const reason = res.status === 401 || res.status === 404 ? 'blocking' : 'fallback'
      return { ok: false, reason, status: res.status }
    }
    // timer はまだ動かしたまま body を読む（ヘッダは来たが SDP body が stall するケースを timeout で救う）。
    let sdp: string
    try {
      sdp = await res.text()
    } catch {
      // body 読み取り中の abort（timeout / 外部中断）→ fallback。
      return { ok: false, reason: 'fallback', status: res.status }
    }
    if (!sdp) return { ok: false, reason: 'fallback', status: res.status }
    return { ok: true, sdp }
  } finally {
    clearTimeout(timer) // 全経路で timer を解除（成功/失敗/例外いずれも）
    externalSignal?.removeEventListener('abort', onExtAbort)
  }
}

type ConnectInput = {
  slug: string
  token: string
  applicantId: string
  interviewId: string
  micStream: MediaStream
  callbacks?: RealtimeCallbacks
  iceTimeoutMs?: number
  fetchTimeoutMs?: number // realtime-call POST の上限（超過→abort→fallback）
  connectTimeoutMs?: number // WebRTC が connected になるまでの上限（超過→fallback）
  disconnectGraceMs?: number // 'disconnected' 復旧待ちの猶予（超過→onDisconnect）。既定 8000ms
  signal?: AbortSignal // 呼び出し側が試行を破棄したら中断（fetch=ロック取得/有料呼び出し前に abort）
  language?: string // 応募者選択の面接言語（サーバ側で許可コード検証。未指定は 'ja'）
}

// terminal（セッション終了）と判断する error.code。OpenAI Realtime の error は「多くが recoverable で
// セッション継続」なので、既定は非終端（surface のみ・面接を終了しない）。session_expired 等の明確な
// セッション終了コードのみ terminal 扱いで呼び出し側に終了させる。
const TERMINAL_REALTIME_ERROR_CODES = new Set(['session_expired'])
export function isTerminalRealtimeError(error: { code?: unknown } | null | undefined): boolean {
  return !!error && typeof error.code === 'string' && TERMINAL_REALTIME_ERROR_CODES.has(error.code)
}

// 確立後の connectionState 変化から onDisconnect 発火を管理するコントローラ。
// - 'failed' / 'closed' は終端（復旧不可）→ 即 onDisconnect。
// - 'disconnected' は復旧可能な中間状態 → grace（既定8s）を張り、猶予内に 'connected'
//   へ戻れば継続、戻らなければ onDisconnect。
// - onDisconnect は多重発火しない（fired ガード）。teardown/close は clear() で timer を必ず解除。
// RTCPeerConnection を直接握らずテスト可能にするため getState/onDisconnect を注入する。
export type DisconnectController = {
  handleStateChange: (state: RTCPeerConnectionState) => void
  clear: () => void
}

export function createDisconnectController(
  getState: () => RTCPeerConnectionState,
  onDisconnect: (() => void) | undefined,
  graceMs: number,
): DisconnectController {
  let graceTimer: ReturnType<typeof setTimeout> | null = null
  let fired = false
  const clear = () => {
    if (graceTimer) {
      clearTimeout(graceTimer)
      graceTimer = null
    }
  }
  const fire = () => {
    if (fired) return
    fired = true
    clear()
    onDisconnect?.()
  }
  const handleStateChange = (state: RTCPeerConnectionState) => {
    if (state === 'connected') {
      clear() // 復旧 → 保留中の grace を解除して継続
      return
    }
    if (state === 'failed' || state === 'closed') {
      fire() // 終端 → grace を待たず即終了
      return
    }
    if (state === 'disconnected') {
      if (graceTimer) return // 既に grace 中なら重複作成しない
      graceTimer = setTimeout(() => {
        graceTimer = null
        if (getState() !== 'connected') fire()
      }, graceMs)
    }
  }
  return { handleStateChange, clear }
}

// data channel イベントが「complete_interview tool 呼び出し完了」かを判定する。
// GA Realtime の関数呼び出し完了は response.function_call_arguments.done（name/call_id/arguments）で来るが、
// スキーマ差異に強くするため、関数呼び出し完了を表す複数形（arguments.done / output_item.done の function_call）
// と、その name が complete_interview のときだけ true。発話文字起こし数には一切依存しない。
export function isInterviewCompleteEvent(evt: {
  type?: unknown
  name?: unknown
  item?: { type?: unknown; name?: unknown } | null
}): boolean {
  const type = typeof evt?.type === 'string' ? evt.type : ''
  // 1) response.function_call_arguments.done（name 直下）
  if (type.includes('function_call') && type.endsWith('done')) {
    if (evt?.name === COMPLETE_INTERVIEW_TOOL) return true
    // 2) response.output_item.done で item.type==='function_call' の場合は item.name を見る
    const item = evt?.item
    if (item && item.type === 'function_call' && item.name === COMPLETE_INTERVIEW_TOOL) return true
  }
  // 3) response.output_item.done（type に function_call を含まない）でも item を確認
  if (type === 'response.output_item.done') {
    const item = evt?.item
    if (item && item.type === 'function_call' && item.name === COMPLETE_INTERVIEW_TOOL) return true
  }
  return false
}

export function dispatchEvent(raw: string, cb: RealtimeCallbacks | undefined): void {
  if (!cb) return
  let evt:
    | {
        type?: string
        transcript?: string
        name?: string
        item?: { type?: string; name?: string } | null
        error?: { code?: unknown; message?: unknown } | null
      }
    | null = null
  try {
    evt = JSON.parse(raw)
  } catch {
    return
  }
  const type = typeof evt?.type === 'string' ? evt.type : ''
  const text = typeof evt?.transcript === 'string' ? evt.transcript : ''
  // 追加P1/P2（Codex）: OpenAI の server error（{type:'error'}）。黙殺せず surface するが、
  // 多くは recoverable（セッション継続）なので terminal（session_expired 等）のみ terminal:true とし、
  // 呼び出し側はそのときだけ面接を終了する（recoverable で使える面接を不必要に終了しない）。
  if (type === 'error') {
    const err = evt?.error ?? null
    cb.onServerError?.({
      code: typeof err?.code === 'string' ? err.code : undefined,
      message: typeof err?.message === 'string' ? err.message : undefined,
      terminal: isTerminalRealtimeError(err),
    })
    return
  }
  // 全質問完了シグナル（サーバー定義 tool complete_interview の呼び出し）。呼び出し側だけが /end する。
  if (isInterviewCompleteEvent(evt ?? {})) {
    cb.onInterviewComplete?.()
    return
  }
  // 応募者の発話文字起こし完了 → transcript ＋ ターン完了（進行カウント）。
  if (type.includes('input_audio_transcription') && type.endsWith('completed')) {
    if (text) {
      cb.onTranscript?.({ role: 'applicant', text })
      cb.onTranscriptEvent?.(evt) // 生 event を server 権威 ingest へ（best-effort・gate OFF なら no-op）
    }
    cb.onApplicantTurnComplete?.()
    return
  }
  // AI の応答文字起こし完了。
  if (type.includes('audio_transcript') && type.endsWith('done')) {
    if (text) {
      cb.onTranscript?.({ role: 'ai', text })
      cb.onTranscriptEvent?.(evt)
    }
    return
  }
  // 未知イベントは無視（スキーマ差異に強くする）。
}

export async function connectRealtimeCall(input: ConnectInput): Promise<RealtimeConnectResult> {
  const { slug, token, applicantId, interviewId, micStream, callbacks, signal, language } = input
  const fetchTimeoutMs = input.fetchTimeoutMs ?? 12000
  const connectTimeoutMs = input.connectTimeoutMs ?? 12000
  const disconnectGraceMs = input.disconnectGraceMs ?? 8000
  // 追加P2（Codex）: 破棄済み試行は副作用（SDP proxy への POST＝ロック取得/有料呼び出し）を起こさない。
  if (signal?.aborted) return { ok: false, reason: 'fallback' }
  let pc: RTCPeerConnection | null = null
  try {
    pc = new RTCPeerConnection()

    // マイク（音声のみ）を送出。
    const audioTrack = micStream.getAudioTracks()[0]
    if (audioTrack) pc.addTrack(audioTrack, micStream)

    // AI 音声の受信。
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) callbacks?.onRemoteStream?.(e.streams[0])
    }

    // イベント用 data channel。
    const dc = pc.createDataChannel('oai-events')
    dc.onmessage = (e) => dispatchEvent(typeof e.data === 'string' ? e.data : '', callbacks)
    // P1-a: open 時に response.create を送り、AI 面接官が最初の質問を音声で開始する。
    dc.onopen = () => {
      try {
        dc.send(JSON.stringify({ type: 'response.create' }))
      } catch {
        /* noop */
      }
    }

    // offer 生成 ＋ ICE 収集（trickle 不要・最大 iceTimeoutMs で打ち切り）。
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitIceGathering(pc, input.iceTimeoutMs ?? 2000)

    const offerSdp = pc.localDescription?.sdp ?? offer.sdp ?? ''

    // 破棄済みなら POST を投げない（ロック取得/有料呼び出しを避ける）。
    if (signal?.aborted) {
      pc.close()
      return { ok: false, reason: 'fallback' }
    }

    // P1-b: 自社 SDP proxy へ。timeout は answer SDP の body 読み取り完了まで有効（ヘッダ受信で解除しない）。
    // 追加P2: 外部signalでも中断（破棄された古い試行が並行してロック取得/有料呼び出しに進むのを防ぐ）。
    const answer = await postOfferAndReadAnswer(
      `/api/interview/${slug}/realtime-call`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          applicant_id: applicantId,
          interview_id: interviewId,
          sdp: offerSdp,
          language,
        }),
      },
      fetchTimeoutMs,
      fetch,
      signal,
    )
    if (!answer.ok) {
      pc.close()
      return { ok: false, reason: answer.reason, status: answer.status }
    }
    if (signal?.aborted) {
      pc.close()
      return { ok: false, reason: 'fallback' }
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })

    // P2-a: connected を待ってから成功扱い。接続前の失敗/timeout はモックへ fallback。
    const connected = await waitConnected(pc, connectTimeoutMs)
    if (!connected || signal?.aborted) {
      pc.close()
      return { ok: false, reason: 'fallback' }
    }

    const peer = pc
    // 確立後の切断は onDisconnect で通知（呼び出し側が handleEndInterview で終了処理）。
    // 'disconnected' は復旧可能なため即終了せず grace を張る（failed/closed は即終了）。
    const disconnectCtl = createDisconnectController(
      () => peer.connectionState,
      callbacks?.onDisconnect,
      disconnectGraceMs,
    )
    peer.onconnectionstatechange = () => disconnectCtl.handleStateChange(peer.connectionState)
    return {
      ok: true,
      close: () => {
        peer.onconnectionstatechange = null
        disconnectCtl.clear() // teardown 後に grace timer が遅延発火して二重 /end しないよう解除
        try {
          dc.close()
        } catch {
          /* noop */
        }
        try {
          peer.close()
        } catch {
          /* noop */
        }
      },
    }
  } catch {
    // WebRTC 確立前の失敗はモックへフォールバック。
    try {
      pc?.close()
    } catch {
      /* noop */
    }
    return { ok: false, reason: 'fallback' }
  }
}

// connected になるまで待つ（bounded）。failed/closed/timeout は false。
function waitConnected(pc: RTCPeerConnection, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (pc.connectionState === 'connected') return resolve(true)
    let settled = false
    const finish = (v: boolean) => {
      if (settled) return
      settled = true
      pc.removeEventListener('connectionstatechange', check)
      resolve(v)
    }
    const check = () => {
      const s = pc.connectionState
      if (s === 'connected') finish(true)
      else if (s === 'failed' || s === 'closed') finish(false)
    }
    pc.addEventListener('connectionstatechange', check)
    setTimeout(() => finish(false), timeoutMs)
  })
}

function waitIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve()
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    pc.addEventListener('icegatheringstatechange', check)
    setTimeout(done, timeoutMs)
  })
}

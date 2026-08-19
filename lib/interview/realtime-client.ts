// ブラウザ側 WebRTC クライアント（PR-2・SDP proxy 方式）。
// ブラウザは OpenAI と直接ではなく、自社 /api/interview/[slug]/realtime-call へ offer SDP を送り、
// application/sdp の answer を受け取って P2P メディアを確立する。API キー/client_secret は扱わない。
// 音声メディアは確立後 browser↔OpenAI の P2P（自社は SDP 交換の初期化のみ）。

export type RealtimeCallbacks = {
  // AI 音声を再生するための remote MediaStream。
  onRemoteStream?: (stream: MediaStream) => void
  // 文字起こし（PR-2 はメモリ保持のみ。永続化は PR-3）。
  onTranscript?: (t: { role: 'applicant' | 'ai'; text: string }) => void
  // 応募者ターンの完了（進捗表示用。PR-2 では /end を自動発火しない）。
  onApplicantTurnComplete?: () => void
  // 確立後の切断（呼び出し側で handleEndInterview 終了処理）。
  onDisconnect?: () => void
}

export type RealtimeConnectResult =
  | { ok: true; close: () => void }
  // fallback: モック面接へ / blocking: token/flow 異常でブロッキング表示
  | { ok: false; reason: 'fallback' | 'blocking'; status?: number }

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

function dispatchEvent(raw: string, cb: RealtimeCallbacks | undefined): void {
  if (!cb) return
  let evt: { type?: string; transcript?: string } | null = null
  try {
    evt = JSON.parse(raw)
  } catch {
    return
  }
  const type = typeof evt?.type === 'string' ? evt.type : ''
  const text = typeof evt?.transcript === 'string' ? evt.transcript : ''
  // 応募者の発話文字起こし完了 → transcript ＋ ターン完了（進行カウント）。
  if (type.includes('input_audio_transcription') && type.endsWith('completed')) {
    if (text) cb.onTranscript?.({ role: 'applicant', text })
    cb.onApplicantTurnComplete?.()
    return
  }
  // AI の応答文字起こし完了。
  if (type.includes('audio_transcript') && type.endsWith('done')) {
    if (text) cb.onTranscript?.({ role: 'ai', text })
    return
  }
  // 未知イベントは無視（スキーマ差異に強くする）。
}

export async function connectRealtimeCall(input: ConnectInput): Promise<RealtimeConnectResult> {
  const { slug, token, applicantId, interviewId, micStream, callbacks } = input
  const fetchTimeoutMs = input.fetchTimeoutMs ?? 12000
  const connectTimeoutMs = input.connectTimeoutMs ?? 12000
  const disconnectGraceMs = input.disconnectGraceMs ?? 8000
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

    // P1-b: 自社 SDP proxy へ。AbortController で必ず時間内に解決させ、abort/障害は fallback。
    const ctrl = new AbortController()
    const fetchTimer = setTimeout(() => ctrl.abort(), fetchTimeoutMs)
    let res: Response
    try {
      res = await fetch(`/api/interview/${slug}/realtime-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, applicant_id: applicantId, interview_id: interviewId, sdp: offerSdp }),
        signal: ctrl.signal,
      })
    } catch {
      // abort/通信障害 → fallback（mode='connecting' で止めない）。
      pc.close()
      return { ok: false, reason: 'fallback' }
    } finally {
      clearTimeout(fetchTimer)
    }
    if (!res.ok) {
      pc.close()
      // 401/404 は flow/token 異常＝ブロッキング。それ以外（503/403/409/5xx）はモックへ。
      const reason = res.status === 401 || res.status === 404 ? 'blocking' : 'fallback'
      return { ok: false, reason, status: res.status }
    }

    const answerSdp = await res.text()
    if (!answerSdp) {
      pc.close()
      return { ok: false, reason: 'fallback', status: res.status }
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

    // P2-a: connected を待ってから成功扱い。接続前の失敗/timeout はモックへ fallback。
    const connected = await waitConnected(pc, connectTimeoutMs)
    if (!connected) {
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

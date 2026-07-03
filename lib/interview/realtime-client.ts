// ブラウザ側 WebRTC クライアント（PR-2・SDP proxy 方式）。
// ブラウザは OpenAI と直接ではなく、自社 /api/interview/[slug]/realtime-call へ offer SDP を送り、
// application/sdp の answer を受け取って P2P メディアを確立する。API キー/client_secret は扱わない。
// 音声メディアは確立後 browser↔OpenAI の P2P（自社は SDP 交換の初期化のみ）。

export type RealtimeCallbacks = {
  // AI 音声を再生するための remote MediaStream。
  onRemoteStream?: (stream: MediaStream) => void
  // 文字起こし（PR-2 はメモリ保持のみ。永続化は PR-3）。
  onTranscript?: (t: { role: 'applicant' | 'ai'; text: string }) => void
  // 応募者ターンの完了（進行カウント用）。
  onApplicantTurnComplete?: () => void
  // 面接全体の完了シグナル（AI クローズ）。
  onDone?: () => void
  // 予期せぬ切断。
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
    pc.onconnectionstatechange = () => {
      if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
        callbacks?.onDisconnect?.()
      }
    }

    // イベント用 data channel。
    const dc = pc.createDataChannel('oai-events')
    dc.onmessage = (e) => dispatchEvent(typeof e.data === 'string' ? e.data : '', callbacks)

    // offer 生成 ＋ ICE 収集（trickle 不要・最大 iceTimeoutMs で打ち切り）。
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitIceGathering(pc, input.iceTimeoutMs ?? 2000)

    const offerSdp = pc.localDescription?.sdp ?? offer.sdp ?? ''

    // 自社 SDP proxy へ。成功時 application/sdp の answer、失敗時 JSON error。
    const res = await fetch(`/api/interview/${slug}/realtime-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, applicant_id: applicantId, interview_id: interviewId, sdp: offerSdp }),
    })
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

    const peer = pc
    return {
      ok: true,
      close: () => {
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

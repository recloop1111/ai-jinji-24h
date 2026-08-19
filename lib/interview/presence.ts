// Phase I-1: 面接画面の「状態管理の土台」。
// 面接官プレゼンス（今 AI が何をしているか）の正規状態と、その遷移ロジックを純モジュールへ分離する。
// - Realtime には一切依存しない。現在の mock 面接だけで状態を確認できる（MockPresenceDriver）。
// - 状態更新の入口を setPhase 一点に集約する設計（呼び出し側が渡す）。
// - 将来 #21（Realtime response lifecycle / live transcript）は、同じ setPhase を別ドライバから駆動する
//   （本モジュールに Realtime 実配線は含めない・seam のみ）。

// 面接官プレゼンスの正規状態。
//   connecting: 接続/準備中（面接開始直後）
//   idle:       待機（ラベル非表示）
//   listening:  応募者の発話を聞いている
//   thinking:   応答を考えている
//   speaking:   質問/発話している
//   ending:     面接を終了処理中（終端・以後は他状態へ遷移しない）
export type InterviewPhase = 'connecting' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'ending'

// 応募者向けの状態ラベル（idle は非表示＝空文字）。I-2 で見た目（アニメ）を付ける。
export const INTERVIEW_PHASE_LABELS: Record<InterviewPhase, string> = {
  connecting: '接続しています…',
  idle: '',
  listening: '聞いています…',
  thinking: '考えています…',
  speaking: '質問しています',
  ending: '面接を終了しています…',
}

// 1問あたりのサブ演出タイムライン（mock）。1問の提示 = speaking→listening→thinking を intervalMs 内に収める。
// speaking: 0〜30% / listening: 30〜80% / thinking: 80〜100%（次の質問提示で speaking に戻る）。
export function mockPhaseOffsets(intervalMs: number): { listeningAtMs: number; thinkingAtMs: number } {
  const safe = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0
  const listeningAtMs = Math.round(safe * 0.3)
  const thinkingAtMs = Math.max(listeningAtMs, Math.round(safe * 0.8))
  return { listeningAtMs, thinkingAtMs }
}

export type MockPresenceDriver = {
  // 新しい質問が提示されたとき（AI が質問を読み上げ始める）に呼ぶ。speaking→listening→thinking を予約する。
  onQuestionPresented: () => void
  // 全 timer を解除し、以後 setPhase を呼ばない（cleanup / 面接終了時）。
  stop: () => void
}

// mock 面接用のプレゼンス・ドライバ。timer 系は注入可能（テストで fake timer / スパイを使える）。
// stop 後は onQuestionPresented も予約済み timer も一切 setPhase を呼ばない（古い timer による書き換え防止）。
export function createMockPresenceDriver(opts: {
  setPhase: (p: InterviewPhase) => void
  intervalMs: number
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void
}): MockPresenceDriver {
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout
  const { listeningAtMs, thinkingAtMs } = mockPhaseOffsets(opts.intervalMs)

  let timers: ReturnType<typeof setTimeout>[] = []
  let stopped = false

  const clearTimers = () => {
    timers.forEach((t) => clearTimeoutFn(t))
    timers = []
  }

  return {
    onQuestionPresented() {
      if (stopped) return
      clearTimers() // 前の質問のサブ timer を破棄（次質問で speaking に戻す）
      opts.setPhase('speaking')
      timers.push(
        setTimeoutFn(() => {
          if (!stopped) opts.setPhase('listening')
        }, listeningAtMs),
      )
      timers.push(
        setTimeoutFn(() => {
          if (!stopped) opts.setPhase('thinking')
        }, thinkingAtMs),
      )
    },
    stop() {
      stopped = true
      clearTimers()
    },
  }
}

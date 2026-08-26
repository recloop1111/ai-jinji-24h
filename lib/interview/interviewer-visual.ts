// PR: AI面接官の「視覚状態（neutral/speaking/listening）」への写像（純関数・DOM/Realtime 非依存）。
//   runtime state（presence phase / AI 発話・応募者回答の signal）→ 3 状態のどれを表示するかを 1 箇所に固定する。
//   画面側に状態判定を分散させない（session/practice はここを呼ぶだけ）。
//
// 状態優先順位（STEP 4・競合防止）: 1) AI speaking  2) applicant listening  3) neutral
//   AI が発話中なのに listening 画像になる等の競合を防ぐため、speaking を最優先で判定する。

import type { InterviewPhase } from './presence'
import type { InterviewerVisualState } from './interviewer-identity'

export type { InterviewerVisualState }

// presence phase → 視覚状態。
//   speaking（AI 発話）→ speaking / listening（応募者回答待ち・回答中）→ listening /
//   connecting・idle・thinking・ending・その他 → neutral。
export function interviewerVisualForPhase(phase: InterviewPhase | null | undefined): InterviewerVisualState {
  if (phase === 'speaking') return 'speaking'
  if (phase === 'listening') return 'listening'
  return 'neutral'
}

// 明示 signal からの解決（precedence を型で担保）。session の Realtime 経路など、
// 複数の boolean を持つ場合はこちらで一元判定する（speaking > listening > neutral）。
export function resolveInterviewerVisual(input: {
  aiSpeaking?: boolean | null
  applicantListening?: boolean | null
}): InterviewerVisualState {
  if (input.aiSpeaking) return 'speaking' // 最優先
  if (input.applicantListening) return 'listening'
  return 'neutral'
}

// 練習画面の「回答終了」判定（純ロジック・SpeechRecognition/DOM 非依存）。
//
// 正式仕様: 応募者が一度発話を開始した後、最後の発話から約5秒無音で回答終了とみなす。
//   - 質問提示直後（未発話）から5秒を数えない。未発話のまま時間が経過しても回答完了にしない。
//   - hasSpoken=true（発話を検出した）かつ 最後の発話から silenceMs 以上経過で true。

export const ANSWER_SILENCE_MS = 5000 // 発話終了とみなす無音（約5秒）

export function shouldEndPracticeAnswer(input: {
  hasSpoken: boolean
  lastSpeechAtMs: number | null
  nowMs: number
  silenceMs?: number
}): boolean {
  if (!input.hasSpoken || input.lastSpeechAtMs === null) return false // 未発話は終了にしない
  return input.nowMs - input.lastSpeechAtMs >= (input.silenceMs ?? ANSWER_SILENCE_MS)
}

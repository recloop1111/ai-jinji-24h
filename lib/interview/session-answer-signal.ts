// 本番セッションの「回答終了 signal」設計（純ロジック・Realtime 非接続）。
//
// 正式 UX: 「回答を終える」ボタンは常時表示しない（default 非表示）。5秒無音は「次へ強制」ではなく
//   「応募者の今回の回答が終了した可能性が高い」という signal（user_answer_complete）。次に何を聞くか
//   （深掘り or 次の本質問）は AI が判断する。ここでは signal 名と fallback 表示条件のみを純ロジックで固定する。
//   ※ OpenAI Realtime actual への本配線は R1 で VAD / transcript final / response lifecycle を確認後に行う。

export const ANSWER_COMPLETE_SIGNAL = 'user_answer_complete' as const

// fallback「回答を終える」を表示してよいか。通常は非表示。AI 発話中は非表示。回答終了検出が長時間
//   確定しない場合のみ控えめに表示する（押下も直接 nextQuestion せず signal を送る意味）。
export function shouldShowAnswerCompleteFallback(input: {
  aiSpeaking: boolean
  answerCompleteDetected: boolean
  waitElapsedMs: number
  thresholdMs?: number
}): boolean {
  if (input.aiSpeaking) return false
  if (input.answerCompleteDetected) return false
  return input.waitElapsedMs >= (input.thresholdMs ?? 20000)
}

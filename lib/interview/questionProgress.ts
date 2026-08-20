// Phase I-3: 質問進捗（X/Y）と「あなたの番」補助文言の純ロジック（UI非依存＝単体テスト可能）。
// 状態ソースは PR I-1 の InterviewPhase / mode。Realtime には配線しない（seam のみ）。

import type { InterviewPhase } from './presence'

export type QuestionMode = 'connecting' | 'realtime' | 'mock'

export type QuestionProgress = {
  visible: boolean
  label: string // 例: '質問 3 / 11'（visible=false のとき空）
  current: number
  total: number
}

// 質問進捗の表示可否とラベルを決める。
//   - mock: 現在提示中の質問番号(1-based)が確定できるので X/Y を表示。
//   - realtime: 現時点で正確な質問index を確定できない（PR#11の教訓＝発話数/transcript数を進捗にしない）ため
//     非表示。将来 #21 の explicit progression signal が currentIndex を供給したときのみ表示する seam。
//   - connecting/準備中・total 不明(<=0)・index<1（未提示）も非表示。index は [1,total] にクランプして
//     範囲外の表示を作らない。
export function computeQuestionProgress(input: {
  mode: QuestionMode
  currentIndex: number
  total: number
}): QuestionProgress {
  const total = Number.isFinite(input.total) && input.total > 0 ? Math.floor(input.total) : 0
  const rawIndex = Number.isFinite(input.currentIndex) ? Math.floor(input.currentIndex) : 0
  const reliable = input.mode === 'mock' // realtime は index 不確定のため誤った進捗を出さない

  if (!reliable || total <= 0 || rawIndex < 1) {
    return { visible: false, label: '', current: 0, total }
  }
  const current = Math.min(Math.max(rawIndex, 1), total)
  return { visible: true, label: `質問 ${current} / ${total}`, current, total }
}

// listening（応募者の回答ターン）のときだけ「あなたの番」ガイドを返す。
// speaking/thinking/connecting/ending/idle では null（矛盾する文言を出さない）。
export function turnHintForPhase(phase: InterviewPhase): string | null {
  return phase === 'listening' ? 'あなたの番です。マイクに向かってお話しください。' : null
}

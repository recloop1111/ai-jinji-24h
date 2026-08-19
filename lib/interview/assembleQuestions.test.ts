import { describe, it, expect } from 'vitest'
import { DEFAULT_INTERVIEW_QUESTIONS, isDefaultQuestionSnapshot } from './assembleQuestions'

// 追加P2（Codex）: 既定質問のみの snapshot（job無し/pattern未設定の mock フォールバック）を content 比較で識別。
// realtime-call はこれを Realtime 対象外（mockへ）とするために使う。
describe('isDefaultQuestionSnapshot', () => {
  it('既定質問と一致する snapshot → true', () => {
    expect(isDefaultQuestionSnapshot(DEFAULT_INTERVIEW_QUESTIONS)).toBe(true)
    // sort_order 等が違っても question_text 一致で判定
    expect(isDefaultQuestionSnapshot([{ question_text: DEFAULT_INTERVIEW_QUESTIONS[0].question_text, sort_order: 9 }])).toBe(true)
  })

  it('設定済みの質問 / 長さ違い / 非配列 → false', () => {
    expect(isDefaultQuestionSnapshot([{ question_text: '志望動機は？', sort_order: 1 }])).toBe(false)
    expect(
      isDefaultQuestionSnapshot([
        { question_text: DEFAULT_INTERVIEW_QUESTIONS[0].question_text, sort_order: 1 },
        { question_text: '追加質問', sort_order: 2 },
      ]),
    ).toBe(false)
    expect(isDefaultQuestionSnapshot([])).toBe(false)
    expect(isDefaultQuestionSnapshot(null)).toBe(false)
    expect(isDefaultQuestionSnapshot('x')).toBe(false)
  })
})

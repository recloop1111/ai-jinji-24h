import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  classifyTermination,
  computeIsBillable,
  mainQuestionThreshold,
  BILLING_MIN_DURATION_SECONDS,
  BILLING_ALT_DURATION_SECONDS,
} from './interview-eligibility'

// 正式課金仕様（旧「10分超で課金」廃止）。1 interview = 最大1 billing unit。server-side 判定・client 値は信用しない。

const min = (m: number) => m * 60

describe('classifyTermination（終了理由の論理分類）', () => {
  it('completed', () => {
    expect(classifyTermination({ finalStatus: 'completed', endReason: '全質問完了' })).toBe('completed')
  })
  it('11. applicant_exit（自主終了/user_ended/browser_closed）', () => {
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: '自主終了' })).toBe('applicant_exit')
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: 'user_ended' })).toBe('applicant_exit')
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: 'browser_closed' })).toBe('applicant_exit')
  })
  it('13. 時間切れ/timeout → time_limit（面接時間を最後まで提供＝applicant_exit ではない）', () => {
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: '時間切れ' })).toBe('time_limit')
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: 'timeout' })).toBe('time_limit')
  })
  it('12. silence → applicant_exit（本人 inactivity による途中終了・現状 session は未送出）', () => {
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: 'silence' })).toBe('applicant_exit')
  })
  it('14. technical / forced / unknown', () => {
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: 'disconnected' })).toBe('technical_failure')
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: 'inappropriate' })).toBe('forced_termination')
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: null })).toBe('unknown')
  })
})

describe('time_limit（面接時間の上限まで提供）は必ず課金', () => {
  it('13. time_limit → 面接時間・質問数に関係なく true', () => {
    expect(computeIsBillable({ category: 'time_limit', durationSeconds: min(3), answeredMainQuestions: 0, totalMainQuestions: 10 })).toBe(true)
    expect(computeIsBillable({ category: 'time_limit', durationSeconds: min(15), answeredMainQuestions: null, totalMainQuestions: null })).toBe(true)
  })
})

describe('mainQuestionThreshold（50%・必ず ceil）', () => {
  it('例のとおり', () => {
    expect(mainQuestionThreshold(10)).toBe(5)
    expect(mainQuestionThreshold(9)).toBe(5)
    expect(mainQuestionThreshold(5)).toBe(3)
    expect(mainQuestionThreshold(3)).toBe(2)
    expect(mainQuestionThreshold(1)).toBe(1)
  })
  it('total 不明/0 → null', () => {
    expect(mainQuestionThreshold(0)).toBeNull()
    expect(mainQuestionThreshold(null)).toBeNull()
    expect(mainQuestionThreshold(undefined)).toBeNull()
  })
})

describe('computeIsBillable（正式仕様の網羅）', () => {
  const exit = (durationSeconds: number, answered: number | null, total: number | null) =>
    computeIsBillable({ category: 'applicant_exit', durationSeconds, answeredMainQuestions: answered, totalMainQuestions: total })

  it('1. completed / 2分 → true', () => {
    expect(computeIsBillable({ category: 'completed', durationSeconds: min(2), answeredMainQuestions: 5, totalMainQuestions: 5 })).toBe(true)
  })
  it('2. completed / 8分 → true', () => {
    expect(computeIsBillable({ category: 'completed', durationSeconds: min(8), answeredMainQuestions: 2, totalMainQuestions: 5 })).toBe(true)
  })
  it('3. 10問中5問 / 6分 / applicant_exit → true', () => {
    expect(exit(min(6), 5, 10)).toBe(true)
  })
  it('4. 10問中4問 / 6分 / applicant_exit → false', () => {
    expect(exit(min(6), 4, 10)).toBe(false)
  })
  it('5. 10問中3問 / 9分 / applicant_exit → true（8分以上）', () => {
    expect(exit(min(9), 3, 10)).toBe(true)
  })
  it('6. 10問中5問 / 2分 / applicant_exit → false（3分未満）', () => {
    expect(exit(min(2), 5, 10)).toBe(false)
  })
  it('7. 5問中3問 / 4分 / applicant_exit → true（ceil(2.5)=3）', () => {
    expect(exit(min(4), 3, 5)).toBe(true)
  })
  it('8. 5問中2問 / 4分 / applicant_exit → false', () => {
    expect(exit(min(4), 2, 5)).toBe(false)
  })
  it('9. 9問中5問 / 5分 → true（50%以上）', () => {
    expect(exit(min(5), 5, 9)).toBe(true)
  })
  it('10. 9問中4問 / 5分 → false（50%未満）', () => {
    expect(exit(min(5), 4, 9)).toBe(false)
  })
  it('11. network failure / 12分 → false', () => {
    expect(computeIsBillable({ category: 'technical_failure', durationSeconds: min(12), answeredMainQuestions: 10, totalMainQuestions: 10 })).toBe(false)
  })
  it('12. server failure / 12分 → false', () => {
    expect(computeIsBillable({ category: 'system_failure', durationSeconds: min(12), answeredMainQuestions: 10, totalMainQuestions: 10 })).toBe(false)
  })
  it('13. system failure / 12分 → false（unknown も含め非課金）', () => {
    expect(computeIsBillable({ category: 'unknown', durationSeconds: min(12), answeredMainQuestions: 10, totalMainQuestions: 10 })).toBe(false)
  })
  it('14. forced termination / 12分 → false', () => {
    expect(computeIsBillable({ category: 'forced_termination', durationSeconds: min(12), answeredMainQuestions: 10, totalMainQuestions: 10 })).toBe(false)
  })
  it('15. total 不明 / applicant_exit / 9分 → true（8分ルール）', () => {
    expect(exit(min(9), null, null)).toBe(true)
  })
  it('16. total 不明 / applicant_exit / 6分 → false（50%不可・8分未満）', () => {
    expect(exit(min(6), null, null)).toBe(false)
  })
  it('境界: ちょうど3分 & 50%以上 → true / 3分ちょうどだが50%未満 → false', () => {
    expect(exit(BILLING_MIN_DURATION_SECONDS, 5, 10)).toBe(true)
    expect(exit(BILLING_MIN_DURATION_SECONDS, 4, 10)).toBe(false)
    expect(exit(BILLING_MIN_DURATION_SECONDS - 1, 10, 10)).toBe(false) // 3分未満は回答率に依らず false
  })
  it('境界: ちょうど8分は回答率に依らず true', () => {
    expect(exit(BILLING_ALT_DURATION_SECONDS, 0, 10)).toBe(true)
  })
})

describe('end/route.ts: server-authoritative 判定・client 値非依存・冪等・部分データ保存・不採用自動化なし', () => {
  const END = readFileSync(join(process.cwd(), 'app/api/interview/[slug]/end/route.ts'), 'utf8')
  it('新 billing pure logic（computeIsBillable/classifyTermination）を使用し、旧 >600 を撤去', () => {
    expect(END).toContain('computeIsBillable')
    expect(END).toContain('classifyTermination')
    expect(END).not.toContain('durationSeconds > 600')
  })
  it('1/2. answered/total は server 解決（snapshot / interview_progress）で、課金判定に client body を使わない', () => {
    expect(END).toContain('questions_snapshot')
    expect(END).toContain('interview_progress')
    expect(END).toContain('restoreProgress')
    expect(END).toContain('serverTotalMain')
    expect(END).toContain('serverAnsweredMain')
    // computeIsBillable / DB 保存とも body.answered_questions / body.total_questions を渡さない
    expect(END).not.toContain('body.answered_questions')
    expect(END).not.toContain('body.total_questions')
  })
  it('3/4. server progress 取得不能時は client 値へ fallback せず null（＝50%不使用・8分ルールのみ）', () => {
    // 取得失敗は serverAnsweredMain = null（catch）。client への silent fallback が無い。
    expect(END).toMatch(/catch[\s\S]{0,120}serverAnsweredMain = null/)
  })
  it('5/6. DB 保存も server-resolved / normalized 値（answered は total にクランプ・client raw 非保存）', () => {
    expect(END).toContain('total_questions: serverTotalMain')
    expect(END).toContain('answered_questions: serverAnsweredMain')
  })
  it('duration は server 算出（started_at 由来）を課金判定に使う', () => {
    expect(END).toContain('started_at')
    expect(END).toMatch(/durationSeconds\s*=/)
  })
  it('15/18. 冪等: in_progress のときだけ確定（already_finalized で二重課金しない）', () => {
    expect(END).toContain("interview.status !== 'in_progress'")
    expect(END).toContain('already_finalized')
    expect(END).toContain("status', 'in_progress')")
  })
  it('16. 部分データ保存: cancelled でも duration/total/answered/end_reason を保存（削除しない）', () => {
    expect(END).toContain('total_questions:')
    expect(END).toContain('answered_questions:')
    expect(END).toContain('duration_seconds:')
    expect(END).not.toContain('.delete(')
  })
  it('7/8/9. 途中離脱は status=途中離脱・result=不採用 を自動設定しない（既存 result を上書きしない）', () => {
    expect(END).toContain("'途中離脱'")
    expect(END).not.toContain("applicantUpdate.result = '不採用'")
    expect(END).not.toContain("result: '不採用'")
  })
})

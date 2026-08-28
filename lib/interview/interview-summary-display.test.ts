import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  formatInterviewDuration,
  formatAnsweredProgress,
  isAnsweredProgressAvailable,
  endReasonLabel,
  interviewBillingLabel,
  aiEvaluationAbsenceMessage,
} from './interview-summary-display'

describe('formatInterviewDuration（duration_seconds 優先・null≠0）', () => {
  it('6. duration_seconds=372 → 6分12秒', () => {
    expect(formatInterviewDuration({ durationSeconds: 372 })).toBe('6分12秒')
  })
  it('19分05秒（1145秒・0埋め）', () => {
    expect(formatInterviewDuration({ durationSeconds: 1145 })).toBe('19分05秒')
  })
  it('7. duration_seconds null → started/ended から fallback', () => {
    expect(
      formatInterviewDuration({ durationSeconds: null, startedAt: '2026-08-01T00:00:00Z', endedAt: '2026-08-01T00:06:12Z' }),
    ).toBe('6分12秒')
  })
  it('duration_seconds 優先（timestamps があっても duration を使う）', () => {
    expect(
      formatInterviewDuration({ durationSeconds: 372, startedAt: '2026-08-01T00:00:00Z', endedAt: '2026-08-01T00:20:00Z' }),
    ).toBe('6分12秒')
  })
  it('0秒 は "0分00秒"（null と区別）', () => {
    expect(formatInterviewDuration({ durationSeconds: 0 })).toBe('0分00秒')
  })
  it('取得不能（duration null＋timestamps 無し）→ null', () => {
    expect(formatInterviewDuration({ durationSeconds: null })).toBeNull()
    expect(formatInterviewDuration({ durationSeconds: null, startedAt: '2026-08-01T00:00:00Z', endedAt: null })).toBeNull()
  })
})

describe('formatAnsweredProgress（null と 0 を必ず区別・null を 0 にしない）', () => {
  it('1. answered=5,total=10 → 5 / 10問', () => {
    expect(formatAnsweredProgress({ answered: 5, total: 10 })).toBe('5 / 10問')
  })
  it('2. answered=0,total=10 → 0 / 10問', () => {
    expect(formatAnsweredProgress({ answered: 0, total: 10 })).toBe('0 / 10問')
  })
  it('3. answered=null,total=10 → — / 10問', () => {
    expect(formatAnsweredProgress({ answered: null, total: 10 })).toBe('— / 10問')
  })
  it('4. answered=null,total=null → —', () => {
    expect(formatAnsweredProgress({ answered: null, total: null })).toBe('—')
  })
  it('answered=0,total=null → 0問', () => {
    expect(formatAnsweredProgress({ answered: 0, total: null })).toBe('0問')
  })
  it('5. null answered を 0 と表示しない', () => {
    expect(formatAnsweredProgress({ answered: null, total: 10 })).not.toContain('0 /')
    expect(formatAnsweredProgress({ answered: null, total: null })).not.toContain('0')
  })
  it('isAnsweredProgressAvailable: answered と total 両方 numeric のときだけ true（片方 null は未取得）', () => {
    expect(isAnsweredProgressAvailable({ answered: 3, total: 10 })).toBe(true)
    expect(isAnsweredProgressAvailable({ answered: 0, total: 10 })).toBe(true)
    expect(isAnsweredProgressAvailable({ answered: null, total: 10 })).toBe(false) // 片方 null → 未取得
    expect(isAnsweredProgressAvailable({ answered: 5, total: null })).toBe(false)
    expect(isAnsweredProgressAvailable({ answered: null, total: null })).toBe(false)
  })
})

describe('endReasonLabel（DB raw → 企業向け日本語・本人都合と技術エラーを区別）', () => {
  it('8. 自主終了 → 応募者による途中終了', () => {
    expect(endReasonLabel('自主終了')).toBe('応募者による途中終了')
    expect(endReasonLabel('user_ended')).toBe('応募者による途中終了')
  })
  it('9. 時間切れ → 面接時間終了', () => {
    expect(endReasonLabel('時間切れ')).toBe('面接時間終了')
    expect(endReasonLabel('timeout')).toBe('面接時間終了')
  })
  it('10. disconnected → 接続エラーにより終了', () => {
    expect(endReasonLabel('disconnected')).toBe('接続エラーにより終了')
  })
  it('その他の mapping', () => {
    expect(endReasonLabel('全質問完了')).toBe('面接完了')
    expect(endReasonLabel('browser_closed')).toBe('応募者が画面を閉じて終了')
    expect(endReasonLabel('silence')).toBe('応答がないため終了')
    expect(endReasonLabel('inappropriate')).toBe('システムにより終了')
  })
  it('null/unknown → 終了理由不明', () => {
    expect(endReasonLabel(null)).toBe('終了理由不明')
    expect(endReasonLabel('hacked')).toBe('終了理由不明')
  })
  it('11. disconnected を「応募者による」と表示しない', () => {
    expect(endReasonLabel('disconnected')).not.toContain('応募者')
  })
})

describe('interviewBillingLabel（利用計上・金額は出さない・demo は 1件と誤解させない）', () => {
  it('12. is_billable=true（非demo）→ 1件', () => {
    expect(interviewBillingLabel(true, false)).toBe('1件')
  })
  it('13. is_billable=false → 対象外', () => {
    expect(interviewBillingLabel(false, false)).toBe('対象外')
  })
  it('is_billable=null（非demo確定）→ —', () => {
    expect(interviewBillingLabel(null, false)).toBe('—')
  })
  it('demo は is_billable に関わらず「対象外（デモ企業）」（1件にしない）', () => {
    expect(interviewBillingLabel(true, true)).toBe('対象外（デモ企業）')
    expect(interviewBillingLabel(true, true)).not.toContain('1件')
  })
  it('10. demo 判定 unknown（null/undefined）→「—」（誤って 1件と出さない）', () => {
    expect(interviewBillingLabel(true, null)).toBe('—')
    expect(interviewBillingLabel(true, undefined)).toBe('—')
    expect(interviewBillingLabel(true, null)).not.toContain('1件')
  })
  it('金額（円）を含まない', () => {
    for (const v of [interviewBillingLabel(true, false), interviewBillingLabel(false, false), interviewBillingLabel(true, true)]) {
      expect(v).not.toMatch(/円|¥|[0-9],[0-9]{3}/)
    }
  })
})

describe('aiEvaluationAbsenceMessage（technical と本人都合を区別・断定しない）', () => {
  it('自主終了 → 面接が途中で終了したため…（本人がやめたと断定しない）', () => {
    const m = aiEvaluationAbsenceMessage('cancelled', '自主終了')
    expect(m).toContain('面接が途中で終了したため')
  })
  it('11/6. disconnected → 接続上の問題…（応募者都合と断定しない）', () => {
    const m = aiEvaluationAbsenceMessage('cancelled', 'disconnected')
    expect(m).toContain('接続上の問題')
    expect(m).not.toContain('応募者')
  })
})

describe('applicants/[id]/page.tsx: 途中離脱UX 配線＋DUMMY 撤去', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/client/(dashboard)/applicants/[id]/page.tsx'), 'utf8')
  it('15/16. DUMMY fake evaluation object を撤去（山田太郎/架空スコア等が無い）', () => {
    expect(PAGE).not.toContain('const DUMMY')
    expect(PAGE).not.toContain('山田 太郎')
    expect(PAGE).not.toContain('DUMMY.highlights')
    expect(PAGE).not.toContain('DUMMY.recordingDuration')
  })
  it('4/5. 回答進捗は formatAnsweredProgress を使い ?? 0 の誤表示をしない', () => {
    expect(PAGE).toContain('formatAnsweredProgress')
    expect(PAGE).not.toContain('answered_questions ?? 0')
  })
  it('3. 面接時間は formatInterviewDuration（duration_seconds SoT）', () => {
    expect(PAGE).toContain('formatInterviewDuration')
    expect(PAGE).toContain('duration_seconds')
  })
  it('5/7. 終了理由・利用計上 helper を使用（demo は DB 権威 API 由来の isDemoCompany）', () => {
    expect(PAGE).toContain('endReasonLabel(interview.end_reason)')
    expect(PAGE).toContain('interviewBillingLabel(interview.is_billable, isDemoCompany)')
    expect(PAGE).toContain('/api/client/company-flags')
  })
  it('9/14. Transcript は completed 限定にしない（cancelled でも取得）', () => {
    // interview_id 絞り込みのみ（status 条件を付けない）
    expect(PAGE).toContain("from('interview_transcripts')")
    expect(PAGE).not.toMatch(/interview_transcripts[\s\S]{0,200}eq\('status'/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveEndOutcome, isAllowedEndReason, claimsTimeLimit, ALLOWED_END_REASONS } from './end-reason'
import { classifyTermination, computeIsBillable } from '@/lib/billing/interview-eligibility'

// 終了トリガー → {end_reason, final_status, 正常完了か} の一貫解決＋課金カテゴリとの整合を固定。

describe('resolveEndOutcome（トリガー → final_status / 正常完了）', () => {
  it('1/2/3/4/5. 時間切れ = 面接時間上限まで提供 → completed（正常完了・complete フロー）', () => {
    const o = resolveEndOutcome('時間切れ')
    expect(o.finalStatus).toBe('completed')
    expect(o.isNormalCompletion).toBe(true)
    expect(o.endReason).toBe('時間切れ') // 全質問完了とは別ラベルで企業が区別可能
  })
  it('全質問完了 → completed（正常完了）', () => {
    const o = resolveEndOutcome('全質問完了')
    expect(o.finalStatus).toBe('completed')
    expect(o.isNormalCompletion).toBe(true)
  })
  it('6. 自主終了 → cancelled（applicant_exit・/ended）', () => {
    const o = resolveEndOutcome('自主終了')
    expect(o.finalStatus).toBe('cancelled')
    expect(o.isNormalCompletion).toBe(false)
    expect(o.endReason).toBe('自主終了')
  })
  it('9. disconnected → cancelled（technical・/ended）', () => {
    const o = resolveEndOutcome('disconnected')
    expect(o.finalStatus).toBe('cancelled')
    expect(o.isNormalCompletion).toBe(false)
    expect(o.endReason).toBe('disconnected')
  })
})

describe('resolveEndOutcome → classifyTermination → computeIsBillable の一貫性', () => {
  const bill = (trigger: Parameters<typeof resolveEndOutcome>[0], durationSeconds: number, answered: number | null, total: number | null) => {
    const o = resolveEndOutcome(trigger)
    const category = classifyTermination({ finalStatus: o.finalStatus, endReason: o.endReason })
    return computeIsBillable({ category, durationSeconds, answeredMainQuestions: answered, totalMainQuestions: total })
  }
  it('4. 時間切れ → billable true（面接時間・質問数に依らず）', () => {
    expect(bill('時間切れ', 60, 8, 10)).toBe(true) // 1分でも time-limit(=completed) なら課金
    expect(classifyTermination({ finalStatus: 'completed', endReason: '時間切れ' })).toBe('completed')
  })
  it('5. 全質問完了 → billable true', () => {
    expect(bill('全質問完了', 120, 10, 10)).toBe(true)
  })
  it('6/7. 自主終了 → applicant_exit（課金ゲート維持: 6分5/10=true・2分=false）', () => {
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: '自主終了' })).toBe('applicant_exit')
    expect(bill('自主終了', 360, 5, 10)).toBe(true)
    expect(bill('自主終了', 120, 5, 10)).toBe(false)
  })
  it('9/10/11/12/13. disconnected（Realtime/network/technical）→ technical_failure・billable false（12分でも）', () => {
    expect(classifyTermination({ finalStatus: 'cancelled', endReason: 'disconnected' })).toBe('technical_failure')
    expect(bill('disconnected', 720, 10, 10)).toBe(false)
  })
})

describe('end_reason allow-list（DB CHECK と一致・未知値は 4xx）', () => {
  it('11. 正式 allow-list 値はすべて許可', () => {
    for (const r of ALLOWED_END_REASONS) expect(isAllowedEndReason(r)).toBe(true)
    expect(ALLOWED_END_REASONS).toContain('disconnected')
    expect(ALLOWED_END_REASONS).toContain('時間切れ')
  })
  it('12. 未知値は不許可（API 側で 4xx にする対象）', () => {
    expect(isAllowedEndReason('hacked')).toBe(false)
    expect(isAllowedEndReason('completed_now')).toBe(false)
    expect(isAllowedEndReason('')).toBe(false)
    expect(isAllowedEndReason(null)).toBe(false)
    expect(isAllowedEndReason(undefined)).toBe(false)
  })
})

describe('claimsTimeLimit（時間切れ主張の識別・server duration 検証対象）', () => {
  it('時間切れ/timeout のみ true', () => {
    expect(claimsTimeLimit('時間切れ')).toBe(true)
    expect(claimsTimeLimit('timeout')).toBe(true)
    expect(claimsTimeLimit('自主終了')).toBe(false)
    expect(claimsTimeLimit('全質問完了')).toBe(false)
    expect(claimsTimeLimit(null)).toBe(false)
  })
})

describe('end/route.ts: time_limit server 検証＋end_reason allow-list（client 値を信用しない）', () => {
  const END = readFileSync(join(process.cwd(), 'app/api/interview/[slug]/end/route.ts'), 'utf8')
  it('12/13. end_reason を allow-list 検証し未知値は VALIDATION_ERROR（DB CHECK 500 回避）', () => {
    expect(END).toContain('isAllowedEndReason')
    expect(END).toMatch(/!isAllowedEndReason[\s\S]{0,120}VALIDATION_ERROR/)
    // DB へ送るのは検証済み endReasonValue（生の body.end_reason を直接保存しない）
    expect(END).toContain('endReasonValue')
    expect(END).not.toContain("end_reason: typeof body.end_reason")
  })
  it('5/6/7/8/9. 時間切れ主張は server duration>=MAX-tolerance を要求（未達は 4xx・finalize しない）', () => {
    expect(END).toContain('claimsTimeLimit')
    expect(END).toContain('MAX_INTERVIEW_SECONDS')
    expect(END).toContain('TIME_LIMIT_TOLERANCE_SECONDS')
    expect(END).toMatch(/claimsTimeLimit\(endReasonValue\)[\s\S]{0,160}VALIDATION_ERROR/)
    // 検証は finalize（UPDATE）より前（return で弾く）
    const idxCheck = END.indexOf('claimsTimeLimit(endReasonValue)')
    const idxUpdate = END.indexOf("status', 'in_progress')")
    expect(idxCheck).toBeGreaterThan(0)
    expect(idxUpdate).toBeGreaterThan(idxCheck)
  })
  it('10. is_billable は computeIsBillable（server 算出）で確定し、client 値から代入しない', () => {
    expect(END).toContain('const isBillable = computeIsBillable(')
    // body.is_billable を is_billable へ代入していない（コメントでの言及は許容）
    expect(END).not.toMatch(/is_billable\s*=\s*body\.is_billable/)
  })
})

describe('session/page.tsx: 終了理由の整合（time_limit=completed / Realtime障害=disconnected）', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/session/page.tsx'), 'utf8')
  it('handleEndInterview は resolveEndOutcome で final_status/正常完了を解決', () => {
    expect(PAGE).toContain('resolveEndOutcome')
    expect(PAGE).toContain('outcome.finalStatus')
    expect(PAGE).toContain('outcome.isNormalCompletion')
  })
  it('8/9. onDisconnect / terminal onServerError は自主終了にせず disconnected（technical）で終了', () => {
    // onDisconnect が '自主終了' を呼ばない
    expect(PAGE).toMatch(/onDisconnect:[\s\S]{0,240}handleEndInterview\('disconnected'/)
    // terminal server error も disconnected
    expect(PAGE).toMatch(/onServerError:[\s\S]{0,240}handleEndInterview\('disconnected'/)
    // Realtime callbacks が '自主終了' を使っていない（voluntary は終了ボタンのみ）
    expect(PAGE).not.toMatch(/onDisconnect:[\s\S]{0,240}handleEndInterview\('自主終了'/)
  })
  it('10/13. 時間切れは handleEndInterview("時間切れ")→time_limit(completed)。技術切断と区別', () => {
    expect(PAGE).toContain("handleEndInterview('時間切れ')")
    expect(PAGE).toContain("handleEndInterview('disconnected'")
  })
  it('15. 途中離脱時 result=不採用 を自動設定しない（session は result を書かない）', () => {
    expect(PAGE).not.toContain("result: '不採用'")
  })
})

import { describe, it, expect } from 'vitest'
import { checkEvaluationEligibility, type InterviewEvalContext } from './eligibility'

const ctx = (over: Partial<InterviewEvalContext['interview']> = {}, appOver: Partial<InterviewEvalContext['applicant']> = {}): InterviewEvalContext => ({
  interview: { id: 'iv-1', applicantId: 'app-1', status: 'completed', ...over },
  applicant: { id: 'app-1', companyId: 'co-1', ...appOver },
})

describe('checkEvaluationEligibility', () => {
  it('completed + 自社 company → ok', () => {
    expect(checkEvaluationEligibility({ context: ctx(), auth: { kind: 'company', companyId: 'co-1' } })).toEqual({ ok: true })
  })
  it('admin / internal → 全社 ok', () => {
    expect(checkEvaluationEligibility({ context: ctx(), auth: { kind: 'admin' } }).ok).toBe(true)
    expect(checkEvaluationEligibility({ context: ctx(), auth: { kind: 'internal' } }).ok).toBe(true)
  })
  it('cross-company → unauthorized', () => {
    expect(checkEvaluationEligibility({ context: ctx(), auth: { kind: 'company', companyId: 'co-OTHER' } })).toMatchObject({ ok: false, status: 'unauthorized', reason: 'cross_company' })
  })
  it('interview が別 applicant → not_found（cross-applicant 整合違反）', () => {
    const c = ctx({ applicantId: 'app-2' })
    expect(checkEvaluationEligibility({ context: c, auth: { kind: 'admin' } })).toMatchObject({ ok: false, status: 'not_found' })
  })
  it('in_progress → conflict(in_progress)', () => {
    expect(checkEvaluationEligibility({ context: ctx({ status: 'in_progress' }), auth: { kind: 'admin' } })).toMatchObject({ ok: false, status: 'conflict', reason: 'in_progress' })
  })
  it('cancelled → conflict(not_completed)（安全側で対象外）', () => {
    expect(checkEvaluationEligibility({ context: ctx({ status: 'cancelled' }), auth: { kind: 'admin' } })).toMatchObject({ ok: false, status: 'conflict', reason: 'not_completed' })
  })
})

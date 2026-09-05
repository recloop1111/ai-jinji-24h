import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const RESUME = read('app/api/client/applicants/[id]/resume-pdf/route.ts')
const APPREPORT = read('app/api/client/applicants/[id]/applicant-report-pdf/route.ts')
const CSV = read('app/api/client/applicants/export/csv/route.ts')
const STATUS = read('app/api/client/applicants/[id]/status/route.ts')
const MEMBER = read('app/api/client/members/[id]/route.ts')
const INVITE = read('app/api/client/members/invite/route.ts')
const REGEN = read('app/api/client/members/invite/[id]/regenerate/route.ts')
const REVOKE = read('app/api/client/members/invite/[id]/route.ts')
const ACCEPT = read('app/api/invite/accept/route.ts')
const BILLING = read('app/api/client/billing-profile/route.ts')
const PLAN = read('app/api/client/plan/route.ts')
const SETPW = read('app/api/client/security/setting-password/route.ts')
const SUS_REQ = read('app/api/client/suspension/request/route.ts')
const SUS_CAN = read('app/api/client/suspension/cancel/route.ts')
const SUS_EMG = read('app/api/client/suspension/emergency/route.ts')
const TEMPLATE = read('app/api/client/templates/[id]/route.ts')

describe('export routes: fail-closed audit（記録できなければ download 中止）', () => {
  const cases: Array<[string, string, string]> = [
    ['resume-pdf', RESUME, 'applicant.resume_pdf_exported'],
    ['applicant-report-pdf', APPREPORT, 'applicant.report_pdf_exported'],
    ['csv', CSV, 'applicant.csv_exported'],
  ]
  for (const [name, src, action] of cases) {
    it(`${name}: writeCompanyAuditLog(${action}) ＋ !audit.ok で 500`, () => {
      expect(src).toContain('writeCompanyAuditLog')
      expect(src).toContain(`action: '${action}'`)
      expect(src).toContain('if (!audit.ok) return apiError')
    })
  }
  it('CSV metadata は件数のみ（応募者 id 配列を入れない）', () => {
    expect(CSV).toContain('exported_count')
    expect(CSV).not.toContain('applicant_ids')
  })
})

describe('mutation routes: best-effort audit（primary を fail させない）', () => {
  it('status: result/memo それぞれ audit・memo 本文を metadata に入れない', () => {
    expect(STATUS).toContain("action: 'applicant.selection_result_changed'")
    expect(STATUS).toContain("action: 'applicant.selection_memo_changed'")
    expect(STATUS).toContain('metadata: { from_result: oldResult, to_result: newResult as string }')
    // memo audit の metadata は空（本文を入れない）
    expect(STATUS).toContain("action: 'applicant.selection_memo_changed', resourceType: 'applicant', resourceId: id, metadata: {}")
    // export のような fail-closed にしない
    expect(STATUS).not.toContain('if (!audit.ok)')
  })
  it('member [id]: role/suspend/reactivate/remove の action', () => {
    for (const a of ['member.role_changed', 'member.suspended', 'member.reactivated', 'member.removed']) expect(MEMBER).toContain(`'${a}'`)
    expect(MEMBER).not.toContain('if (!audit.ok)')
  })
  it('invite lifecycle: created/regenerated/revoked/joined・token を metadata に入れない', () => {
    expect(INVITE).toContain("action: 'member.invite_created'")
    expect(REGEN).toContain("action: 'member.invite_regenerated'")
    expect(REVOKE).toContain("action: 'member.invite_revoked'")
    expect(ACCEPT).toContain("action: 'member.joined'")
    for (const src of [INVITE, REGEN, REVOKE, ACCEPT]) {
      expect(src).not.toContain('token: token')
      expect(src).not.toContain('metadata: { token')
      expect(src).not.toContain('inviteUrl,\n      action')
    }
  })
  it('settings mutations: billing/plan/setting-password/suspension/template', () => {
    expect(BILLING).toContain("action: 'company.billing_profile_changed'")
    expect(PLAN).toContain("action: 'company.plan_changed'")
    expect(SETPW).toContain("action: 'company.setting_password_changed'")
    expect(SUS_REQ).toContain("action: 'company.suspension_requested'")
    expect(SUS_CAN).toContain("action: 'company.suspension_cancelled'")
    expect(SUS_EMG).toContain("action: 'company.emergency_suspension_requested'")
    expect(TEMPLATE).toContain("action: 'template.updated'")
  })
  it('setting-password は password/hash を metadata に入れない', () => {
    // setting_password_changed の metadata は空
    expect(SETPW).toContain("action: 'company.setting_password_changed', resourceType: 'company', resourceId: user.companyId, metadata: {}")
  })
})

import { describe, it, expect } from 'vitest'
import { can, PERMISSIONS, type Permission } from './permissions'

// role matrix（Phase E-5-2 確定）を表で検証。表と実装がずれたら FAIL する。
const MATRIX: Record<Permission, { owner: boolean; admin: boolean; recruiter: boolean; viewer: boolean }> = {
  'applicant.read':                 { owner: true,  admin: true,  recruiter: true,  viewer: true },
  'resume.pdf.download':            { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'report.pdf.download':            { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'applicant_report.pdf.download':  { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'applicant_report.email_share':   { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'share_link.manage':              { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'selection.manage':               { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'applicant_memo.manage':          { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'job.manage':                     { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'question.manage':                { owner: true,  admin: true,  recruiter: true,  viewer: false },
  'member.manage':                  { owner: true,  admin: true,  recruiter: false, viewer: false },
  'member.role_change':             { owner: true,  admin: true,  recruiter: false, viewer: false },
  'audit.read':                     { owner: true,  admin: true,  recruiter: false, viewer: false },
  'company_settings.manage':        { owner: true,  admin: true,  recruiter: false, viewer: false },
  'billing.manage':                 { owner: true,  admin: false, recruiter: false, viewer: false },
  'subscription.manage':            { owner: true,  admin: false, recruiter: false, viewer: false },
  'company_destructive_action':     { owner: true,  admin: false, recruiter: false, viewer: false },
}

describe('can(role, permission) — role matrix', () => {
  it('全 permission を matrix で網羅している', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...PERMISSIONS].sort())
  })

  for (const permission of PERMISSIONS) {
    const row = MATRIX[permission]
    it(`owner: ${permission} = ${row.owner}`, () => expect(can('owner', permission)).toBe(row.owner))
    it(`admin: ${permission} = ${row.admin}`, () => expect(can('admin', permission)).toBe(row.admin))
    it(`recruiter: ${permission} = ${row.recruiter}`, () => expect(can('recruiter', permission)).toBe(row.recruiter))
    it(`viewer: ${permission} = ${row.viewer}`, () => expect(can('viewer', permission)).toBe(row.viewer))
  }

  it('viewer は read-only（read のみ true、write系はすべて false）', () => {
    expect(can('viewer', 'applicant.read')).toBe(true)
    for (const p of PERMISSIONS) {
      if (p === 'applicant.read') continue
      expect(can('viewer', p)).toBe(false)
    }
  })

  it('billing/subscription/破壊操作は owner のみ', () => {
    for (const p of ['billing.manage', 'subscription.manage', 'company_destructive_action'] as Permission[]) {
      expect(can('owner', p)).toBe(true)
      expect(can('admin', p)).toBe(false)
      expect(can('recruiter', p)).toBe(false)
      expect(can('viewer', p)).toBe(false)
    }
  })

  it('member 管理は owner/admin のみ', () => {
    for (const p of ['member.manage', 'member.role_change'] as Permission[]) {
      expect(can('owner', p)).toBe(true)
      expect(can('admin', p)).toBe(true)
      expect(can('recruiter', p)).toBe(false)
      expect(can('viewer', p)).toBe(false)
    }
  })

  it('UNKNOWN role / null / 運営 role は default deny', () => {
    expect(can(null, 'applicant.read')).toBe(false)
    expect(can(undefined, 'applicant.read')).toBe(false)
    expect(can('staff', 'applicant.read')).toBe(false)
    // 運営 admin role を企業 role として使わせない
    expect(can('super_admin' as unknown as string, 'billing.manage')).toBe(false)
    expect(can('admin', 'billing.manage')).toBe(false) // 企業 admin であって owner ではない
  })
})

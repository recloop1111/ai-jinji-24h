import { describe, it, expect } from 'vitest'
import { COMPANY_ROLES, COMPANY_MEMBER_STATUSES, isCompanyRole, isCompanyMemberStatus } from './roles'

describe('CompanyRole 基礎型（DB CHECK と一致）', () => {
  it('role は owner/admin/recruiter/viewer のみ', () => {
    expect([...COMPANY_ROLES]).toEqual(['owner', 'admin', 'recruiter', 'viewer'])
    expect(isCompanyRole('owner')).toBe(true)
    expect(isCompanyRole('viewer')).toBe(true)
    expect(isCompanyRole('staff')).toBe(false)
    // 運営 admin role とは別体系（super_admin は企業 role ではない）
    expect(isCompanyRole('super_admin')).toBe(false)
    expect(isCompanyRole(null)).toBe(false)
  })
  it('status は active/suspended/removed のみ', () => {
    expect([...COMPANY_MEMBER_STATUSES]).toEqual(['active', 'suspended', 'removed'])
    expect(isCompanyMemberStatus('active')).toBe(true)
    expect(isCompanyMemberStatus('banned')).toBe(false)
  })
})

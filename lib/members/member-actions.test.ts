import { describe, it, expect } from 'vitest'
import { planMemberAction, isMemberAction, isAssignableRole, MEMBER_ACTIONS, ASSIGNABLE_ROLES, type MemberTarget } from './member-actions'

const ACTOR = 'actor-1'
const t = (over: Partial<MemberTarget> = {}): MemberTarget => ({ user_id: 'target-1', company_role: 'viewer', status: 'active', ...over })
const plan = (action: Parameters<typeof planMemberAction>[0], target: MemberTarget, requestedRole?: unknown) =>
  planMemberAction(action, { actorUserId: ACTOR, target, requestedRole })

describe('member-actions guards', () => {
  it('action / role type guard', () => {
    expect([...MEMBER_ACTIONS]).toEqual(['change_role', 'suspend', 'reactivate', 'remove'])
    expect([...ASSIGNABLE_ROLES]).toEqual(['admin', 'recruiter', 'viewer'])
    expect(isMemberAction('suspend')).toBe(true)
    expect(isMemberAction('delete')).toBe(false)
    expect(isAssignableRole('owner')).toBe(false)
    expect(isAssignableRole('admin')).toBe(true)
  })

  it('owner は全操作 FORBIDDEN', () => {
    for (const a of MEMBER_ACTIONS) {
      const r = plan(a, t({ company_role: 'owner' }), 'viewer')
      expect(r.ok).toBe(false)
      expect(!r.ok && r.code).toBe('FORBIDDEN')
    }
  })

  it('self は全操作 FORBIDDEN', () => {
    for (const a of MEMBER_ACTIONS) {
      const r = plan(a, t({ user_id: ACTOR, status: a === 'reactivate' ? 'suspended' : 'active' }), 'admin')
      expect(r.ok).toBe(false)
      expect(!r.ok && r.code).toBe('FORBIDDEN')
    }
  })
})

describe('change_role', () => {
  it('viewer→recruiter / viewer→admin / recruiter→viewer / admin→recruiter OK', () => {
    for (const [cur, next] of [['viewer', 'recruiter'], ['viewer', 'admin'], ['recruiter', 'viewer'], ['admin', 'recruiter']] as const) {
      const r = plan('change_role', t({ company_role: cur }), next)
      expect(r.ok).toBe(true)
      expect(r.ok && r.set).toEqual({ company_role: next })
      expect(r.ok && r.expectStatusIn).toEqual(['active'])
      expect(r.ok && r.expectRole).toBe(cur)
    }
  })
  it('active 以外は不可', () => {
    expect(plan('change_role', t({ status: 'suspended' }), 'admin').ok).toBe(false)
    expect(plan('change_role', t({ status: 'removed' }), 'admin').ok).toBe(false)
  })
  it('同一 role は CONFLICT', () => {
    const r = plan('change_role', t({ company_role: 'viewer' }), 'viewer')
    expect(!r.ok && r.code).toBe('CONFLICT')
  })
  it('owner / 未知 role は VALIDATION_ERROR', () => {
    expect((() => { const r = plan('change_role', t(), 'owner'); return !r.ok && r.code })()).toBe('VALIDATION_ERROR')
    expect((() => { const r = plan('change_role', t(), 'staff'); return !r.ok && r.code })()).toBe('VALIDATION_ERROR')
  })
})

describe('status transitions', () => {
  it('suspend: active→suspended のみ', () => {
    const r = plan('suspend', t({ status: 'active' }))
    expect(r.ok && r.set).toEqual({ status: 'suspended' })
    expect(r.ok && r.expectStatusIn).toEqual(['active'])
    expect(plan('suspend', t({ status: 'suspended' })).ok).toBe(false)
    expect(plan('suspend', t({ status: 'removed' })).ok).toBe(false)
  })
  it('reactivate: suspended/removed→active', () => {
    expect(plan('reactivate', t({ status: 'suspended' })).ok).toBe(true)
    expect(plan('reactivate', t({ status: 'removed' })).ok).toBe(true)
    const r = plan('reactivate', t({ status: 'removed' }))
    expect(r.ok && r.set).toEqual({ status: 'active' })
    expect(r.ok && r.expectStatusIn).toEqual(['suspended', 'removed'])
    expect(plan('reactivate', t({ status: 'active' })).ok).toBe(false) // active→active 不可
  })
  it('remove: active/suspended→removed', () => {
    expect(plan('remove', t({ status: 'active' })).ok).toBe(true)
    expect(plan('remove', t({ status: 'suspended' })).ok).toBe(true)
    const r = plan('remove', t({ status: 'active' }))
    expect(r.ok && r.set).toEqual({ status: 'removed' })
    expect(plan('remove', t({ status: 'removed' })).ok).toBe(false) // removed→removed 不可
  })
  it('reactivate は role を変えない（set に company_role 無し）', () => {
    const r = plan('reactivate', t({ status: 'removed', company_role: 'recruiter' }))
    expect(r.ok && r.set).toEqual({ status: 'active' })
    expect(r.ok && 'company_role' in (r.set as object)).toBe(false)
  })
})

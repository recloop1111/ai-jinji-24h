import { describe, it, expect, vi, beforeEach } from 'vitest'

// writeCompanyAuditLog の挙動（E-5-4-1）。service-role insert を mock。
let insertResult: { error: unknown } = { error: null }
let captured: Record<string, unknown> | null = null
let threw = false
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => ({ insert: async (p: Record<string, unknown>) => { if (threw) throw new Error('boom'); captured = p; return insertResult } }),
  }),
}))

import { writeCompanyAuditLog, COMPANY_AUDIT_ACTIONS, COMPANY_AUDIT_RESOURCE_TYPES } from './company-audit'

beforeEach(() => { insertResult = { error: null }; captured = null; threw = false })

describe('writeCompanyAuditLog', () => {
  it('正常 insert → ok:true・列マッピング正しい', async () => {
    const r = await writeCompanyAuditLog({
      companyId: 'c1', actorUserId: 'u1', actorCompanyRole: 'owner',
      action: 'member.role_changed', resourceType: 'member', resourceId: 'm1', metadata: { from_role: 'viewer', to_role: 'admin' },
    })
    expect(r.ok).toBe(true)
    expect(captured).toMatchObject({
      company_id: 'c1', actor_user_id: 'u1', actor_company_role: 'owner',
      action: 'member.role_changed', resource_type: 'member', resource_id: 'm1',
      metadata: { from_role: 'viewer', to_role: 'admin' },
    })
  })

  it('DB error → ok:false', async () => {
    insertResult = { error: { message: 'db' } }
    const r = await writeCompanyAuditLog({ companyId: 'c1', actorUserId: null, actorCompanyRole: null, action: 'applicant.csv_exported', resourceType: 'company' })
    expect(r.ok).toBe(false)
  })

  it('例外 → ok:false（throw を握る）', async () => {
    threw = true
    const r = await writeCompanyAuditLog({ companyId: 'c1', actorUserId: null, actorCompanyRole: null, action: 'applicant.csv_exported', resourceType: 'company' })
    expect(r.ok).toBe(false)
  })

  it('metadata sanitize: object/array/関数など非 primitive を落とす（PII/本文の巻き込み防止）', async () => {
    await writeCompanyAuditLog({
      companyId: 'c1', actorUserId: 'u1', actorCompanyRole: 'admin', action: 'applicant.selection_memo_changed', resourceType: 'applicant', resourceId: 'a1',
      metadata: { from_result: '検討中', ok: true, n: 3, nested: { secret: 'x' } as never, arr: [1, 2] as never, fn: (() => 1) as never },
    })
    expect(captured?.metadata).toEqual({ from_result: '検討中', ok: true, n: 3 })
  })

  it('resourceId 省略 → null', async () => {
    await writeCompanyAuditLog({ companyId: 'c1', actorUserId: 'u1', actorCompanyRole: 'owner', action: 'company.plan_changed', resourceType: 'company' })
    expect(captured?.resource_id).toBe(null)
    expect(captured?.metadata).toEqual({})
  })

  it('action / resource union に想定 ID が含まれる', () => {
    expect(COMPANY_AUDIT_ACTIONS).toContain('applicant.resume_pdf_exported')
    expect(COMPANY_AUDIT_ACTIONS).toContain('member.joined')
    expect(COMPANY_AUDIT_ACTIONS).toContain('billing.invoice_pdf_exported') // B-3
    expect(COMPANY_AUDIT_RESOURCE_TYPES).toEqual(['applicant', 'member', 'member_invite', 'company', 'template', 'billing_record'])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// E-5-3-3 Final Hardening: メンバー操作の監査記録（best-effort）を検証する。
//   change_role / suspend / reactivate / remove がそれぞれ正しい action と from/to metadata で
//   company_audit_logs に記録され、失敗系（403/404）では記録しないこと（本文/PII は入れない）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

const mockAudit = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: (i: unknown) => mockAudit(i) }))

type Cfg = { target?: Record<string, unknown> | null }
let cfg: Cfg = {}
function svcFrom() {
  let op: 'select' | 'update' = 'select'
  let set: Record<string, unknown> = {}
  const result = () => {
    if (op === 'update') {
      const t = cfg.target as Record<string, unknown>
      return { data: { id: t.id, company_role: set.company_role ?? t.company_role, status: set.status ?? t.status, updated_at: 'now' }, error: null }
    }
    return { data: cfg.target ?? null, error: null }
  }
  const b: Record<string, unknown> = {}
  b.select = () => b; b.eq = () => b; b.neq = () => b; b.in = () => b
  b.update = (s: Record<string, unknown>) => { op = 'update'; set = s; return b }
  b.maybeSingle = async () => result()
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: () => svcFrom() }) }))

import { PATCH } from '@/app/api/client/members/[id]/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
const TID = '11111111-1111-1111-1111-111111111111'
const ACTOR = 'actor-1'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: ACTOR, companyId: CID, companyRole }, error: null }) }
function req(body: unknown) { return new Request('http://x/api', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never }
async function call(body: unknown, id = TID) { const res = await PATCH(req(body), { params: Promise.resolve({ id }) }); return { status: res.status, json: await res.json().catch(() => null) } }
const activeViewer = { id: 't1', user_id: 'target-1', company_role: 'viewer', status: 'active' }

beforeEach(() => { mockGetClientUser.mockReset(); mockAudit.mockClear(); mockAudit.mockResolvedValue({ ok: true }); cfg = {} })

describe('member mutation audit', () => {
  it('change_role → member.role_changed（from/to role・member/resourceId）', async () => {
    asUser('owner'); cfg.target = { ...activeViewer }
    await call({ action: 'change_role', company_role: 'recruiter' })
    expect(mockAudit).toHaveBeenCalledTimes(1)
    expect(mockAudit.mock.calls[0][0]).toMatchObject({
      companyId: CID, actorUserId: ACTOR, actorCompanyRole: 'owner',
      action: 'member.role_changed', resourceType: 'member', resourceId: 't1',
      metadata: { from_role: 'viewer', to_role: 'recruiter' },
    })
  })

  it('suspend → member.suspended（from/to status）', async () => {
    asUser('admin'); cfg.target = { ...activeViewer }
    await call({ action: 'suspend' })
    expect(mockAudit.mock.calls[0][0]).toMatchObject({ action: 'member.suspended', resourceType: 'member', metadata: { from_status: 'active', to_status: 'suspended' } })
  })

  it('reactivate → member.reactivated（to active）', async () => {
    asUser('owner'); cfg.target = { ...activeViewer, status: 'suspended' }
    await call({ action: 'reactivate' })
    expect(mockAudit.mock.calls[0][0]).toMatchObject({ action: 'member.reactivated', metadata: { from_status: 'suspended', to_status: 'active' } })
  })

  it('remove → member.removed（to removed）', async () => {
    asUser('owner'); cfg.target = { ...activeViewer }
    await call({ action: 'remove' })
    expect(mockAudit.mock.calls[0][0]).toMatchObject({ action: 'member.removed', metadata: { from_status: 'active', to_status: 'removed' } })
  })

  it('metadata に PII/本文を含めない（role/status の from/to のみ）', async () => {
    asUser('owner'); cfg.target = { ...activeViewer }
    await call({ action: 'suspend' })
    const meta = mockAudit.mock.calls[0][0].metadata as Record<string, unknown>
    expect(Object.keys(meta).sort()).toEqual(['from_status', 'to_status'])
  })

  it('403（RECRUITER）→ 監査を呼ばない', async () => {
    asUser('recruiter'); cfg.target = { ...activeViewer }
    await call({ action: 'suspend' })
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('404（他社/不存在 target）→ 監査を呼ばない', async () => {
    asUser('owner'); cfg.target = null
    await call({ action: 'suspend' })
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('owner target 403 → 監査を呼ばない', async () => {
    asUser('owner'); cfg.target = { ...activeViewer, user_id: 'someone', company_role: 'owner' }
    await call({ action: 'suspend' })
    expect(mockAudit).not.toHaveBeenCalled()
  })
})

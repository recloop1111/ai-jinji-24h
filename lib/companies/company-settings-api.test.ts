import { describe, it, expect, vi, beforeEach } from 'vitest'

// E-5-4-B: PATCH /api/client/company（一般企業設定）の RBAC / session 固定 / validation / audit。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))
const mockAudit = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: (i: unknown) => mockAudit(i) }))

type Cfg = { result?: { data: unknown; error: unknown } }
let cfg: Cfg = {}
const captured = { payload: null as unknown, eqs: {} as Record<string, unknown> }
function svcFrom() {
  const b: Record<string, unknown> = {}
  b.update = (p: unknown) => { captured.payload = p; return b }
  b.eq = (c: string, v: unknown) => { captured.eqs[c] = v; return b }
  b.select = () => b
  b.maybeSingle = async () => cfg.result ?? { data: { id: 'c1' }, error: null }
  return b
}
// createClientServerClient は PATCH では使わないが import されるためダミーを返す。
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: () => svcFrom() }),
  createClientServerClient: async () => ({ from: () => svcFrom() }),
}))

import { PATCH } from '@/app/api/client/company/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
const creq = (body: unknown) => new Request('http://x/api', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never
async function patch(body: unknown) { const r = await PATCH(creq(body)); return { status: r.status, json: await r.json().catch(() => null) } }

beforeEach(() => { mockGetClientUser.mockReset(); mockAudit.mockClear(); cfg = {}; captured.payload = null; captured.eqs = {} })

describe('PATCH /api/client/company（一般設定）', () => {
  it('OWNER/ADMIN 成功・session company 固定・監査（値なし・field 名のみ）', async () => {
    for (const role of ['owner', 'admin']) {
      asUser(role); captured.eqs = {}; mockAudit.mockClear()
      const { status } = await patch({ name: '新社名', contact_person: '田中', contact_email: 'a@b.com', phone: '03-0000-0000' })
      expect(status).toBe(200)
      expect(captured.eqs.id).toBe(CID) // session 固定
      expect((captured.payload as Record<string, unknown>).name).toBe('新社名')
      const call = mockAudit.mock.calls[0][0] as { action: string; metadata: Record<string, unknown> }
      expect(call.action).toBe('company_settings.updated')
      expect(JSON.stringify(call.metadata)).not.toContain('新社名') // PII/値を載せない
    }
  })
  it('RECRUITER / VIEWER → 403・更新しない', async () => {
    for (const role of ['recruiter', 'viewer']) {
      asUser(role); captured.payload = null
      expect((await patch({ name: 'x' })).status).toBe(403)
      expect(captured.payload).toBeNull()
    }
  })
  it('name 空 → 400', async () => { asUser('owner'); expect((await patch({ name: '  ' })).status).toBe(400) })
  it('email 形式不正 → 400', async () => { asUser('owner'); expect((await patch({ name: 'x', contact_email: 'not-email' })).status).toBe(400) })
  it('body の id を信用しない（session 固定）', async () => {
    asUser('owner')
    await patch({ name: 'x', id: 'attacker' })
    expect(captured.eqs.id).toBe(CID)
  })
  it('更新 0 行（自社行なし）→ 404', async () => { asUser('owner'); cfg.result = { data: null, error: null }; expect((await patch({ name: 'x' })).status).toBe(404) })
  it('空の任意項目は null 化', async () => {
    asUser('owner')
    await patch({ name: 'x', contact_person: '', contact_email: '', phone: '' })
    const p = captured.payload as Record<string, unknown>
    expect(p.contact_person).toBeNull()
    expect(p.contact_email).toBeNull()
    expect(p.phone).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// E-5-4-B: POST /api/client/jobs・PATCH/DELETE /api/client/jobs/[id] の RBAC / tenant / validation / audit。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))
const mockAudit = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: (i: unknown) => mockAudit(i) }))

type Cfg = { result?: { data: unknown; error: unknown } }
let cfg: Cfg = {}
const captured = { op: '' as string, payload: null as unknown, eqs: {} as Record<string, unknown> }
function svcFrom(table: string) {
  const b: Record<string, unknown> = {}
  b.insert = (p: unknown) => { captured.op = 'insert'; captured.payload = p; return b }
  b.update = (p: unknown) => { captured.op = 'update'; captured.payload = p; return b }
  b.delete = () => { captured.op = 'delete'; return b }
  b.eq = (c: string, v: unknown) => { captured.eqs[`${table}.${c}`] = v; return b }
  b.select = () => b
  b.maybeSingle = async () => cfg.result ?? { data: { id: 'job-1' }, error: null }
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => svcFrom(t) }) }))

import { POST } from '@/app/api/client/jobs/route'
import { PATCH, DELETE } from '@/app/api/client/jobs/[id]/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
const JID = '11111111-1111-1111-1111-111111111111'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
const jreq = (body: unknown, method = 'POST') => new Request('http://x/api', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never
async function post(body: unknown) { const r = await POST(jreq(body)); return { status: r.status, json: await r.json().catch(() => null) } }
async function patch(body: unknown, id = JID) { const r = await PATCH(jreq(body, 'PATCH'), { params: Promise.resolve({ id }) }); return { status: r.status, json: await r.json().catch(() => null) } }
async function del(id = JID) { const r = await DELETE(jreq({}, 'DELETE'), { params: Promise.resolve({ id }) }); return { status: r.status, json: await r.json().catch(() => null) } }

beforeEach(() => { mockGetClientUser.mockReset(); mockAudit.mockClear(); cfg = {}; captured.op = ''; captured.payload = null; captured.eqs = {} })

describe('POST /api/client/jobs（作成）', () => {
  it('未認証 → 401', async () => {
    // getClientUser が authError を返すと route は即返す。error は Response 相当なので 401 を模す。
    mockGetClientUser.mockResolvedValue({ data: null, error: new Response(null, { status: 401 }) as never })
    const r = await POST(jreq({ title: 'x', employment_type: 'fulltime' }))
    expect(r.status).toBe(401)
  })
  it('OWNER/ADMIN/RECRUITER 成功・company_id は session 固定・監査', async () => {
    for (const role of ['owner', 'admin', 'recruiter']) {
      asUser(role); captured.eqs = {}; mockAudit.mockClear()
      const { status } = await post({ title: 'エンジニア', employment_type: 'fulltime' })
      expect(status).toBe(200)
      expect((captured.payload as Record<string, unknown>).company_id).toBe(CID)
      expect((captured.payload as Record<string, unknown>).is_active).toBe(false)
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'job.created', resourceType: 'job' }))
    }
  })
  it('VIEWER → 403・作成しない', async () => { asUser('viewer'); const r = await post({ title: 'x', employment_type: 'fulltime' }); expect(r.status).toBe(403); expect(captured.op).toBe('') })
  it('title 空 → 400', async () => { asUser('owner'); expect((await post({ title: '', employment_type: 'fulltime' })).status).toBe(400) })
  it('employment_type 不正 → 400', async () => { asUser('owner'); expect((await post({ title: 'x', employment_type: 'bogus' })).status).toBe(400) })
  it('body の company_id を信用しない（session 固定）', async () => {
    asUser('owner')
    await post({ title: 'x', employment_type: 'fulltime', company_id: 'attacker-company' })
    expect((captured.payload as Record<string, unknown>).company_id).toBe(CID)
  })
})

describe('PATCH /api/client/jobs/[id]（更新・公開トグル）', () => {
  it('update: OWNER 成功・自社スコープ（id+company_id）・監査', async () => {
    asUser('owner')
    const { status } = await patch({ action: 'update', title: '営業', employment_type: 'contract' })
    expect(status).toBe(200)
    expect(captured.eqs['jobs.id']).toBe(JID)
    expect(captured.eqs['jobs.company_id']).toBe(CID)
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'job.updated' }))
  })
  it('set_active: is_active boolean を反映・監査', async () => {
    asUser('admin')
    await patch({ action: 'set_active', is_active: true })
    expect((captured.payload as Record<string, unknown>).is_active).toBe(true)
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'job.updated', metadata: { is_active: true } }))
  })
  it('VIEWER → 403', async () => { asUser('viewer'); expect((await patch({ action: 'set_active', is_active: true })).status).toBe(403) })
  it('他社/不存在（update 0 行）→ 404', async () => { asUser('owner'); cfg.result = { data: null, error: null }; expect((await patch({ action: 'update', title: 'x', employment_type: 'fulltime' })).status).toBe(404) })
  it('invalid id → 400', async () => { asUser('owner'); expect((await patch({ action: 'set_active', is_active: true }, 'bad')).status).toBe(400) })
  it('set_active is_active 非boolean → 400', async () => { asUser('owner'); expect((await patch({ action: 'set_active', is_active: 'yes' })).status).toBe(400) })
})

describe('DELETE /api/client/jobs/[id]', () => {
  it('OWNER 成功・自社スコープ・監査', async () => {
    asUser('owner')
    const { status } = await del()
    expect(status).toBe(200)
    expect(captured.op).toBe('delete')
    expect(captured.eqs['jobs.company_id']).toBe(CID)
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'job.deleted' }))
  })
  it('VIEWER → 403・削除しない', async () => { asUser('viewer'); const r = await del(); expect(r.status).toBe(403); expect(captured.op).toBe('') })
  it('他社/不存在（delete 0 行）→ 404', async () => { asUser('owner'); cfg.result = { data: null, error: null }; expect((await del()).status).toBe(404) })
})

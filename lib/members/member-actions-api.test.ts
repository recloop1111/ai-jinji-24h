import { describe, it, expect, vi, beforeEach } from 'vitest'

// PATCH /api/client/members/[id]（role/suspend/reactivate/remove）の挙動（E-5-3-3）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

type Cfg = { target?: Record<string, unknown> | null; targetError?: unknown; updateResult?: { data: unknown; error: unknown } }
let cfg: Cfg = {}
const captured = { updateSet: null as Record<string, unknown> | null, tables: [] as string[] }

function svcFrom(table: string) {
  captured.tables.push(table)
  let op: 'select' | 'update' = 'select'
  const result = () => {
    if (op === 'update') return cfg.updateResult ?? { data: { id: 't1', company_role: 'recruiter', status: 'active', updated_at: 'now' }, error: null }
    return { data: cfg.target ?? null, error: cfg.targetError ?? null }
  }
  const b: Record<string, unknown> = {}
  b.select = () => b; b.eq = () => b; b.neq = () => b; b.in = () => b
  b.update = (set: Record<string, unknown>) => { op = 'update'; captured.updateSet = set; return b }
  b.maybeSingle = async () => result()
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => svcFrom(t) }) }))

import { PATCH } from '@/app/api/client/members/[id]/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
const TID = '11111111-1111-1111-1111-111111111111'
const ACTOR = 'actor-1'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: ACTOR, companyId: CID, companyRole }, error: null }) }
function req(body: unknown) { return new Request('http://x/api', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never }
async function call(body: unknown, id = TID) { const res = await PATCH(req(body), { params: Promise.resolve({ id }) }); return { status: res.status, json: await res.json().catch(() => null) } }

beforeEach(() => { mockGetClientUser.mockReset(); cfg = {}; captured.updateSet = null; captured.tables = [] })

const activeViewer = { id: 't1', user_id: 'target-1', company_role: 'viewer', status: 'active' }

describe('RBAC / tenant / lookup', () => {
  it('RECRUITER / VIEWER は 403', async () => { for (const r of ['recruiter', 'viewer']) { asUser(r); expect((await call({ action: 'suspend' })).status).toBe(403) } })
  it('OWNER / ADMIN は許可（active viewer suspend 成功）', async () => {
    for (const r of ['owner', 'admin']) { asUser(r); cfg.target = { ...activeViewer }; expect((await call({ action: 'suspend' })).status).toBe(200) }
  })
  it('invalid id → 400', async () => { asUser('owner'); expect((await call({ action: 'suspend' }, 'not-a-uuid')).status).toBe(400) })
  it('他社/不存在 id（target 無し）→ 404', async () => { asUser('owner'); cfg.target = null; expect((await call({ action: 'suspend' })).status).toBe(404) })
  it('target lookup DB error → 500・update しない', async () => { asUser('owner'); cfg.targetError = { message: 'db' }; const r = await call({ action: 'suspend' }); expect(r.status).toBe(500); expect(captured.updateSet).toBeNull() })
  it('不正 action → 400', async () => { asUser('owner'); cfg.target = { ...activeViewer }; expect((await call({ action: 'delete' })).status).toBe(400) })
})

describe('owner / self protection', () => {
  it('owner target は全操作 403', async () => {
    asUser('owner'); cfg.target = { id: 't1', user_id: 'owner-x', company_role: 'owner', status: 'active' }
    for (const a of ['change_role', 'suspend', 'reactivate', 'remove']) { const r = await call(a === 'change_role' ? { action: a, company_role: 'admin' } : { action: a }); expect(r.status).toBe(403) }
    expect(captured.updateSet).toBeNull()
  })
  it('self target は危険操作 403', async () => {
    asUser('admin'); cfg.target = { id: 't1', user_id: ACTOR, company_role: 'admin', status: 'active' }
    for (const a of ['change_role', 'suspend', 'remove']) { const r = await call(a === 'change_role' ? { action: a, company_role: 'viewer' } : { action: a }); expect(r.status).toBe(403) }
  })
})

describe('change_role', () => {
  it('viewer→recruiter 成功・profiles を触らない', async () => {
    asUser('owner'); cfg.target = { ...activeViewer }
    const r = await call({ action: 'change_role', company_role: 'recruiter' })
    expect(r.status).toBe(200)
    expect(captured.updateSet).toMatchObject({ company_role: 'recruiter' })
    expect(captured.tables).not.toContain('profiles')
  })
  it('suspended target の role 変更 → 409', async () => { asUser('owner'); cfg.target = { ...activeViewer, status: 'suspended' }; expect((await call({ action: 'change_role', company_role: 'admin' })).status).toBe(409) })
  it('same role → 409', async () => { asUser('owner'); cfg.target = { ...activeViewer }; expect((await call({ action: 'change_role', company_role: 'viewer' })).status).toBe(409) })
  it('owner へ昇格不可 → 400', async () => { asUser('owner'); cfg.target = { ...activeViewer }; expect((await call({ action: 'change_role', company_role: 'owner' })).status).toBe(400) })
})

describe('status actions / conditional update', () => {
  it('suspend active → status suspended set', async () => { asUser('owner'); cfg.target = { ...activeViewer }; await call({ action: 'suspend' }); expect(captured.updateSet).toMatchObject({ status: 'suspended' }) })
  it('reactivate removed → status active', async () => { asUser('owner'); cfg.target = { ...activeViewer, status: 'removed' }; await call({ action: 'reactivate' }); expect(captured.updateSet).toMatchObject({ status: 'active' }) })
  it('remove active → status removed', async () => { asUser('owner'); cfg.target = { ...activeViewer }; await call({ action: 'remove' }); expect(captured.updateSet).toMatchObject({ status: 'removed' }) })
  it('conditional update 0 行 → 409（success 返さない）', async () => { asUser('owner'); cfg.target = { ...activeViewer }; cfg.updateResult = { data: null, error: null }; const r = await call({ action: 'suspend' }); expect(r.status).toBe(409); expect(r.json?.updated).not.toBe(true) })
  it('update DB error → 500（success 返さない）', async () => { asUser('owner'); cfg.target = { ...activeViewer }; cfg.updateResult = { data: null, error: { message: 'db' } }; const r = await call({ action: 'suspend' }); expect(r.status).toBe(500) })
  it('成功 response は member{ id, company_role, status, updated_at }', async () => {
    asUser('owner'); cfg.target = { ...activeViewer }; cfg.updateResult = { data: { id: 't1', company_role: 'viewer', status: 'suspended', updated_at: 'now' }, error: null }
    const r = await call({ action: 'suspend' })
    expect(r.json.updated).toBe(true)
    expect(r.json.member).toEqual({ id: 't1', company_role: 'viewer', status: 'suspended', updated_at: 'now' })
    expect(JSON.stringify(r.json)).not.toContain('user_id')
  })
})

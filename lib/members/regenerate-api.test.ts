import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/client/members/invite/[id]/regenerate の挙動（E-5-3-2A）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

type Cfg = { oldRow?: unknown; revokeResult?: { data: unknown; error: unknown } }
let cfg: Cfg = {}
const captured = { revokedId: null as string | null, newInsert: null as Record<string, unknown> | null }
const OID_DEF = '11111111-1111-1111-1111-111111111111'

function svcFrom(_table: string) {
  let op: 'select' | 'update' | 'insert' = 'select'
  let payload: Record<string, unknown> | null = null
  const result = () => {
    if (op === 'select') return { data: cfg.oldRow ?? null, error: null }
    if (op === 'update') return cfg.revokeResult ?? { data: { id: OID_DEF }, error: null } // 旧 pending の revoke 確定
    if (op === 'insert') return { data: payload ? { id: 'new1', email: payload.email, company_role: payload.company_role, status: 'pending', expires_at: 'E', created_at: 'C' } : null, error: null }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (col: string, val: unknown) => { if (op === 'update' && col === 'id') captured.revokedId = val as string; return b }
  b.update = () => { op = 'update'; return b }
  b.insert = (p: Record<string, unknown>) => { op = 'insert'; payload = p; captured.newInsert = p; return b }
  b.maybeSingle = async () => result()
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => svcFrom(t) }) }))

import { POST } from '@/app/api/client/members/invite/[id]/regenerate/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
const OID = '11111111-1111-1111-1111-111111111111'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
function req() { return new Request('http://x.app/api/client/members/invite/x/regenerate', { method: 'POST' }) as never }
async function call() { const res = await POST(req(), { params: Promise.resolve({ id: OID }) }); return { status: res.status, json: await res.json().catch(() => null), headers: res.headers } }

beforeEach(() => { mockGetClientUser.mockReset(); cfg = {}; captured.revokedId = null; captured.newInsert = null })

describe('POST regenerate', () => {
  it('RECRUITER / VIEWER は 403', async () => { for (const r of ['recruiter', 'viewer']) { asUser(r); expect((await call()).status).toBe(403) } })
  it('対象 pending 無し → 404', async () => { asUser('owner'); cfg.oldRow = null; expect((await call()).status).toBe(404) })
  it('成功: 旧 invite を revoke・新 pending 作成・inviteUrl(#token=)・no-store・token_hash 非返却', async () => {
    asUser('owner')
    cfg.oldRow = { id: OID, company_id: CID, email: 'm@e.com', company_role: 'recruiter', status: 'pending' }
    const r = await call()
    expect(r.status).toBe(201)
    expect(captured.revokedId).toBe(OID)
    expect(captured.newInsert).toMatchObject({ company_id: CID, email: 'm@e.com', company_role: 'recruiter', status: 'pending', invited_by: 'u1' })
    expect(typeof captured.newInsert?.token_hash).toBe('string')
    expect(r.json.inviteUrl).toContain('/invite/accept#token=')
    expect(JSON.stringify(r.json)).not.toContain('token_hash')
    expect(r.headers.get('Cache-Control')).toBe('no-store')
  })
  it('revoke DB error → 新 invite を作らない・非成功', async () => {
    asUser('owner')
    cfg.oldRow = { id: OID, company_id: CID, email: 'm@e.com', company_role: 'recruiter', status: 'pending' }
    cfg.revokeResult = { data: null, error: { message: 'db' } }
    const r = await call()
    expect(r.status).toBe(500)
    expect(captured.newInsert).toBeNull()
  })
  it('revoke 0 行（並行取消等）→ 新 invite を作らない・NOT_FOUND', async () => {
    asUser('owner')
    cfg.oldRow = { id: OID, company_id: CID, email: 'm@e.com', company_role: 'recruiter', status: 'pending' }
    cfg.revokeResult = { data: null, error: null }
    const r = await call()
    expect(r.status).toBe(404)
    expect(captured.newInsert).toBeNull()
  })
})

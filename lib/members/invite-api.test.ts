import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/client/members/invite の挙動（E-5-3-2A: メール送信なし・招待リンク発行方式）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

type Cfg = { profile?: unknown; existingMember?: unknown; existingPending?: unknown; insertError?: unknown }
let cfg: Cfg = {}
const captured = { inviteInsert: null as Record<string, unknown> | null }

function svcFrom(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Record<string, unknown> | null = null
  const result = () => {
    if (table === 'profiles') return { data: cfg.profile ?? null, error: null }
    if (table === 'company_members') return { data: cfg.existingMember ?? null, error: null }
    if (table === 'member_invites') {
      if (op === 'insert') return { data: payload ? { id: 'inv1', email: payload.email, company_role: payload.company_role, status: 'pending', expires_at: 'E', created_at: 'C' } : null, error: cfg.insertError ?? null }
      return { data: cfg.existingPending ?? null, error: null } // pending 存在チェック
    }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  b.select = () => b; b.eq = () => b; b.ilike = () => b
  b.insert = (p: Record<string, unknown>) => { op = 'insert'; payload = p; if (table === 'member_invites') captured.inviteInsert = p; return b }
  b.update = () => { op = 'update'; return b }
  b.maybeSingle = async () => result()
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => svcFrom(t) }) }))

import { POST } from '@/app/api/client/members/invite/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
function req(body: unknown) { return new Request('http://x.app/api/client/members/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never }
async function call(body: unknown) { const res = await POST(req(body)); return { status: res.status, json: await res.json().catch(() => null), headers: res.headers } }

beforeEach(() => { mockGetClientUser.mockReset(); cfg = {}; captured.inviteInsert = null })

describe('POST /api/client/members/invite（リンク発行）', () => {
  it('OWNER / ADMIN は 201', async () => { for (const r of ['owner', 'admin']) { asUser(r); expect((await call({ email: 'member@company.com', company_role: 'viewer' })).status).toBe(201) } })
  it('RECRUITER / VIEWER は 403', async () => { for (const r of ['recruiter', 'viewer']) { asUser(r); expect((await call({ email: 'member@company.com', company_role: 'viewer' })).status).toBe(403) } })
  it('env 無しでも発行成功（メール送信に依存しない）', async () => { asUser('owner'); expect((await call({ email: 'member@company.com', company_role: 'viewer' })).status).toBe(201) })
  it('owner 招待は 400', async () => { asUser('owner'); expect((await call({ email: 'member@company.com', company_role: 'owner' })).status).toBe(400) })
  it('email 正規化（trim+lowercase）で保存', async () => {
    asUser('owner'); await call({ email: '  Member@Company.COM ', company_role: 'admin' })
    expect(captured.inviteInsert?.email).toBe('member@company.com')
  })
  it('自社 active メンバー → 409', async () => { asUser('owner'); cfg.profile = { id: 'p1', role: 'company' }; cfg.existingMember = { company_id: CID, status: 'active' }; expect((await call({ email: 'a@b.com', company_role: 'viewer' })).status).toBe(409) })
  it('別企業所属 → 409', async () => { asUser('owner'); cfg.profile = { id: 'p1', role: 'company' }; cfg.existingMember = { company_id: 'other', status: 'active' }; expect((await call({ email: 'a@b.com', company_role: 'viewer' })).status).toBe(409) })
  it('運営 admin → 409', async () => { asUser('owner'); cfg.profile = { id: 'p1', role: 'admin' }; expect((await call({ email: 'a@b.com', company_role: 'viewer' })).status).toBe(409) })
  it('既存 pending あり → 409（自動再発行しない）', async () => { asUser('owner'); cfg.existingPending = { id: 'old' }; expect((await call({ email: 'a@b.com', company_role: 'viewer' })).status).toBe(409) })
  it('成功: company_id 固定・token_hash 保存・inviteUrl(#token=)・token_hash 非返却・no-store', async () => {
    asUser('owner')
    const r = await call({ email: 'member@company.com', company_role: 'admin' })
    expect(r.status).toBe(201)
    expect(captured.inviteInsert).toMatchObject({ company_id: CID, email: 'member@company.com', company_role: 'admin', status: 'pending', invited_by: 'u1' })
    expect(typeof captured.inviteInsert?.token_hash).toBe('string')
    expect(r.json.inviteUrl).toContain('/invite/accept#token=')
    expect(JSON.stringify(r.json)).not.toContain('token_hash')
    expect(r.headers.get('Cache-Control')).toBe('no-store')
  })
})

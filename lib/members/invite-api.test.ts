import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

let emailConfigured = true
const mockSendEmail = vi.fn(async () => ({ ok: true, messageId: 'm1' }))
vi.mock('@/lib/email/send-email', () => ({
  isEmailConfigured: () => emailConfigured,
  sendEmail: (p: unknown) => mockSendEmail(p),
}))

type Cfg = { profile?: unknown; existingMember?: unknown; isDemo?: boolean; insertError?: unknown }
let cfg: Cfg = {}
const captured = { inviteInsert: null as Record<string, unknown> | null }

function svcFrom(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Record<string, unknown> | null = null
  const result = () => {
    if (table === 'companies') return { data: { name: 'テスト株式会社', is_demo: cfg.isDemo ?? false }, error: null }
    if (table === 'profiles') return { data: cfg.profile ?? null, error: null }
    if (table === 'company_members') return { data: cfg.existingMember ?? null, error: null }
    if (table === 'member_invites') {
      if (op === 'insert') return { data: payload ? { id: 'inv1', email: payload.email, company_role: payload.company_role, status: 'pending', expires_at: payload.expires_at, created_at: '2026-01-01' } : null, error: cfg.insertError ?? null }
      return { data: null, error: null }
    }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  b.select = () => b; b.eq = () => b; b.ilike = () => b
  b.insert = (p: Record<string, unknown>) => { op = 'insert'; payload = p; if (table === 'member_invites') captured.inviteInsert = p; return b }
  b.update = () => { op = 'update'; return b }
  b.maybeSingle = async () => result()
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => svcFrom(t) }) }))

import { POST } from '@/app/api/client/members/invite/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
function req(body: unknown) { return new Request('http://x.app/api/client/members/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never }
async function call(body: unknown) { const res = await POST(req(body)); return { status: res.status, json: await res.json().catch(() => null) } }

beforeEach(() => {
  mockGetClientUser.mockReset(); mockSendEmail.mockClear()
  emailConfigured = true; cfg = {}; captured.inviteInsert = null
  process.env.MAIL_TEST_RECIPIENT_ALLOWLIST = 'member@company.com'
  delete process.env.VERCEL_ENV
})

describe('POST /api/client/members/invite', () => {
  it('RECRUITER/VIEWER は 403', async () => {
    for (const r of ['recruiter', 'viewer']) { asUser(r); expect((await call({ email: 'member@company.com', company_role: 'viewer' })).status).toBe(403) }
  })
  it('owner 招待は 400（招待 role 不可）', async () => {
    asUser('owner'); expect((await call({ email: 'member@company.com', company_role: 'owner' })).status).toBe(400)
  })
  it('不正 email は 400', async () => {
    asUser('owner'); expect((await call({ email: 'bad', company_role: 'viewer' })).status).toBe(400)
  })
  it('メール未設定なら 503（invite を作らない）', async () => {
    asUser('owner'); emailConfigured = false
    const r = await call({ email: 'member@company.com', company_role: 'viewer' })
    expect(r.status).toBe(503)
    expect(captured.inviteInsert).toBeNull()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
  it('既に自社 active メンバー → 409', async () => {
    asUser('owner'); cfg.profile = { id: 'p1', role: 'company' }; cfg.existingMember = { company_id: CID, status: 'active' }
    expect((await call({ email: 'member@company.com', company_role: 'viewer' })).status).toBe(409)
  })
  it('別企業所属メール → 409', async () => {
    asUser('owner'); cfg.profile = { id: 'p1', role: 'company' }; cfg.existingMember = { company_id: 'other', status: 'active' }
    expect((await call({ email: 'member@company.com', company_role: 'viewer' })).status).toBe(409)
  })
  it('運営 admin メール → 409', async () => {
    asUser('owner'); cfg.profile = { id: 'p1', role: 'admin' }
    expect((await call({ email: 'member@company.com', company_role: 'viewer' })).status).toBe(409)
  })
  it('成功: 201・invite 作成（company_id 固定・token_hash・status pending）・メール送信・token を返さない', async () => {
    asUser('owner')
    const r = await call({ email: 'Member@Company.com', company_role: 'admin' })
    expect(r.status).toBe(201)
    expect(r.json.invited).toBe(true)
    expect(captured.inviteInsert).toMatchObject({ company_id: CID, email: 'member@company.com', company_role: 'admin', status: 'pending', invited_by: 'u1' })
    expect(typeof captured.inviteInsert?.token_hash).toBe('string')
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    // レスポンスに token / token_hash を含めない
    expect(JSON.stringify(r.json)).not.toContain('token')
  })
})

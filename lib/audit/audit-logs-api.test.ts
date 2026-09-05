import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /api/client/audit-logs の挙動（E-5-4-2）。service-role を mock し、pagination / RBAC / tenant / label 解決を検証。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

type Cfg = {
  total?: number
  rows?: Array<Record<string, unknown>>
  members?: Array<Record<string, unknown>>   // company_members (user_id/full_name or id/full_name/user_id)
  profiles?: Array<Record<string, unknown>>
  applicants?: Array<Record<string, unknown>>
  invites?: Array<Record<string, unknown>>
  companyName?: string
}
let cfg: Cfg = {}
const captured = { rangeCalled: false, orderCols: [] as string[], eqCompanyIds: [] as unknown[], selectCols: [] as string[] }

function builder(table: string) {
  let head = false
  const data = () => {
    if (table === 'company_members') return cfg.members ?? []
    if (table === 'profiles') return cfg.profiles ?? []
    if (table === 'applicants') return cfg.applicants ?? []
    if (table === 'member_invites') return cfg.invites ?? []
    if (table === 'company_audit_logs') return cfg.rows ?? []
    return []
  }
  const b: Record<string, unknown> = {}
  b.select = (cols: string, opts?: { head?: boolean }) => { captured.selectCols.push(`${table}:${cols}`); if (opts?.head) head = true; return b }
  b.eq = (col: string, val: unknown) => { if (col === 'company_id') captured.eqCompanyIds.push(val); return b }
  b.in = () => b
  b.order = (c: string) => { captured.orderCols.push(c); return b }
  b.range = () => { captured.rangeCalled = true; return b }
  b.maybeSingle = async () => (table === 'companies' ? { data: cfg.companyName ? { name: cfg.companyName } : null, error: null } : { data: null, error: null })
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    const val = head ? { count: cfg.total ?? 0, error: null } : { data: data(), error: null }
    return Promise.resolve(val).then(res, rej)
  }
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => builder(t) }) }))

import { GET } from '@/app/api/client/audit-logs/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'actor-1', companyId: CID, companyRole }, error: null }) }
async function call(qs = '') { const res = await GET({ nextUrl: new URL(`http://x/api/client/audit-logs${qs}`) } as never); return { status: res.status, json: await res.json().catch(() => null) } }

beforeEach(() => { mockGetClientUser.mockReset(); cfg = {}; captured.rangeCalled = false; captured.orderCols = []; captured.eqCompanyIds = []; captured.selectCols = [] })

describe('RBAC / tenant', () => {
  it('OWNER / ADMIN は 200', async () => { for (const r of ['owner', 'admin']) { asUser(r); expect((await call()).status).toBe(200) } })
  it('RECRUITER / VIEWER は 403', async () => { for (const r of ['recruiter', 'viewer']) { asUser(r); expect((await call()).status).toBe(403) } })
  it('company_id は session 由来固定（全 join で eq company_id）', async () => {
    asUser('owner'); cfg.total = 1
    cfg.rows = [{ id: 'l1', action: 'applicant.csv_exported', resource_type: 'company', resource_id: CID, actor_user_id: 'actor-1', actor_company_role: 'owner', metadata: {}, created_at: '2026-09-05T00:00:00Z' }]
    await call('?page=1')
    expect(captured.eqCompanyIds.every((v) => v === CID)).toBe(true)
    expect(captured.eqCompanyIds.length).toBeGreaterThan(0)
  })
})

describe('pagination', () => {
  it('default page/limit・created_at desc・range 使用', async () => {
    asUser('owner'); cfg.total = 0
    const { json } = await call()
    expect(json.pagination).toMatchObject({ page: 1, limit: 25, total: 0, total_pages: 1 })
    expect(captured.orderCols).toContain('created_at')
    expect(captured.rangeCalled).toBe(true)
  })
  it('limit は max 50 に clamp', async () => { asUser('owner'); cfg.total = 0; const { json } = await call('?limit=999'); expect(json.pagination.limit).toBe(50) })
  it('invalid page/limit は default', async () => { asUser('owner'); cfg.total = 0; const { json } = await call('?page=-3&limit=abc'); expect(json.pagination).toMatchObject({ page: 1, limit: 25 }) })
  it('total_pages 計算', async () => { asUser('owner'); cfg.total = 51; const { json } = await call('?limit=25'); expect(json.pagination.total).toBe(51); expect(json.pagination.total_pages).toBe(3) })
})

describe('label resolution / no secrets', () => {
  it('actor full_name・applicant 氏名・member email fallback・invite email', async () => {
    asUser('owner'); cfg.total = 3
    cfg.rows = [
      { id: 'l1', action: 'applicant.resume_pdf_exported', resource_type: 'applicant', resource_id: 'a1', actor_user_id: 'u1', actor_company_role: 'admin', metadata: {}, created_at: '2026-09-05T03:00:00Z' },
      { id: 'l2', action: 'member.removed', resource_type: 'member', resource_id: 'm1', actor_user_id: 'u1', actor_company_role: 'admin', metadata: { from_status: 'active', to_status: 'removed' }, created_at: '2026-09-05T02:00:00Z' },
      { id: 'l3', action: 'member.invite_created', resource_type: 'member_invite', resource_id: 'inv1', actor_user_id: 'u1', actor_company_role: 'admin', metadata: { company_role: 'viewer' }, created_at: '2026-09-05T01:00:00Z' },
    ]
    cfg.members = [{ user_id: 'u1', full_name: '佐藤 太郎' }, { id: 'm1', full_name: null, user_id: 'u2' }]
    cfg.profiles = [{ id: 'u1', email: 'sato@e.com' }, { id: 'u2', email: 'target@e.com' }]
    cfg.applicants = [{ id: 'a1', last_name: '高橋', first_name: '美咲' }]
    cfg.invites = [{ id: 'inv1', email: 'invitee@e.com' }]
    const { json } = await call()
    const byId = Object.fromEntries(json.logs.map((l: { id: string }) => [l.id, l]))
    expect(byId.l1.actor.display_name).toBe('佐藤 太郎')
    expect(byId.l1.target.label).toBe('高橋 美咲')
    expect(byId.l2.target.label).toBe('target@e.com') // full_name null → email fallback
    expect(byId.l3.target.label).toBe('invitee@e.com')
  })
  it('missing resource は fallback（token/hash/password を返さない）', async () => {
    asUser('owner'); cfg.total = 1
    cfg.rows = [{ id: 'l1', action: 'member.removed', resource_type: 'member', resource_id: 'gone', actor_user_id: null, actor_company_role: 'owner', metadata: {}, created_at: '2026-09-05T00:00:00Z' }]
    const { json } = await call()
    expect(json.logs[0].target.label).toBe('削除済みのメンバー')
    expect(json.logs[0].actor.display_name).toBe(null)
    const s = JSON.stringify(json)
    expect(s).not.toContain('token')
    expect(s).not.toContain('password')
  })
  it('member_invites の select に token_hash を含めない', async () => {
    asUser('owner'); cfg.total = 1
    cfg.rows = [{ id: 'l1', action: 'member.invite_created', resource_type: 'member_invite', resource_id: 'inv1', actor_user_id: 'u1', actor_company_role: 'owner', metadata: {}, created_at: '2026-09-05T00:00:00Z' }]
    cfg.invites = [{ id: 'inv1', email: 'a@b.com' }]
    await call()
    const inviteSelect = captured.selectCols.find((c) => c.startsWith('member_invites:'))
    expect(inviteSelect).toBeDefined()
    expect(inviteSelect).not.toContain('token')
  })
})

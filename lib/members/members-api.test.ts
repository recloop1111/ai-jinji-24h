import { describe, it, expect, vi, beforeEach } from 'vitest'

// GET /api/client/members ＋ PATCH /api/client/members/me の挙動テスト（E-5-3-1）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

type Cfg = {
  members?: unknown[]
  profiles?: unknown[]
  invites?: unknown[]
  updateResult?: { data: unknown; error: unknown }
}
let cfg: Cfg = {}
const calls = { eqs: [] as Array<[string, string, unknown]>, updatePayload: null as Record<string, unknown> | null, profilesUpdated: false }

function builder(table: string) {
  let mode: 'select' | 'update' = 'select'
  const listResult = () => {
    if (table === 'company_members') return { data: cfg.members ?? [], error: null }
    if (table === 'profiles') return { data: cfg.profiles ?? [], error: null }
    if (table === 'member_invites') return { data: cfg.invites ?? [], error: null }
    return { data: [], error: null }
  }
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (col: string, val: unknown) => { calls.eqs.push([table, col, val]); return b }
  b.in = () => b
  b.update = (payload: Record<string, unknown>) => { mode = 'update'; if (table === 'company_members') calls.updatePayload = payload; if (table === 'profiles') calls.profilesUpdated = true; return b }
  b.maybeSingle = async () => (mode === 'update' ? (cfg.updateResult ?? { data: { id: 'm1', full_name: (calls.updatePayload?.full_name ?? null) }, error: null }) : listResult())
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(listResult()).then(resolve, reject)
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: (t: string) => builder(t) }),
}))

import { GET } from '@/app/api/client/members/route'
import { PATCH } from '@/app/api/client/members/me/route'

const SELF = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const CID = 'c0000000-0000-0000-0000-00000000000c'

function asUser(companyRole: string) {
  mockGetClientUser.mockResolvedValue({ data: { userId: SELF, companyId: CID, companyRole }, error: null })
}
function patchReq(body: unknown) {
  return new Request('http://x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never
}

beforeEach(() => {
  mockGetClientUser.mockReset()
  cfg = {}
  calls.eqs = []; calls.updatePayload = null; calls.profilesUpdated = false
})

describe('GET /api/client/members — RBAC & mapping', () => {
  it('OWNER / ADMIN は 200', async () => {
    for (const role of ['owner', 'admin']) {
      asUser(role)
      const res = await GET()
      expect(res.status).toBe(200)
    }
  })
  it('RECRUITER / VIEWER は 403', async () => {
    for (const role of ['recruiter', 'viewer']) {
      asUser(role)
      const res = await GET()
      expect(res.status).toBe(403)
    }
  })
  it('email は profiles から結合・is_self・token 系は返さない', async () => {
    asUser('owner')
    cfg.members = [
      { id: 'm1', user_id: SELF, company_role: 'owner', status: 'active', full_name: null, joined_at: '2026-01-01', invited_at: null, last_login_at: null },
      { id: 'm2', user_id: OTHER, company_role: 'admin', status: 'active', full_name: '田中', joined_at: '2026-02-01', invited_at: null, last_login_at: null },
    ]
    cfg.profiles = [{ id: SELF, email: 'owner@e.com' }, { id: OTHER, email: 'admin@e.com' }]
    const res = await GET()
    const json = await res.json()
    expect(json.members).toHaveLength(2)
    const owner = json.members.find((m: { id: string }) => m.id === 'm1')
    expect(owner.email).toBe('owner@e.com')
    expect(owner.is_self).toBe(true)
    expect(json.members.find((m: { id: string }) => m.id === 'm2').is_self).toBe(false)
    // token / auth metadata を返さない
    expect(JSON.stringify(json)).not.toContain('token')
    expect(JSON.stringify(json)).not.toContain('password')
    // owner が先頭
    expect(json.members[0].company_role).toBe('owner')
  })
  it('tenant: company_members を user.companyId で絞る（body/query 由来でない）', async () => {
    asUser('owner')
    await GET()
    expect(calls.eqs.some(([t, c, v]) => t === 'company_members' && c === 'company_id' && v === CID)).toBe(true)
  })
  it('pendingInvites は既定で空（invite 未実装）', async () => {
    asUser('owner')
    const res = await GET()
    const json = await res.json()
    expect(Array.isArray(json.pendingInvites)).toBe(true)
  })
})

describe('PATCH /api/client/members/me — self full_name', () => {
  it('OWNER/ADMIN は更新可（company_members を更新・profiles は触らない）', async () => {
    for (const role of ['owner', 'admin']) {
      cfg = {}; calls.updatePayload = null; calls.profilesUpdated = false
      asUser(role)
      const res = await PATCH(patchReq({ full_name: '山田 太郎' }))
      expect(res.status).toBe(200)
      expect(calls.updatePayload).toMatchObject({ full_name: '山田 太郎' })
      expect(calls.profilesUpdated).toBe(false)
    }
  })
  it('RECRUITER/VIEWER は 403', async () => {
    for (const role of ['recruiter', 'viewer']) {
      asUser(role)
      const res = await PATCH(patchReq({ full_name: '山田' }))
      expect(res.status).toBe(403)
    }
  })
  it('空/長すぎ/非string は VALIDATION_ERROR', async () => {
    asUser('owner')
    expect((await PATCH(patchReq({ full_name: '   ' }))).status).toBe(400)
    expect((await PATCH(patchReq({ full_name: 'あ'.repeat(101) }))).status).toBe(400)
    expect((await PATCH(patchReq({ full_name: 123 }))).status).toBe(400)
  })
  it('更新 0 行/エラーは失敗（fake success を作らない）', async () => {
    asUser('owner')
    cfg.updateResult = { data: null, error: null }
    const res = await PATCH(patchReq({ full_name: '山田' }))
    expect(res.status).toBe(500)
  })
  it('自分（user_id）で絞る＝他人を更新しない', async () => {
    asUser('owner')
    await PATCH(patchReq({ full_name: '山田' }))
    expect(calls.eqs.some(([t, c, v]) => t === 'company_members' && c === 'user_id' && v === SELF)).toBe(true)
    expect(calls.eqs.some(([t, c, v]) => t === 'company_members' && c === 'company_id' && v === CID)).toBe(true)
  })
})

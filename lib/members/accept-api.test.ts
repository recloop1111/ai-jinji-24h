import { describe, it, expect, vi, beforeEach } from 'vitest'

type Cfg = {
  invite?: Record<string, unknown> | null
  createUser?: { data: { user: { id: string } | null }; error: { message: string } | null }
  profileError?: unknown
  memberError?: unknown
  finalize?: { data: unknown; error: unknown }  // member_invites の accepted 確定結果（未指定なら成功=1行）
}
let cfg: Cfg = {}
const captured = { member: null as Record<string, unknown> | null, userDeleted: false, memberDeleted: false, profileDeleted: false, inviteUpdate: null as Record<string, unknown> | null }

function svcFrom(table: string) {
  let op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select'
  const result = () => {
    if (table === 'member_invites' && op === 'select') return { data: cfg.invite ?? null, error: null }
    if (table === 'member_invites' && op === 'update') return cfg.finalize ?? { data: { id: 'inv1' }, error: null } // accepted/expired 確定
    if (table === 'profiles' && op === 'upsert') return { error: cfg.profileError ?? null }
    if (table === 'company_members' && op === 'insert') return { data: cfg.memberError ? null : { id: 'newmember' }, error: cfg.memberError ?? null }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  b.select = () => b; b.eq = () => b
  b.update = (p: Record<string, unknown>) => { op = 'update'; if (table === 'member_invites') captured.inviteUpdate = p; return b }
  b.insert = (p: Record<string, unknown>) => { op = 'insert'; if (table === 'company_members') captured.member = p; return b }
  b.upsert = () => { op = 'upsert'; return b }
  b.delete = () => { op = 'delete'; if (table === 'company_members') captured.memberDeleted = true; if (table === 'profiles') captured.profileDeleted = true; return b }
  b.maybeSingle = async () => result()
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
  return b
}
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (t: string) => svcFrom(t),
    auth: { admin: {
      createUser: async () => cfg.createUser ?? { data: { user: { id: 'newuser' } }, error: null },
      deleteUser: async () => { captured.userDeleted = true; return { error: null } },
    } },
  }),
}))

import { POST } from '@/app/api/invite/accept/route'

const future = new Date(Date.now() + 86400000).toISOString()
const past = new Date(Date.now() - 86400000).toISOString()
const baseInvite = () => ({ id: 'inv1', company_id: 'comp1', email: 'm@e.com', company_role: 'recruiter', status: 'pending', expires_at: future, invited_by: 'owner1', created_at: '2026-01-01' })

function req(body: unknown) { return new Request('http://x/api/invite/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never }
async function call(body: unknown) { const res = await POST(req(body)); return { status: res.status, json: await res.json().catch(() => null) } }

beforeEach(() => { cfg = {}; captured.member = null; captured.userDeleted = false; captured.memberDeleted = false; captured.profileDeleted = false; captured.inviteUpdate = null })

const OK_BODY = { token: 't', full_name: '山田 太郎', password: 'password123' }

describe('POST /api/invite/accept', () => {
  it('token 空 → 400', async () => { expect((await call({ full_name: 'x', password: 'password123' })).status).toBe(400) })
  it('招待が見つからない → 400', async () => { cfg.invite = null; expect((await call(OK_BODY)).status).toBe(400) })
  it('status が pending でない → 409', async () => { cfg.invite = { ...baseInvite(), status: 'accepted' }; expect((await call(OK_BODY)).status).toBe(409) })
  it('期限切れ → 410（invite を expired に）', async () => {
    cfg.invite = { ...baseInvite(), expires_at: past }
    const r = await call(OK_BODY)
    expect(r.status).toBe(410)
    expect(captured.inviteUpdate).toMatchObject({ status: 'expired' })
  })
  it('氏名/パスワード validation', async () => {
    cfg.invite = baseInvite()
    expect((await call({ token: 't', full_name: '  ', password: 'password123' })).status).toBe(400)
    expect((await call({ token: 't', full_name: '山田', password: 'short' })).status).toBe(400)
  })
  it('成功: 201・company_members を invite の role/company で active 作成・full_name 保存・invite accepted', async () => {
    cfg.invite = baseInvite()
    const r = await call(OK_BODY)
    expect(r.status).toBe(201)
    expect(r.json.accepted).toBe(true)
    expect(captured.member).toMatchObject({ company_id: 'comp1', user_id: 'newuser', company_role: 'recruiter', status: 'active', full_name: '山田 太郎', invited_by: 'owner1' })
    expect(captured.inviteUpdate).toMatchObject({ status: 'accepted' })
  })
  it('既存 email（createUser already）→ 409・メンバー作成しない', async () => {
    cfg.invite = baseInvite()
    cfg.createUser = { data: { user: null }, error: { message: 'A user with this email address has already been registered' } }
    const r = await call(OK_BODY)
    expect(r.status).toBe(409)
    expect(captured.member).toBeNull()
  })
  it('member insert 失敗 → cleanup（auth user 削除）＋ 500', async () => {
    cfg.invite = baseInvite()
    cfg.memberError = { message: 'boom' }
    const r = await call(OK_BODY)
    expect(r.status).toBe(500)
    expect(captured.userDeleted).toBe(true)
  })

  // ---- one-time 確定（finalize）hardening ----
  it('finalize update error → accepted:true を返さない・作成分を cleanup', async () => {
    cfg.invite = baseInvite()
    cfg.finalize = { data: null, error: { message: 'db' } }
    const r = await call(OK_BODY)
    expect(r.json?.accepted).not.toBe(true)
    expect(captured.memberDeleted).toBe(true)
    expect(captured.profileDeleted).toBe(true)
    expect(captured.userDeleted).toBe(true)
  })
  it('finalize 0 行（既に消費済）→ accepted:true を返さない・cleanup', async () => {
    cfg.invite = baseInvite()
    cfg.finalize = { data: null, error: null }
    const r = await call(OK_BODY)
    expect(r.json?.accepted).not.toBe(true)
    expect(captured.userDeleted).toBe(true)
  })
  it('finalize 成功（1行）→ accepted:true', async () => {
    cfg.invite = baseInvite()
    cfg.finalize = { data: { id: 'inv1' }, error: null }
    const r = await call(OK_BODY)
    expect(r.status).toBe(201)
    expect(r.json.accepted).toBe(true)
    expect(captured.userDeleted).toBe(false)
  })
  it('期限切れ message は「再発行」（「再送」を含まない）', async () => {
    cfg.invite = { ...baseInvite(), expires_at: past }
    const r = await call(OK_BODY)
    expect(r.status).toBe(410)
    expect(r.json?.error?.message).toContain('再発行')
    expect(r.json?.error?.message).not.toContain('再送')
  })
})

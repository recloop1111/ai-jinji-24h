import { describe, it, expect, vi, beforeEach } from 'vitest'

// E-5-5: GET /api/client/login-history（audit.read=OWNER/ADMIN・自社メンバーのみ・pagination）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

type Cfg = { members?: unknown[]; profiles?: unknown[]; attempts?: unknown[] }
let cfg: Cfg = {}
const captured = { attemptsIn: null as unknown, attemptsUserType: null as unknown, memberCompanyId: null as unknown, range: null as [number, number] | null, fromCalls: [] as string[] }

function builder(table: string) {
  captured.fromCalls.push(table)
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (c: string, v: unknown) => { if (table === 'company_members' && c === 'company_id') captured.memberCompanyId = v; if (table === 'login_attempts' && c === 'user_type') captured.attemptsUserType = v; return b }
  b.in = (c: string, v: unknown) => { if (table === 'login_attempts' && c === 'auth_user_id') captured.attemptsIn = v; return b }
  b.order = () => b
  b.range = (from: number, to: number) => { captured.range = [from, to]; return Promise.resolve({ data: cfg.attempts ?? [], error: null }) }
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown) => {
    const data = table === 'company_members' ? (cfg.members ?? []) : table === 'profiles' ? (cfg.profiles ?? []) : (cfg.attempts ?? [])
    return Promise.resolve({ data, error: null }).then(res)
  }
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => builder(t) }) }))

import { GET } from '@/app/api/client/login-history/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
async function call(qs = '') { const res = await GET({ url: `http://x/api/client/login-history${qs}` } as never); return { status: res.status, json: await res.json().catch(() => null) } }

beforeEach(() => {
  mockGetClientUser.mockReset(); cfg = {}
  captured.attemptsIn = null; captured.attemptsUserType = null; captured.memberCompanyId = null; captured.range = null; captured.fromCalls = []
})

describe('GET /api/client/login-history', () => {
  it('RECRUITER / VIEWER → 403', async () => {
    for (const r of ['recruiter', 'viewer']) { asUser(r); expect((await call()).status).toBe(403) }
  })

  it('OWNER/ADMIN 成功・member 情報を batch 解決（N+1 なし）・自社スコープ', async () => {
    asUser('owner')
    cfg.members = [{ user_id: 'm1', full_name: '田中 太郎', company_role: 'owner' }, { user_id: 'm2', full_name: null, company_role: 'recruiter' }]
    cfg.profiles = [{ id: 'm1', email: 'tanaka@x.com' }, { id: 'm2', email: 'sato@x.com' }]
    cfg.attempts = [
      { id: 'a1', auth_user_id: 'm1', ip_address: '1.2.3.4', success: true, failure_reason: null, created_at: '2026-09-05T00:00:00Z' },
      { id: 'a2', auth_user_id: 'm2', ip_address: '5.6.7.8', success: false, failure_reason: 'auth_failed', created_at: '2026-09-04T00:00:00Z' },
    ]
    const { status, json } = await call()
    expect(status).toBe(200)
    // 自社 company_id で member 取得
    expect(captured.memberCompanyId).toBe(CID)
    // login_attempts は client portal・自社メンバー user_id に限定
    expect(captured.attemptsUserType).toBe('client')
    expect(captured.attemptsIn).toEqual(['m1', 'm2'])
    // profiles は1回だけ（batch）
    expect(captured.fromCalls.filter((t) => t === 'profiles')).toHaveLength(1)
    // 解決結果
    expect(json.items[0]).toMatchObject({ user_id: 'm1', full_name: '田中 太郎', role: 'owner', email: 'tanaka@x.com', success: true })
    expect(json.items[1]).toMatchObject({ user_id: 'm2', full_name: null, email: 'sato@x.com', success: false, failure_reason: 'auth_failed' })
  })

  it('メンバー0人 → 空・login_attempts を引かない', async () => {
    asUser('admin'); cfg.members = []
    const { json } = await call()
    expect(json.items).toEqual([])
    expect(captured.fromCalls).not.toContain('login_attempts')
  })

  it('pagination: page=2 で offset 反映・pageSize+1 で has_more 判定', async () => {
    asUser('owner')
    cfg.members = [{ user_id: 'm1', full_name: 'X', company_role: 'owner' }]
    cfg.profiles = [{ id: 'm1', email: 'x@x.com' }]
    // 21 行返す（PAGE_SIZE=20 + 1）→ has_more true・items は 20
    cfg.attempts = Array.from({ length: 21 }, (_, i) => ({ id: `a${i}`, auth_user_id: 'm1', ip_address: null, success: true, failure_reason: null, created_at: '2026-09-05T00:00:00Z' }))
    const { json } = await call('?page=2')
    expect(json.page).toBe(2)
    expect(captured.range).toEqual([20, 40]) // offset=(2-1)*20=20, to=20+20
    expect(json.items).toHaveLength(20)
    expect(json.has_more).toBe(true)
  })

  it('未認証 → 401', async () => {
    mockGetClientUser.mockResolvedValue({ data: null, error: new Response(null, { status: 401 }) as never })
    expect((await call()).status).toBe(401)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// getClientUser の挙動テスト（Phase E-5-2）。supabase server factory を mock し、
// profiles.company_id + company_members(active) の解決／fail-closed を検証する。
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClientServerClient: async () => ({ auth: { getUser: mockGetUser } }),
  createServiceRoleClient: () => ({ from: mockFrom }),
  createAdminServerClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

import { getClientUser } from './auth'

// .select().eq()....single()/.maybeSingle() を満たす簡易チェーン
function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  c.select = () => c
  c.eq = () => c
  c.single = async () => result
  c.maybeSingle = async () => result
  return c
}

const USER = { id: '10000000-0000-0000-0000-000000000001' }
const COMPANY = 'a0000000-0000-0000-0000-00000000000a'

function setup(opts: {
  user?: { id: string } | null
  profile?: { data: unknown; error: unknown }
  membership?: { data: unknown; error: unknown }
}) {
  mockGetUser.mockResolvedValue({ data: { user: opts.user === undefined ? USER : opts.user }, error: null })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return chain(opts.profile ?? { data: { company_id: COMPANY }, error: null })
    if (table === 'company_members') return chain(opts.membership ?? { data: null, error: null })
    throw new Error('unexpected table ' + table)
  })
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockFrom.mockReset()
})

const active = (role: string) => ({ data: { company_id: COMPANY, company_role: role, status: 'active' }, error: null })

describe('getClientUser — active membership の role 解決', () => {
  for (const role of ['owner', 'admin', 'recruiter', 'viewer'] as const) {
    it(`active ${role} → companyRole=${role}（userId/companyId 後方互換）`, async () => {
      setup({ membership: active(role) })
      const { data, error } = await getClientUser()
      expect(error).toBeNull()
      expect(data).toEqual({ userId: USER.id, companyId: COMPANY, companyRole: role })
    })
  }
})

describe('getClientUser — fail closed', () => {
  it('未ログイン → 401 UNAUTHORIZED', async () => {
    setup({ user: null })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(401)
  })

  it('profiles に company_id 無し → 403', async () => {
    setup({ profile: { data: { company_id: null }, error: null } })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(403)
  })

  it('membership 無し → 403（暫定 owner 等の fallback を作らない）', async () => {
    setup({ membership: { data: null, error: null } })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(403)
  })

  it('suspended/removed（active クエリで 0 件）→ 403', async () => {
    // status='active' フィルタで返らない状況を null で表現
    setup({ membership: { data: null, error: null } })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(403)
  })

  it('membership の company_id が profile と不一致 → 403', async () => {
    setup({ membership: { data: { company_id: 'b0000000-0000-0000-0000-00000000000b', company_role: 'owner', status: 'active' }, error: null } })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(403)
  })

  it('membership.company_role が未知値 → 403（default deny）', async () => {
    setup({ membership: { data: { company_id: COMPANY, company_role: 'staff', status: 'active' }, error: null } })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(403)
  })

  it('company_members 取得エラー → 403', async () => {
    setup({ membership: { data: null, error: { message: 'db' } } })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(403)
  })
})

describe('getClientUser — platform admin 分離', () => {
  it('profiles.company_id があっても company_members 無しなら company user として返さない（platform admin ≠ company role）', async () => {
    // 運営 admin が誤って client portal を叩いても、membership が無い限り 403。
    setup({ profile: { data: { company_id: COMPANY }, error: null }, membership: { data: null, error: null } })
    const { data, error } = await getClientUser()
    expect(data).toBeNull()
    expect(error?.status).toBe(403)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pre-Redesign Security Audit: 企業設定 write の RBAC（OWNER/ADMIN のみ・RECRUITER/VIEWER 403）。
// 対象: PUT /api/client/billing-profile・POST/PATCH /api/client/security/setting-password。
// これらは service-role 書込（RLS bypass）のため、アプリ層 can('company_settings.manage') が唯一の防壁。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: vi.fn(async () => ({ ok: true })) }))

const captured = { wrote: false }
// setting-password は既存 hash の有無で分岐。テストは「未設定(null)」で POST 経路、
// 「設定済(hash)」で PATCH 経路を通す。write（update/upsert）が呼ばれたら captured.wrote=true。
let existingHash: string | null = null
function svcFrom() {
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = () => b
  b.upsert = () => { captured.wrote = true; return Promise.resolve({ error: null }) }
  b.update = () => { captured.wrote = true; b._isUpdate = true; return b }
  b.maybeSingle = async () => ({ data: null, error: null })
  b.single = async () => ({ data: { company_setting_password_hash: existingHash }, error: null })
  // update().eq() は then で解決
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res)
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: () => svcFrom() }) }))
// setting-password の hash 化・検証は実装を使う（PATCH の currentPassword 検証を通すため verify を固定）
vi.mock('@/lib/security/setting-password', () => ({
  hashSettingPassword: (p: string) => `hashed:${p}`,
  verifySettingPassword: (p: string, h: string) => h === `hashed:${p}`,
  isValidSettingPassword: (p: unknown) => typeof p === 'string' && p.length >= 8,
}))

import { PUT as BILLING_PUT } from '@/app/api/client/billing-profile/route'
import { POST as SP_POST, PATCH as SP_PATCH } from '@/app/api/client/security/setting-password/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
const req = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never

beforeEach(() => { mockGetClientUser.mockReset(); captured.wrote = false; existingHash = null })

describe('PUT /api/client/billing-profile RBAC', () => {
  it('OWNER/ADMIN → 200・保存する', async () => {
    for (const r of ['owner', 'admin']) {
      asUser(r); captured.wrote = false
      const res = await BILLING_PUT(req({ billing_name: 'ABC', address: '東京都' }))
      expect(res.status).toBe(200)
      expect(captured.wrote).toBe(true)
    }
  })
  it('RECRUITER/VIEWER → 403・保存しない', async () => {
    for (const r of ['recruiter', 'viewer']) {
      asUser(r); captured.wrote = false
      const res = await BILLING_PUT(req({ billing_name: 'ABC' }))
      expect(res.status).toBe(403)
      expect(captured.wrote).toBe(false)
    }
  })
})

describe('POST /api/client/security/setting-password RBAC（初期設定）', () => {
  it('OWNER/ADMIN → 設定できる', async () => {
    for (const r of ['owner', 'admin']) {
      asUser(r); captured.wrote = false; existingHash = null
      const res = await SP_POST(req({ newPassword: 'abcdefgh' }))
      expect(res.status).toBe(200)
      expect(captured.wrote).toBe(true)
    }
  })
  it('RECRUITER/VIEWER → 403・設定しない（乗っ取り防止）', async () => {
    for (const r of ['recruiter', 'viewer']) {
      asUser(r); captured.wrote = false; existingHash = null
      const res = await SP_POST(req({ newPassword: 'abcdefgh' }))
      expect(res.status).toBe(403)
      expect(captured.wrote).toBe(false)
    }
  })
})

describe('PATCH /api/client/security/setting-password RBAC（変更）', () => {
  it('OWNER → currentPassword 照合の上で変更可', async () => {
    asUser('owner'); existingHash = 'hashed:oldpass12'; captured.wrote = false
    const res = await SP_PATCH(req({ currentPassword: 'oldpass12', newPassword: 'newpass12' }))
    expect(res.status).toBe(200)
    expect(captured.wrote).toBe(true)
  })
  it('VIEWER → 403（currentPassword を知っていても role で拒否）', async () => {
    asUser('viewer'); existingHash = 'hashed:oldpass12'; captured.wrote = false
    const res = await SP_PATCH(req({ currentPassword: 'oldpass12', newPassword: 'newpass12' }))
    expect(res.status).toBe(403)
    expect(captured.wrote).toBe(false)
  })
})

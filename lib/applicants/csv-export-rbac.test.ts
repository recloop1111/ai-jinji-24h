import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pre-Redesign Security Audit: 応募者 CSV 一括出力（PII）の export RBAC。
// VIEWER は禁止（resume/report PDF と同じ export ティア = OWNER/ADMIN/RECRUITER）。
// role gate は設定用パスワード検証より前に効く（VIEWER は password を知っていても 403）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: vi.fn(async () => ({ ok: true })) }))
const captured = { verifiedPassword: false }
vi.mock('@/lib/security/setting-password', () => ({
  verifySettingPassword: () => { captured.verifiedPassword = true; return true },
}))
// service-role / authenticated クライアントは CSV 経路で使うが、role 拒否時は到達しない想定。
vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { company_setting_password_hash: 'h' }, error: null }) }) }) }) }),
  createClientServerClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) }) }) }) }),
}))

import { POST } from '@/app/api/client/applicants/export/csv/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
const req = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never

beforeEach(() => { mockGetClientUser.mockReset(); captured.verifiedPassword = false })

describe('CSV export RBAC', () => {
  it('VIEWER → 403・設定パスワード検証にも到達しない（role gate が先）', async () => {
    asUser('viewer')
    const res = await POST(req({ settingPassword: 'whatever' }))
    expect(res.status).toBe(403)
    expect(captured.verifiedPassword).toBe(false)
  })
  it('RECRUITER/OWNER/ADMIN は role gate を通過（以降の password 検証へ進む）', async () => {
    for (const r of ['recruiter', 'owner', 'admin']) {
      asUser(r); captured.verifiedPassword = false
      const res = await POST(req({ settingPassword: 'correct-pw' }))
      // role gate 通過 → password 検証へ到達（403 の理由が role ではない）。
      expect(res.status).not.toBe(403)
      expect(captured.verifiedPassword).toBe(true)
    }
  })
})

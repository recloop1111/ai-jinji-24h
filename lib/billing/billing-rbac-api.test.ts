import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing B-2: invoice DL API ＋ billing サマリ API の billing.read RBAC / tenant / 情報漏えい防止。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

// invoice PDF ビルダーは重いので stub（RBAC 検証が目的）。
vi.mock('@/lib/billing/invoice-pdf', () => ({
  buildInvoicePdf: async () => Buffer.from('%PDF-1.4'),
  toInvoiceInput: () => ({ invoiceNumber: 'INV-202608-abcdef12' }),
}))

// company audit（fail-closed export）は挙動を制御して検証。
const mockAudit = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: (i: unknown) => mockAudit(i) }))

type Cfg = { record?: Record<string, unknown> | null; company?: Record<string, unknown> | null; monthlyCount?: number; records?: unknown[] }
let cfg: Cfg = {}

function svcFrom(table: string) {
  let head = false
  const b: Record<string, unknown> = {}
  b.select = (_c: string, opts?: { head?: boolean }) => { if (opts?.head) head = true; return b }
  b.eq = () => b; b.gte = () => b; b.order = () => b; b.limit = () => b
  b.maybeSingle = async () => {
    if (table === 'billing_records') return { data: cfg.record ?? null, error: null }
    if (table === 'companies') return { data: cfg.company ?? { monthly_interview_limit: 20, price_per_interview: 4000 }, error: null }
    if (table === 'company_billing_profiles') return { data: null, error: null }
    if (table === 'billing_issuer_settings') return { data: null, error: null }
    return { data: null, error: null }
  }
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    const v = head ? { count: cfg.monthlyCount ?? 0, error: null } : (table === 'billing_records' ? { data: cfg.records ?? [], error: null } : { data: [], error: null })
    return Promise.resolve(v).then(res, rej)
  }
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => svcFrom(t) }) }))

import { GET as INVOICE_GET } from '@/app/api/client/billing/[billing_record_id]/invoice/route'
import { GET as BILLING_GET } from '@/app/api/client/billing/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
const RID = '11111111-1111-1111-1111-111111111111'
function asUser(role: string | null) {
  if (role === null) { mockGetClientUser.mockResolvedValue({ data: null, error: { status: 401 } }); return }
  mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole: role }, error: null })
}
async function invoice(id = RID) { const res = await INVOICE_GET(new Request('http://x') as never, { params: Promise.resolve({ billing_record_id: id }) }); return res.status }
async function billing() { const res = await BILLING_GET(); return res.status }

beforeEach(() => { mockGetClientUser.mockReset(); mockAudit.mockReset(); mockAudit.mockResolvedValue({ ok: true }); cfg = {} })

describe('invoice DL RBAC', () => {
  it('未認証 → 401', async () => { asUser(null); expect(await invoice()).toBe(401) })
  it('recruiter/viewer → 403（record 存在有無に関わらず・role 先行判定）', async () => {
    for (const r of ['recruiter', 'viewer']) {
      asUser(r); cfg.record = { id: RID, company_id: CID, payment_status: 'pending' }
      expect(await invoice()).toBe(403)         // 自社 record あり
      cfg.record = null
      expect(await invoice()).toBe(403)         // 不存在でも 403（存在漏らさない）
      expect(await invoice('not-a-uuid')).toBe(403) // 不正 UUID でも role 先行で 403
    }
  })
  it('owner/admin 自社 pending → 200', async () => {
    for (const r of ['owner', 'admin']) { asUser(r); cfg.record = { id: RID, company_id: CID, payment_status: 'pending' }; expect(await invoice()).toBe(200) }
  })
  it('owner 他社 record → 403', async () => { asUser('owner'); cfg.record = { id: RID, company_id: 'other', payment_status: 'pending' }; expect(await invoice()).toBe(403) })
  it('owner 不存在 → 404', async () => { asUser('owner'); cfg.record = null; expect(await invoice()).toBe(404) })
  it('owner failed/refunded → 422', async () => {
    for (const st of ['failed', 'refunded']) { asUser('owner'); cfg.record = { id: RID, company_id: CID, payment_status: st }; expect(await invoice()).toBe(422) }
  })
  it('owner 不正 UUID → 400', async () => { asUser('owner'); expect(await invoice('bad')).toBe(400) })
})

describe('invoice DL fail-closed audit (B-3)', () => {
  it('audit 成功 → 200・audit 呼び出し（billing_record / billing_month のみ）', async () => {
    asUser('owner'); cfg.record = { id: RID, company_id: CID, payment_status: 'pending', billing_month: '2026-08-01' }
    expect(await invoice()).toBe(200)
    expect(mockAudit).toHaveBeenCalledTimes(1)
    const arg = mockAudit.mock.calls[0][0] as Record<string, unknown>
    expect(arg).toMatchObject({ companyId: CID, actorUserId: 'u1', actorCompanyRole: 'owner', action: 'billing.invoice_pdf_exported', resourceType: 'billing_record', resourceId: RID })
    expect(arg.metadata).toEqual({ billing_month: '2026-08' })
    // 金額/snapshot 等を metadata に入れない
    const meta = JSON.stringify(arg.metadata)
    expect(meta).not.toContain('amount'); expect(meta).not.toContain('total'); expect(meta).not.toContain('snapshot')
  })
  it('audit 失敗 → 500・PDF を返さない', async () => {
    asUser('owner'); cfg.record = { id: RID, company_id: CID, payment_status: 'pending', billing_month: '2026-08-01' }
    mockAudit.mockResolvedValue({ ok: false })
    const res = await INVOICE_GET(new Request('http://x') as never, { params: Promise.resolve({ billing_record_id: RID }) })
    expect(res.status).toBe(500)
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf')
  })
  it('403(recruiter/他社)・404(不存在)・422(failed) では audit を呼ばない', async () => {
    asUser('recruiter'); cfg.record = { id: RID, company_id: CID, payment_status: 'pending' }; await invoice(); expect(mockAudit).not.toHaveBeenCalled()
    mockAudit.mockClear(); asUser('owner'); cfg.record = { id: RID, company_id: 'other', payment_status: 'pending' }; await invoice(); expect(mockAudit).not.toHaveBeenCalled()
    mockAudit.mockClear(); asUser('owner'); cfg.record = null; await invoice(); expect(mockAudit).not.toHaveBeenCalled()
    mockAudit.mockClear(); asUser('owner'); cfg.record = { id: RID, company_id: CID, payment_status: 'failed' }; await invoice(); expect(mockAudit).not.toHaveBeenCalled()
  })
})

describe('billing サマリ API RBAC', () => {
  it('owner/admin → 200', async () => { for (const r of ['owner', 'admin']) { asUser(r); expect(await billing()).toBe(200) } })
  it('recruiter/viewer → 403', async () => { for (const r of ['recruiter', 'viewer']) { asUser(r); expect(await billing()).toBe(403) } })
  it('未認証 → 401', async () => { asUser(null); expect(await billing()).toBe(401) })
  it('レスポンスに invoice_snapshot 等の機微を含めない', async () => {
    asUser('owner'); cfg.records = [{ id: RID, billing_month: '2026-08-01', interview_count: 3, amount_jpy: 12000, tax_jpy: 1200, payment_status: 'pending', created_at: '2026-09-01' }]
    const res = await BILLING_GET(); const json = await res.json()
    expect(json.records[0]).toHaveProperty('amount', 12000)
    expect(JSON.stringify(json)).not.toContain('invoice_snapshot')
    expect(JSON.stringify(json)).not.toContain('company_id')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing B-6.1: 複数企業・複数請求額の自動反映テスト。
//   会社名 / 請求先 / 面接件数 / 単価 / 税抜 / 税額 / 税込が company_id・月次 billing_record に
//   正しく紐づき、テナント間で混ざらないことを確認する。既存ロジックの確認が目的（実装変更なし）。
//   Production DB / fixture には一切追加しない（純ロジック + service-role batch の mock のみ）。

vi.mock('@/lib/companies/applyNextMonthLimit', () => ({
  jstPreviousMonthRange: () => ({ startIso: '2026-08-01T00:00:00Z', endIso: '2026-09-01T00:00:00Z', billingMonth: '2026-08-01' }),
}))

// ── monthly-billing batch 用 service-role mock（profile を company_id 別に返せる） ──
type Cfg = {
  companies?: Array<Record<string, unknown>>
  issuer?: Record<string, unknown> | null
  existingByCompany?: Record<string, { id: string; payment_status: string } | null>
  countByCompany?: Record<string, number>
  profileByCompany?: Record<string, Record<string, unknown> | null>
}
let cfg: Cfg = {}
const captured = { inserts: [] as Record<string, unknown>[] }

function builder(table: string) {
  let head = false
  let cid: string | null = null
  let rangeFrom = 0
  const b: Record<string, unknown> = {}
  b.select = (_c: string, opts?: { head?: boolean }) => { if (opts?.head) head = true; return b }
  b.eq = (col: string, val: unknown) => { if (col === 'company_id') cid = val as string; return b }
  b.gte = () => b; b.lt = () => b; b.order = () => b
  b.range = (fromArg: number) => { rangeFrom = fromArg; return b }
  b.insert = (p: Record<string, unknown>) => { if (table === 'billing_records') captured.inserts.push(p); return b }
  b.maybeSingle = async () => {
    if (table === 'billing_issuer_settings') return { data: cfg.issuer ?? null, error: null }
    if (table === 'company_billing_profiles') return { data: cid ? (cfg.profileByCompany?.[cid] ?? null) : null, error: null }
    if (table === 'billing_records') return { data: cid ? (cfg.existingByCompany?.[cid] ?? null) : null, error: null }
    return { data: null, error: null }
  }
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    let v: unknown = { error: null }
    if (table === 'companies') v = { data: rangeFrom === 0 ? (cfg.companies ?? []) : [], error: null }
    else if (table === 'interviews' && head) v = { count: cid ? (cfg.countByCompany?.[cid] ?? 0) : 0, error: null }
    return Promise.resolve(v).then(res, rej)
  }
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => builder(t) }) }))

import { POST } from '@/app/api/internal/batch/monthly-billing/route'
import { toInvoiceInput, buildInvoicePdf } from '@/lib/billing/invoice-pdf'
import { buildInvoiceSnapshot } from '@/lib/billing/invoice-snapshot'

const SECRET = 'test-secret'
const req = () => ({ headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${SECRET}` : null) }, url: 'http://x/api/internal/batch/monthly-billing' }) as never
async function run() { const res = await POST(req()); return { status: res.status, json: await res.json().catch(() => null) } }

// ── 企業データ（Production 未投入・テスト内のみ） ──
const companyA = { id: 'company-a', name: 'ABC株式会社', contact_person: null, plan: 'pay_per_use', price_per_interview: 4000, is_demo: false }
const companyB = { id: 'company-b', name: 'XYZ株式会社', contact_person: null, plan: 'custom', price_per_interview: 3000, is_demo: false }
const profileA = { billing_name: 'ABC株式会社', department: '経理部', contact_name: '田中 太郎', postal_code: null, address: '東京都渋谷区1-2-3', building: null, phone: null }
const profileB = { billing_name: 'XYZ株式会社', department: '総務部', contact_name: '山田 花子', postal_code: null, address: '神奈川県横浜市2-3-4', building: null, phone: null }

const rec = (over: Record<string, unknown> = {}) => ({
  id: '1027b9fb-419e-4e6d-9933-70aca922693f', billing_month: '2026-08-01',
  interview_count: 3, amount_jpy: 12000, tax_jpy: 1200, total_jpy: 13200, created_at: '2026-09-01T00:00:00Z', ...over,
})
const isPdf = (buf: Buffer) => buf.length > 800 && buf.subarray(0, 5).toString('latin1') === '%PDF-'

beforeEach(() => { cfg = {}; captured.inserts = []; process.env.INTERNAL_BATCH_SECRET = SECRET })

describe('B-6.1 monthly-billing: 複数企業・複数単価の自動反映', () => {
  it('A(4000×3) / B(3000×5) が別々の billing_record として正しい金額で作られる', async () => {
    cfg = {
      companies: [companyA, companyB],
      existingByCompany: { 'company-a': null, 'company-b': null },
      countByCompany: { 'company-a': 3, 'company-b': 5 },
      profileByCompany: { 'company-a': profileA, 'company-b': profileB },
    }
    const { json } = await run()
    expect(json.created).toBe(2)
    expect(captured.inserts).toHaveLength(2)

    const a = captured.inserts.find((r) => r.company_id === 'company-a')!
    const b = captured.inserts.find((r) => r.company_id === 'company-b')!

    // 企業A: 3件 × 4000 = 12000 / 税1200 / 税込13200
    expect(a).toMatchObject({ company_id: 'company-a', billing_month: '2026-08-01', interview_count: 3, amount_jpy: 12000, tax_jpy: 1200, total_jpy: 13200, payment_status: 'pending' })
    // 企業B: 5件 × 3000 = 15000 / 税1500 / 税込16500
    expect(b).toMatchObject({ company_id: 'company-b', billing_month: '2026-08-01', interview_count: 5, amount_jpy: 15000, tax_jpy: 1500, total_jpy: 16500, payment_status: 'pending' })
  })

  it('同一 billing_month でも tenant ごとに別 record（company_id で分離）', async () => {
    cfg = {
      companies: [companyA, companyB],
      existingByCompany: { 'company-a': null, 'company-b': null },
      countByCompany: { 'company-a': 3, 'company-b': 5 },
      profileByCompany: { 'company-a': profileA, 'company-b': profileB },
    }
    await run()
    const ids = captured.inserts.map((r) => r.company_id).sort()
    expect(ids).toEqual(['company-a', 'company-b'])
    expect(captured.inserts.every((r) => r.billing_month === '2026-08-01')).toBe(true)
  })

  it('invoice_snapshot.bill_to.companyName が tenant ごとに凍結され混ざらない', async () => {
    cfg = {
      companies: [companyA, companyB],
      existingByCompany: { 'company-a': null, 'company-b': null },
      countByCompany: { 'company-a': 3, 'company-b': 5 },
      profileByCompany: { 'company-a': profileA, 'company-b': profileB },
    }
    await run()
    const a = captured.inserts.find((r) => r.company_id === 'company-a')!
    const b = captured.inserts.find((r) => r.company_id === 'company-b')!
    const snapA = a.invoice_snapshot as { bill_to: { companyName: string; contactName: string; address: string } }
    const snapB = b.invoice_snapshot as { bill_to: { companyName: string; contactName: string; address: string } }
    expect(snapA.bill_to.companyName).toBe('ABC株式会社')
    expect(snapA.bill_to.contactName).toBe('田中 太郎')
    expect(snapA.bill_to.address).toBe('東京都渋谷区1-2-3')
    expect(snapB.bill_to.companyName).toBe('XYZ株式会社')
    expect(snapB.bill_to.contactName).toBe('山田 花子')
    expect(snapB.bill_to.address).toBe('神奈川県横浜市2-3-4')
    // A の snapshot に B の情報が混入していない
    expect(JSON.stringify(snapA)).not.toContain('XYZ株式会社')
    expect(JSON.stringify(snapB)).not.toContain('ABC株式会社')
  })
})

describe('B-6.1 toInvoiceInput: PDF入力の自動反映（tenant別）', () => {
  it('企業A: billTo=ABC株式会社 / 3件 / 単価4000 / 12000・1200・13200', () => {
    const input = toInvoiceInput(rec(), companyA, profileA)
    expect(input.billTo.companyName).toBe('ABC株式会社')
    expect(input.billTo.contactName).toBe('田中 太郎')
    expect(input.interviewCount).toBe(3)
    expect(input.unitPrice).toBe(4000)
    expect(input.subtotal).toBe(12000)
    expect(input.tax).toBe(1200)
    expect(input.total).toBe(13200)
    // A の入力に B の情報が混ざらない
    expect(JSON.stringify(input.billTo)).not.toContain('XYZ株式会社')
  })

  it('企業B: billTo=XYZ株式会社 / 5件 / 単価3000 / 15000・1500・16500', () => {
    const input = toInvoiceInput(
      rec({ interview_count: 5, amount_jpy: 15000, tax_jpy: 1500, total_jpy: 16500 }),
      companyB,
      profileB,
    )
    expect(input.billTo.companyName).toBe('XYZ株式会社')
    expect(input.billTo.contactName).toBe('山田 花子')
    expect(input.interviewCount).toBe(5)
    expect(input.unitPrice).toBe(3000)
    expect(input.subtotal).toBe(15000)
    expect(input.tax).toBe(1500)
    expect(input.total).toBe(16500)
    expect(JSON.stringify(input.billTo)).not.toContain('ABC株式会社')
  })

  it('確定値をそのまま表示し再計算しない（unitPrice のみ導出）', () => {
    // amount/tax/total が「非整合」な確定値でも、そのまま採用する（再計算しない）。
    const input = toInvoiceInput(rec({ interview_count: 3, amount_jpy: 12000, tax_jpy: 9999, total_jpy: 88888 }), companyA, profileA)
    expect(input.subtotal).toBe(12000)
    expect(input.tax).toBe(9999)
    expect(input.total).toBe(88888)
    expect(input.unitPrice).toBe(4000) // 12000 / 3
  })
})

describe('B-6.1 profile fallback: company_billing_profiles 無し → companies', () => {
  it('企業C: profile 無し → billTo.companyName=companies.name / contactName=contact_person', () => {
    const companyC = { name: 'Fallback株式会社', contact_person: '佐藤 一郎' }
    const input = toInvoiceInput(rec(), companyC, null)
    expect(input.billTo.companyName).toBe('Fallback株式会社')
    expect(input.billTo.contactName).toBe('佐藤 一郎')
    expect(input.billTo.department).toBeNull()
    expect(input.billTo.address).toBeNull()
  })
})

describe('B-6.1 snapshot 不変性: 確定後に会社/請求先を変更しても過去請求書は不変', () => {
  it('確定時 ABC/渋谷 で凍結 → 現在 新社名/大阪 でも PDF入力は ABC/渋谷 のまま', () => {
    // 確定時点のライブ値で snapshot を凍結（monthly-billing writer と同じ経路）。
    const frozen = buildInvoiceSnapshot(
      { name: 'ABC株式会社', contact_person: null },
      profileA, // billing_name=ABC株式会社 / address=東京都渋谷区1-2-3
      null,
    )
    // その後、企業/請求先を変更したとする。
    const companyNow = { name: 'ABC株式会社 新社名', contact_person: '別担当' }
    const profileNow = { billing_name: 'ABC株式会社 新社名', department: '新部署', contact_name: '新担当', postal_code: null, address: '大阪府大阪市9-9-9', building: null, phone: null }

    const input = toInvoiceInput(rec(), companyNow, profileNow, { bill_to: frozen.bill_to })
    // snapshot 優先 → 過去請求書は確定時の値のまま。
    expect(input.billTo.companyName).toBe('ABC株式会社')
    expect(input.billTo.address).toBe('東京都渋谷区1-2-3')
    expect(input.billTo.contactName).toBe('田中 太郎')
    // 変更後の値は現れない。
    expect(input.billTo.companyName).not.toContain('新社名')
    expect(input.billTo.address).not.toContain('大阪')
  })
})

describe('B-6.1 PDF Buffer: tenant別に有効な1ページPDFを生成', () => {
  it('企業A / 企業B いずれも有効な PDF を返す', async () => {
    const pdfA = await buildInvoicePdf(
      toInvoiceInput(rec(), companyA, profileA, null, {
        issuer_name: 'AIMEN24運営会社（仮）', postal_code: '000-0000', address: '東京都○○区○○ 0-0-0', building: '', tel: '00-0000-0000', registration_number: '',
        bank_name: '○○銀行', branch_name: '○○支店', account_type: '普通', account_number: '0000000', account_holder: 'カ）エーアイメン', payment_note: 'お振込みをお願いいたします。',
      }),
    )
    const pdfB = await buildInvoicePdf(
      toInvoiceInput(rec({ interview_count: 5, amount_jpy: 15000, tax_jpy: 1500, total_jpy: 16500 }), companyB, profileB),
    )
    expect(isPdf(pdfA)).toBe(true)
    expect(isPdf(pdfB)).toBe(true)
  })
})

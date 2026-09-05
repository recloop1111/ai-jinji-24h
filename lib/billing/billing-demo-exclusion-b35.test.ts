import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing B-3.5: demo 企業の billing_record を運営売上・請求一覧から完全除外。
const mockGetAdminUser = vi.fn(async () => ({ data: { userId: 'a1', role: 'admin' }, error: null }))
vi.mock('@/lib/api/auth', () => ({ getAdminUser: () => mockGetAdminUser() }))

type Cfg = { companies?: unknown[]; interviews?: unknown[]; billing?: unknown[] }
let cfg: Cfg = {}

function builder(table: string) {
  let rangeFrom = 0
  const list = () => {
    if (table === 'companies') return cfg.companies ?? []
    if (table === 'interviews') return rangeFrom === 0 ? (cfg.interviews ?? []) : []
    if (table === 'billing_records') return rangeFrom === 0 ? (cfg.billing ?? []) : []
    return []
  }
  const b: Record<string, unknown> = {}
  b.select = () => b; b.eq = () => b; b.in = () => b; b.gte = () => b; b.order = () => b
  b.range = (from: number) => { rangeFrom = from; return b }
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: list(), error: null }).then(res, rej)
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => builder(t) }) }))

import { GET as SUMMARY_GET } from '@/app/api/admin/billing/summary/route'
import { GET as RECORDS_GET } from '@/app/api/admin/billing/records/route'

const now = new Date()
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const nowIso = now.toISOString()
const companies = [
  { id: 'nd', name: 'NonDemo', industry: null, plan: 'pay_per_use', price_per_interview: 4000, monthly_interview_limit: 20, is_demo: false },
  { id: 'demo', name: 'Demo', industry: null, plan: 'pay_per_use', price_per_interview: 4000, monthly_interview_limit: 20, is_demo: true },
]

beforeEach(() => { mockGetAdminUser.mockReset(); mockGetAdminUser.mockResolvedValue({ data: { userId: 'a1', role: 'admin' }, error: null }); cfg = {} })

async function summary() { const res = await SUMMARY_GET({ url: 'http://x/api/admin/billing/summary' } as never); return { status: res.status, json: await res.json() } }
async function records(qs = '') { const res = await RECORDS_GET({ url: `http://x/api/admin/billing/records${qs}` } as never); return { status: res.status, json: await res.json() } }

describe('admin billing summary: demo 除外', () => {
  it('A/B/E: non-demo paid は yearly_revenue に入り demo paid は入らない', async () => {
    cfg.companies = companies
    cfg.billing = [
      { company_id: 'nd', billing_month: `${ym}-01`, amount_jpy: 10000, payment_status: 'paid', created_at: nowIso },
      { company_id: 'demo', billing_month: `${ym}-01`, amount_jpy: 999999, payment_status: 'paid', created_at: nowIso },
    ]
    const { json } = await summary()
    expect(json.summary.yearly_revenue).toBe(10000)
    expect(json.monthly_sales.reduce((a: number, b: number) => a + b, 0)).toBe(1) // 10000/10000=1万円・demo 分は入らない
  })
  it('C: demo pending は unpaid_amount / unpaid_count に入らない', async () => {
    cfg.companies = companies
    cfg.billing = [
      { company_id: 'nd', billing_month: `${ym}-01`, amount_jpy: 5000, payment_status: 'pending', created_at: nowIso },
      { company_id: 'demo', billing_month: `${ym}-01`, amount_jpy: 999999, payment_status: 'pending', created_at: nowIso },
    ]
    const { json } = await summary()
    expect(json.summary.unpaid_amount).toBe(5000)
    expect(json.summary.unpaid_count).toBe(1)
  })
  it('D: demo overdue は overdue_count に入らない', async () => {
    cfg.companies = companies
    const oldIso = '2020-01-10T00:00:00Z' // 期限超過（pending→overdue 導出）
    cfg.billing = [
      { company_id: 'demo', billing_month: '2020-01-01', amount_jpy: 999999, payment_status: 'pending', created_at: oldIso },
    ]
    const { json } = await summary()
    expect(json.summary.overdue_count).toBe(0)
    expect(json.summary.unpaid_amount).toBe(0)
  })
  it('F/G: demo company row は demo_excluded / current_amount=0・利用状況は表示（行は残る）', async () => {
    cfg.companies = companies
    cfg.interviews = [{ company_id: 'demo' }, { company_id: 'demo' }, { company_id: 'nd' }]
    cfg.billing = []
    const { json } = await summary()
    const demoRow = json.rows.find((r: { company_id: string }) => r.company_id === 'demo')
    expect(demoRow.is_demo).toBe(true)
    expect(demoRow.current_amount).toBe(0)
    expect(demoRow.interviews_used).toBe(2) // 利用状況は表示
  })
})

describe('admin billing records: demo 除外', () => {
  it('non-demo は一覧に出て demo は出ない', async () => {
    cfg.companies = companies
    cfg.billing = [
      { id: 'r-nd', company_id: 'nd', billing_month: `${ym}-01`, interview_count: 3, amount_jpy: 12000, tax_jpy: 1200, total_jpy: 13200, payment_status: 'pending', created_at: nowIso, paid_at: null },
      { id: 'r-demo', company_id: 'demo', billing_month: `${ym}-01`, interview_count: 5, amount_jpy: 999999, tax_jpy: 99999, total_jpy: 1099998, payment_status: 'pending', created_at: nowIso, paid_at: null },
    ]
    const { json } = await records()
    const ids = json.records.map((r: { id: string }) => r.id)
    expect(ids).toContain('r-nd')
    expect(ids).not.toContain('r-demo')
    expect(json.records.find((r: { id: string }) => r.id === 'r-nd').company_name).toBe('NonDemo')
  })
  it('status=paid filter を壊さない（demo 除外後も適用）', async () => {
    cfg.companies = companies
    cfg.billing = [
      { id: 'r-nd-paid', company_id: 'nd', billing_month: `${ym}-01`, interview_count: 1, amount_jpy: 4000, tax_jpy: 400, total_jpy: 4400, payment_status: 'paid', created_at: nowIso, paid_at: nowIso },
      { id: 'r-nd-pend', company_id: 'nd', billing_month: `${ym}-01`, interview_count: 1, amount_jpy: 4000, tax_jpy: 400, total_jpy: 4400, payment_status: 'pending', created_at: nowIso, paid_at: null },
      { id: 'r-demo-paid', company_id: 'demo', billing_month: `${ym}-01`, interview_count: 1, amount_jpy: 999999, tax_jpy: 0, total_jpy: 999999, payment_status: 'paid', created_at: nowIso, paid_at: nowIso },
    ]
    const { json } = await records('?status=paid')
    const ids = json.records.map((r: { id: string }) => r.id)
    expect(ids).toEqual(['r-nd-paid'])
  })
})

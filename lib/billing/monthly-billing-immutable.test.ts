import { describe, it, expect, vi, beforeEach } from 'vitest'

// monthly-billing バッチの請求書不変性（B-1）。既存 record は payment_status 問わず更新しない。
vi.mock('@/lib/companies/applyNextMonthLimit', () => ({
  jstPreviousMonthRange: () => ({ startIso: '2026-08-01T00:00:00Z', endIso: '2026-09-01T00:00:00Z', billingMonth: '2026-08-01' }),
}))

type Cfg = {
  companies?: Array<Record<string, unknown>>
  issuer?: Record<string, unknown> | null
  existingByCompany?: Record<string, { id: string; payment_status: string } | null>
  countByCompany?: Record<string, number>
  profile?: Record<string, unknown> | null
}
let cfg: Cfg = {}
const captured = { inserts: [] as Record<string, unknown>[], updates: 0 }

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select'
  let head = false
  let cid: string | null = null
  let rangeFrom = 0
  let payload: Record<string, unknown> | null = null
  const listOrValue = () => {
    if (table === 'companies') return { data: rangeFrom === 0 ? (cfg.companies ?? []) : [], error: null }
    if (table === 'interviews' && head) return { count: cid ? (cfg.countByCompany?.[cid] ?? 0) : 0, error: null }
    return { data: [], error: null }
  }
  const b: Record<string, unknown> = {}
  b.select = (_c: string, opts?: { head?: boolean }) => { if (opts?.head) head = true; return b }
  b.eq = (col: string, val: unknown) => { if (col === 'company_id') cid = val as string; return b }
  b.gte = () => b; b.lt = () => b; b.order = () => b
  b.range = (fromArg: number) => { rangeFrom = fromArg; return b }
  b.insert = (p: Record<string, unknown>) => { op = 'insert'; payload = p; if (table === 'billing_records') captured.inserts.push(p); return b }
  b.update = () => { op = 'update'; if (table === 'billing_records') captured.updates++; return b }
  b.maybeSingle = async () => {
    if (table === 'billing_issuer_settings') return { data: cfg.issuer ?? null, error: null }
    if (table === 'company_billing_profiles') return { data: cfg.profile ?? null, error: null }
    if (table === 'billing_records') return { data: cid ? (cfg.existingByCompany?.[cid] ?? null) : null, error: null }
    return { data: null, error: null }
  }
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    const v = op === 'insert' ? { error: null } : listOrValue()
    return Promise.resolve(v).then(res, rej)
  }
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => builder(t) }) }))

import { POST } from '@/app/api/internal/batch/monthly-billing/route'

const SECRET = 'test-secret'
function req(dry = false) {
  return { headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${SECRET}` : null) }, url: `http://x/api/internal/batch/monthly-billing${dry ? '?dryRun=1' : ''}` } as never
}
async function run(dry = false) { const res = await POST(req(dry)); return { status: res.status, json: await res.json().catch(() => null) } }

const co = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Co${id}`, contact_person: null, plan: 'pay_per_use', price_per_interview: 4000, is_demo: false, ...over })

beforeEach(() => {
  cfg = {}; captured.inserts = []; captured.updates = 0
  process.env.INTERNAL_BATCH_SECRET = SECRET
})

describe('monthly-billing 請求書不変性', () => {
  it('認証失敗は 401', async () => {
    const res = await POST({ headers: { get: () => 'Bearer wrong' }, url: 'http://x' } as never)
    expect(res.status).toBe(401)
  })

  it('A/C/D: existing（pending/paid/failed/refunded）→ 更新も INSERT もしない', async () => {
    for (const st of ['pending', 'paid', 'failed', 'refunded']) {
      cfg = { companies: [co('c1')], existingByCompany: { c1: { id: 'r1', payment_status: st } }, countByCompany: { c1: 99 } }
      captured.inserts = []; captured.updates = 0
      const { json } = await run()
      expect(captured.updates).toBe(0)
      expect(captured.inserts).toHaveLength(0)
      expect(json.created).toBe(0)
      expect(json.updated).toBe(0)
      expect(json.skipped_existing).toBe(1)
    }
  })

  it('B: existing pending で件数/単価/profile が変わっていても既存 record を更新しない', async () => {
    cfg = { companies: [co('c1', { price_per_interview: 9999 })], existingByCompany: { c1: { id: 'r1', payment_status: 'pending' } }, countByCompany: { c1: 50 }, profile: { billing_name: '新しい請求先' } }
    await run()
    expect(captured.updates).toBe(0)
    expect(captured.inserts).toHaveLength(0)
  })

  it('E: existing 無し → 正常 INSERT（amount/tax/total/snapshot）', async () => {
    cfg = { companies: [co('c1')], existingByCompany: { c1: null }, countByCompany: { c1: 3 } }
    const { json } = await run()
    expect(json.created).toBe(1)
    expect(captured.inserts).toHaveLength(1)
    const row = captured.inserts[0]
    expect(row).toMatchObject({ company_id: 'c1', billing_month: '2026-08-01', interview_count: 3, amount_jpy: 12000, tax_jpy: 1200, total_jpy: 13200, payment_status: 'pending' })
    expect(row.invoice_snapshot).toBeTruthy() // 新規のみ snapshot 生成
  })

  it('F: 一部既存・一部新規 → 新規社のみ INSERT（partial failure rerun 相当）', async () => {
    cfg = { companies: [co('c1'), co('c2')], existingByCompany: { c1: { id: 'r1', payment_status: 'pending' }, c2: null }, countByCompany: { c1: 10, c2: 2 } }
    const { json } = await run()
    expect(json.created).toBe(1)
    expect(json.skipped_existing).toBe(1)
    expect(captured.inserts.map((r) => r.company_id)).toEqual(['c2'])
  })

  it('0件・demo は INSERT しない', async () => {
    cfg = { companies: [co('c1', { is_demo: true }), co('c2')], existingByCompany: { c2: null }, countByCompany: { c2: 0 } }
    const { json } = await run()
    expect(captured.inserts).toHaveLength(0)
    expect(json.skipped_demo).toBe(1)
  })

  it('H: dry-run で existing は skip_existing（update_pending を出さない）・書き込みなし', async () => {
    cfg = { companies: [co('c1'), co('c2')], existingByCompany: { c1: { id: 'r1', payment_status: 'pending' }, c2: null }, countByCompany: { c1: 5, c2: 4 } }
    const { json } = await run(true)
    expect(json.dry_run).toBe(true)
    expect(captured.inserts).toHaveLength(0)
    expect(captured.updates).toBe(0)
    expect(json.summary.would_skip_existing).toBe(1)
    expect(json.summary.would_create).toBe(1)
    expect(JSON.stringify(json)).not.toContain('update_pending')
    const c1 = json.companies.find((d: { company_id: string }) => d.company_id === 'c1')
    expect(c1.action).toBe('skip_existing')
  })
})

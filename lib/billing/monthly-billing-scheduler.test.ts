import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing B-5: 月次請求バッチの定期実行（Vercel Cron = GET + CRON_SECRET）と手動（POST）の
// 認証・冪等・demo/zero skip・不変性を検証。本体は POST/GET 共通（executeMonthlyBilling）。
vi.mock('@/lib/companies/applyNextMonthLimit', () => ({
  jstPreviousMonthRange: () => ({ startIso: '2026-08-01T00:00:00Z', endIso: '2026-09-01T00:00:00Z', billingMonth: '2026-08-01' }),
}))

type Cfg = {
  companies?: Array<Record<string, unknown>>
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
    if (table === 'billing_issuer_settings') return { data: null, error: null }
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

import { POST, GET } from '@/app/api/internal/batch/monthly-billing/route'

const BATCH = 'batch-secret'
const CRON = 'cron-secret'
const co = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Co${id}`, contact_person: null, plan: 'pay_per_use', price_per_interview: 4000, is_demo: false, ...over })
const reqGet = (auth?: string) => ({ headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? (auth ?? null) : null) }, url: 'http://x/api/internal/batch/monthly-billing' }) as never
const reqPost = (auth?: string, dry = false) => ({ headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? (auth ?? null) : null) }, url: `http://x/api/internal/batch/monthly-billing${dry ? '?dryRun=1' : ''}` }) as never

beforeEach(() => {
  cfg = {}; captured.inserts = []
  process.env.INTERNAL_BATCH_SECRET = BATCH
  process.env.CRON_SECRET = CRON
})

describe('B-5 cron(GET) 認証', () => {
  it('正しい CRON_SECRET → 200・live 実行（INSERT する）', async () => {
    cfg = { companies: [co('c1')], existingByCompany: { c1: null }, countByCompany: { c1: 3 } }
    const res = await GET(reqGet(`Bearer ${CRON}`))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.created).toBe(1)
    expect(captured.inserts).toHaveLength(1)
  })

  it('誤った secret → 401・書き込みなし', async () => {
    cfg = { companies: [co('c1')], existingByCompany: { c1: null }, countByCompany: { c1: 3 } }
    const res = await GET(reqGet('Bearer wrong'))
    expect(res.status).toBe(401)
    expect(captured.inserts).toHaveLength(0)
  })

  it('CRON_SECRET 未設定 → 401（fail-closed・第三者が叩けない）', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(reqGet('Bearer '))
    expect(res.status).toBe(401)
  })

  it('INTERNAL_BATCH_SECRET では cron(GET) を通せない（secret 分離）', async () => {
    const res = await GET(reqGet(`Bearer ${BATCH}`))
    expect(res.status).toBe(401)
  })

  it('cron は常に live（dryRun クエリを無視して INSERT する）', async () => {
    cfg = { companies: [co('c1')], existingByCompany: { c1: null }, countByCompany: { c1: 2 } }
    const res = await GET({ headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${CRON}` : null) }, url: 'http://x/api/internal/batch/monthly-billing?dryRun=1' } as never)
    const json = await res.json()
    expect(json.dry_run).toBeUndefined()
    expect(captured.inserts).toHaveLength(1)
  })
})

describe('B-5 cron(GET) 冪等・skip・複数企業（POST と共通の本体）', () => {
  it('duplicate run: 既存 record は skip_existing（二重請求しない）', async () => {
    cfg = { companies: [co('c1')], existingByCompany: { c1: { id: 'r1', payment_status: 'pending' } }, countByCompany: { c1: 9 } }
    const json = await (await GET(reqGet(`Bearer ${CRON}`))).json()
    expect(captured.inserts).toHaveLength(0)
    expect(json.created).toBe(0)
    expect(json.skipped_existing).toBe(1)
  })

  it('demo skip / zero skip / multiple companies / billing_month 正しさ', async () => {
    cfg = {
      companies: [co('a'), co('b', { price_per_interview: 3000 }), co('demo', { is_demo: true }), co('z')],
      existingByCompany: { a: null, b: null, demo: null, z: null },
      countByCompany: { a: 3, b: 5, demo: 100, z: 0 },
    }
    const json = await (await GET(reqGet(`Bearer ${CRON}`))).json()
    expect(json.created).toBe(2) // a, b のみ
    expect(json.skipped_demo).toBe(1)
    const ids = captured.inserts.map((r) => r.company_id).sort()
    expect(ids).toEqual(['a', 'b'])
    const a = captured.inserts.find((r) => r.company_id === 'a')!
    const b = captured.inserts.find((r) => r.company_id === 'b')!
    expect(a).toMatchObject({ billing_month: '2026-08-01', amount_jpy: 12000, tax_jpy: 1200, total_jpy: 13200 })
    expect(b).toMatchObject({ billing_month: '2026-08-01', amount_jpy: 15000, tax_jpy: 1500, total_jpy: 16500 })
  })
})

describe('B-5 手動 POST は従来どおり（dry-run 維持）', () => {
  it('POST + INTERNAL_BATCH_SECRET + dryRun=1 → 書き込みなし・dry_run:true', async () => {
    cfg = { companies: [co('c1')], existingByCompany: { c1: null }, countByCompany: { c1: 4 } }
    const json = await (await POST(reqPost(`Bearer ${BATCH}`, true))).json()
    expect(json.dry_run).toBe(true)
    expect(captured.inserts).toHaveLength(0)
    expect(json.summary.would_create).toBe(1)
  })

  it('POST で CRON_SECRET は通らない（secret 分離）', async () => {
    const res = await POST(reqPost(`Bearer ${CRON}`))
    expect(res.status).toBe(401)
  })
})

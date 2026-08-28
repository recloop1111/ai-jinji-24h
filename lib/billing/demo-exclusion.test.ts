import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isBillableCompany, billableUsageCount } from './demo-exclusion'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('demo-exclusion（DB 権威 is_demo=true を課金/利用量から完全除外）', () => {
  it('1/2. billableUsageCount: demo は常に 0（is_billable 件数に依らず）', () => {
    expect(billableUsageCount(5, true)).toBe(0)
    expect(billableUsageCount(0, true)).toBe(0)
    expect(billableUsageCount(99, true)).toBe(0)
  })
  it('3. 非 demo は生の件数（正規化）', () => {
    expect(billableUsageCount(5, false)).toBe(5)
    expect(billableUsageCount(5, null)).toBe(5)
    expect(billableUsageCount(5, undefined)).toBe(5)
    expect(billableUsageCount(null, false)).toBe(0)
    expect(billableUsageCount(-3, false)).toBe(0)
  })
  it('isBillableCompany: demo のみ集計対象外', () => {
    expect(isBillableCompany(true)).toBe(false)
    expect(isBillableCompany(false)).toBe(true)
    expect(isBillableCompany(null)).toBe(true)
    expect(isBillableCompany(undefined)).toBe(true)
  })
})

describe('billing/usage 集計サイトが DB is_demo で除外している（client flag 非使用）', () => {
  it('monthly-billing: is_demo を select し demo 企業を skip（billing_record を作らない）', () => {
    const F = read('app/api/internal/batch/monthly-billing/route.ts')
    expect(F).toContain('is_demo')
    expect(F).toMatch(/company\.is_demo === true[\s\S]{0,80}(skippedDemo|continue)/)
    expect(F).toContain('skippedDemo')
  })
  it('admin/billing/summary: is_demo=true を billable 集計 companyIds から除外', () => {
    const F = read('app/api/admin/billing/summary/route.ts')
    expect(F).toContain('is_demo')
    expect(F).toContain('c.is_demo !== true')
  })
  it('admin/companies 一覧: is_demo=true を当月利用数集計から除外', () => {
    const F = read('app/api/admin/companies/route.ts')
    expect(F).toContain('is_demo')
    expect(F).toContain('is_demo !== true')
  })
  it('admin/companies/[id]: billableUsageCount(count, is_demo) で利用数を 0 化', () => {
    const F = read('app/api/admin/companies/[id]/route.ts')
    expect(F).toContain('billableUsageCount')
    expect(F).toContain('is_demo')
  })
  it('client/plan: billableUsageCount で当月利用/残枠/請求から demo を除外', () => {
    const F = read('app/api/client/plan/route.ts')
    expect(F).toContain('billableUsageCount')
    expect(F).toContain('company.is_demo')
  })
  it('interview/start: is_demo=true は月間上限を消費しない（DB 値で判定・client body の is_demo を使わない）', () => {
    const F = read('app/api/interview/[slug]/start/route.ts')
    expect(F).toContain('company.is_demo !== true')
    // 4. demo 判定は DB companies.is_demo。body/query の is_demo を上限判定に使わない。
    expect(F).not.toMatch(/body\.is_demo[\s\S]{0,80}(effectiveLimit|上限|limit)/i)
  })
})

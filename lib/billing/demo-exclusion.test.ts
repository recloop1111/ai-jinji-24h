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
  it('interview/start: is_demo=true は月間上限を消費しない（DB 値で判定・client body の is_demo を使わない）', () => {
    const F = read('app/api/interview/[slug]/start/route.ts')
    expect(F).toContain('company.is_demo !== true')
    // 4/9. demo 判定は DB companies.is_demo。body/query の is_demo を上限判定に使わない。
    expect(F).not.toMatch(/body\.is_demo[\s\S]{0,80}(effectiveLimit|上限|limit)/i)
  })
})

describe('company-facing usage は demo をカウントする（企業自身の利用表示・全体集計とは分離）', () => {
  it('7/8. admin/companies 一覧: demo を当月利用数から除外しない（is_demo は行データに含める）', () => {
    const F = read('app/api/admin/companies/route.ts')
    // companyIds を is_demo でフィルタしない（demo の当月利用件数も表示する）
    expect(F).not.toMatch(/companyIds[\s\S]{0,120}is_demo !== true/)
    expect(F).toContain('is_demo: c.is_demo === true')
  })
  it('8. admin/companies/[id]: 個別企業の当月利用は実数（billableUsageCount で 0 化しない）', () => {
    const F = read('app/api/admin/companies/[id]/route.ts')
    expect(F).not.toContain('billableUsageCount')
    expect(F).toContain('monthly_interview_count_actual: monthlyCount ?? 0')
  })
  it('2/7. client/plan: 当月利用は demo でもカウント（used=生件数）。請求額のみ demo=0', () => {
    const F = read('app/api/client/plan/route.ts')
    expect(F).not.toContain('billableUsageCount')
    expect(F).toContain('const used = monthlyCount ?? 0')
    expect(F).toContain('current_charge: isDemo ? 0 : used * pricePerInterview')
  })
})

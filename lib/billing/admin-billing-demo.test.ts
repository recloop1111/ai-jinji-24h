import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = read('app/api/admin/billing/summary/route.ts')
const PAGE = read('app/admin/(dashboard)/billing/page.tsx')

describe('admin/billing/summary: 表示用 usage と 請求/売上集計 の分離', () => {
  it('1. 当月 usage は全企業（demo 含む）を集計（allCompanyIds・demo フィルタしない）', () => {
    expect(ROUTE).toContain('const allCompanyIds')
    expect(ROUTE).not.toMatch(/companyIds[\s\S]{0,80}is_demo !== true/)
    expect(ROUTE).toContain("in('company_id', allCompanyIds)")
    // 行の interviews_used は全企業集計 map から
    expect(ROUTE).toContain('monthlyUsageCounts[c.id] ?? 0')
    expect(ROUTE).toContain('interviews_used: used')
  })
  it('2. demo row は current_amount=0（実請求 0）', () => {
    expect(ROUTE).toContain('const currentAmount = isDemo ? 0 : used * price')
  })
  it('3. demo row status=demo_excluded', () => {
    expect(ROUTE).toContain("isDemo ? 'demo_excluded'")
  })
  it('4. demo row next_billing_date=null', () => {
    expect(ROUTE).toContain('next_billing_date: isDemo ? null : nextBillingDate')
  })
  it('5/6/7. demo は monthlyRevenue / unbilledAmount / unbilledCount に加算しない', () => {
    expect(ROUTE).toMatch(/if \(!isDemo\) \{[\s\S]{0,200}monthlyRevenue \+=/)
    expect(ROUTE).toMatch(/if \(!isDemo\)[\s\S]{0,260}unbilledAmount \+=/)
    expect(ROUTE).toMatch(/if \(!isDemo\)[\s\S]{0,260}unbilledCount \+= 1/)
  })
  it('8. 本番企業は current_amount=used*price かつ集計に加算（従来どおり）', () => {
    // 非 demo は currentAmount = used * price、monthlyRevenue へ加算。
    expect(ROUTE).toContain('used * price')
    expect(ROUTE).toContain('is_demo: isDemo')
  })
})

describe('admin/billing page: demo row の UI（対象外(デモ)/次回—/請求書発行なし）', () => {
  it('9. getBillingStatusConfig に demo_excluded=「対象外（デモ）」', () => {
    expect(PAGE).toContain("demo_excluded: {")
    expect(PAGE).toContain('対象外（デモ）')
  })
  it('BillingRow に is_demo を追加', () => {
    expect(PAGE).toContain('is_demo?: boolean')
  })
  it('10. demo は次回請求日「—」（desktop / mobile 両方）', () => {
    const matches = PAGE.match(/row\.is_demo \? '—' : \(row\.next_billing_date \?\? '—'\)/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
  it('11/12. demo は請求書発行ボタン非表示（!row.is_demo でガード・desktop/mobile 両方）', () => {
    const guards = PAGE.match(/\{!row\.is_demo &&/g) ?? []
    expect(guards.length).toBeGreaterThanOrEqual(2)
    // 詳細ボタンは残す
    expect(PAGE).toContain('詳細')
  })
})

describe('13. monthly-billing の demo skip 維持（regression なし）', () => {
  const BATCH = read('app/api/internal/batch/monthly-billing/route.ts')
  it('demo は billing_record を作らず skip', () => {
    expect(BATCH).toContain('company.is_demo === true')
    expect(BATCH).toContain('skippedDemo')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('app/client/(dashboard)/billing/page.tsx')
const CLIENT = read('app/client/(dashboard)/billing/BillingClient.tsx')
const LAYOUT = read('app/client/components/ClientLayout.tsx')
const INVOICE = read('app/api/client/billing/[billing_record_id]/invoice/route.ts')
const BILLING_API = read('app/api/client/billing/route.ts')

describe('billing page: Server Component gate', () => {
  it('page.tsx は Server Component（use client でない）で getClientUser + can(billing.read) gate', () => {
    expect(PAGE).not.toContain("'use client'")
    expect(PAGE).toContain('getClientUser()')
    expect(PAGE).toContain("can(user.companyRole, 'billing.read')")
    expect(PAGE).toContain("redirect('/client/dashboard')")   // 権限不足
    expect(PAGE).toContain("redirect('/client/login')")       // 認証失敗（区別）
    expect(PAGE).toContain('<BillingClient />')
  })
})

describe('billing client: browser 直読み撤去', () => {
  it('billing_records/companies/interviews を browser 直 SELECT しない・API 経由', () => {
    expect(CLIENT).not.toContain("from('billing_records')")
    expect(CLIENT).not.toContain('createClientBrowserClient')
    expect(CLIENT).toContain("fetch('/api/client/billing'")
  })
  it('status badge は pending/paid/failed/refunded・DL は pending/paid のみ', () => {
    expect(CLIENT).toContain('pending')
    expect(CLIENT).toContain('paid')
    expect(CLIENT).toContain('failed')
    expect(CLIENT).toContain('refunded')
    expect(CLIENT).toContain("ISSUABLE = new Set(['pending', 'paid'])")
    // 死蔵 status を残さない
    expect(CLIENT).not.toContain('billed:')
    expect(CLIENT).not.toContain('overdue:')
    expect(CLIENT).not.toContain('draft:')
  })
})

describe('billing サマリ API', () => {
  it('billing.read gate・company_id 固定・機微列を返さない', () => {
    expect(BILLING_API).toContain("can(user.companyRole, 'billing.read')")
    expect(BILLING_API).toContain("eq('company_id', user.companyId)")
    expect(BILLING_API).not.toContain('invoice_snapshot')
  })
})

describe('invoice API: billing.read を record 取得より先に', () => {
  it('can(billing.read) が UUID 検証・record fetch より前', () => {
    const canIdx = INVOICE.indexOf("can(user.companyRole, 'billing.read')")
    const uuidIdx = INVOICE.indexOf('isValidUUID(billing_record_id)')
    const fetchIdx = INVOICE.indexOf("from('billing_records')")
    expect(canIdx).toBeGreaterThan(0)
    expect(canIdx).toBeLessThan(uuidIdx)
    expect(canIdx).toBeLessThan(fetchIdx)
  })
})

describe('sidebar: 請求履歴を billing.read で表示制御', () => {
  it('請求履歴 nav に requiredPermission=billing.read・visibleNavigation で filter', () => {
    expect(LAYOUT).toContain("requiredPermission: 'billing.read'")
    expect(LAYOUT).toContain('visibleNavigation')
    expect(LAYOUT).toContain('useCompanyPermissions')
    // loading 中 fail-closed（can が false を返す＝非表示）: 独自 role===owner 判定を新設しない
    expect(LAYOUT).not.toContain("role === 'owner'")
  })
})

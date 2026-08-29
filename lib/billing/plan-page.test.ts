import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('app/client/(dashboard)/plan/page.tsx')
const ROUTE = read('app/api/client/plan/route.ts')

describe('plan/page.tsx: 無限「読み込み中」修正（API 失敗を error state に）', () => {
  it('1/2/3. loading と error を別 guard にする（loading || !plan で永久ローディングしない）', () => {
    expect(PAGE).toContain('if (loading) {')
    expect(PAGE).toContain('if (loadError || !plan) {')
    expect(PAGE).not.toContain('if (loading || !plan)')
  })
  it('2/3. API 失敗（!res.ok / catch）で loadError を立てる', () => {
    expect(PAGE).toMatch(/!res\.ok[\s\S]{0,120}setLoadError\(true\)/)
    expect(PAGE).toContain('setLoadError(true)')
  })
  it('error state に「取得に失敗」＋再読み込みボタン', () => {
    expect(PAGE).toContain('料金・利用状況の取得に失敗しました')
    expect(PAGE).toContain('再読み込み')
  })
  it('4. 401 のみ login へ redirect', () => {
    expect(PAGE).toMatch(/status === 401[\s\S]{0,80}\/client\/login/)
  })
})

describe('plan/page.tsx: fake demo PlanData 撤去 / demo は DB authority', () => {
  it('9. hasDemoCookie 固定 PlanData 経路が無い', () => {
    expect(PAGE).not.toContain('hasDemoCookie')
    expect(PAGE).not.toContain('monthly_count: 3')
    expect(PAGE).not.toContain('current_charge: 12000')
  })
  it('5. isDemo は plan.is_demo（DB 由来）から derive（cookie/query/mode ではない）', () => {
    expect(PAGE).toContain('const isDemo = plan.is_demo === true')
    expect(PAGE).not.toContain('setIsDemo')
  })
  it('10. PATCH で client 申告 demo:true を送らない', () => {
    expect(PAGE).not.toContain('demo: true')
    expect(PAGE).not.toMatch(/isDemo \? \{ demo: true \}/)
  })
})

describe('plan/page.tsx: 旧「10分」文言撤去 / demo 料金・上限表示', () => {
  it('11. 「10分未満は課金対象外」「10分以上実施」文言が無い', () => {
    expect(PAGE).not.toContain('10分未満')
    expect(PAGE).not.toContain('10分以上')
    expect(PAGE).not.toContain('10分')
  })
  it('6/7. demo は請求見込み ¥0＋「請求は発生しません」（有料金額を出さない）', () => {
    expect(PAGE).toContain('デモ企業のため請求は発生しません')
    expect(PAGE).toMatch(/isDemo \?[\s\S]{0,200}yen\(0\)/)
  })
  it('8. demo は「受付停止」を出さない（isAtLimit && !isDemo）＋デモ向け注記', () => {
    expect(PAGE).toContain('isAtLimit && !isDemo')
    expect(PAGE).toContain('デモ企業では上限による受付停止は行われません')
  })
})

describe('api/client/plan: is_demo を service-role で解決（authenticated 直読みしない）', () => {
  it('authenticated（createClientServerClient）の company select に is_demo を含めない', () => {
    // phase2h 列ホワイトリスト外の is_demo を authenticated select に入れると company 取得ごと失敗する
    expect(ROUTE).not.toMatch(/createClientServerClient[\s\S]{0,400}select\([^)]*is_demo/)
    expect(ROUTE).toContain("select('id, monthly_interview_limit, next_month_interview_limit, next_month_limit_effective_month, price_per_interview')")
  })
  it('is_demo は service-role で自社1社のみ読み取る（.eq(id, user.companyId)）', () => {
    expect(ROUTE).toContain('createServiceRoleClient()')
    expect(ROUTE).toMatch(/select\('is_demo'\)[\s\S]{0,80}\.eq\('id', user\.companyId\)/)
    expect(ROUTE).toContain('const isDemo = demoRow?.is_demo === true')
  })
  it('demo は current_charge=0・利用件数は実数（used=monthlyCount）', () => {
    expect(ROUTE).toContain('const used = monthlyCount ?? 0')
    expect(ROUTE).toContain('current_charge: isDemo ? 0 : used * pricePerInterview')
    expect(ROUTE).toContain('is_demo: isDemo')
  })
})

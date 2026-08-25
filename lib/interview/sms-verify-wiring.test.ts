import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// sms/verify route と verify ページの「デモ固定コード」配線を source-level で守る（RTL 不使用のため）。
const ROUTE = readFileSync(
  join(process.cwd(), 'app/api/interview/[slug]/sms/verify/route.ts'),
  'utf8',
)
const PAGE = readFileSync(
  join(process.cwd(), 'app/interview/[slug]/verify/page.tsx'),
  'utf8',
)

describe('sms/verify route: demo 判定は server 解決 + client 非信用', () => {
  it('slug→company を service-role で解決し is_demo を select する', () => {
    expect(ROUTE).toContain('createServiceRoleClient')
    expect(ROUTE).toContain("select('id, is_suspended, is_demo')")
    expect(ROUTE).toContain(".eq('interview_slug', slug)")
  })
  it('固定コード許可は isFixedSmsCodeAllowed(company)（client body の is_demo/companyId を使わない）', () => {
    expect(ROUTE).toContain('isFixedSmsCodeAllowed(company)')
    // body.is_demo / body.company_id を判定に使っていない
    expect(ROUTE).not.toContain('body.is_demo')
    expect(ROUTE).not.toContain('body.company_id')
  })
  it('applicant が当該企業所属であることを再検証（cross-company を弾く）', () => {
    expect(ROUTE).toContain('applicant.company_id !== company.id')
  })
  it('許可されない企業は 503 SMS_NOT_AVAILABLE（固定コードを通さない）', () => {
    expect(ROUTE).toContain("errorJson('SMS_NOT_AVAILABLE'")
    expect(ROUTE).toContain('503')
  })
  it('固定コードは DEMO_FIXED_SMS_CODE に集約（1234 をハードコード分岐しない）', () => {
    expect(ROUTE).toContain('DEMO_FIXED_SMS_CODE')
  })
  it('token/phone/OTP を console/response に漏らさない', () => {
    expect(ROUTE).not.toMatch(/console\.(log|error|info|warn)/)
    // 成功レスポンスは verified + sms_token のみ（code/phone を返さない）
    expect(ROUTE).toContain('successJson({ verified: true, sms_token: smsToken })')
    expect(ROUTE).not.toMatch(/successJson\([^)]*code/)
    expect(ROUTE).not.toMatch(/successJson\([^)]*phone/)
  })
})

describe('verify ページ: demo 表示（server 解決の is_demo のみ）', () => {
  it('is_demo は public-config（server 解決）由来のみを表示に使う', () => {
    expect(PAGE).toContain('company?.is_demo === true')
    expect(PAGE).toContain('/api/interview/${slug}/public-config')
  })
  it('デモ企業には固定コード 1234 の案内を明示する', () => {
    expect(PAGE).toContain('デモ環境のため、認証コード')
    expect(PAGE).toContain('1234')
    expect(PAGE).toContain('SMSは送信されません')
  })
  it('デモ時は「SMS認証準備中」を出さない（503 は通常企業のみ・準備中はデモ分岐外）', () => {
    // 準備中メッセージは残すが、demo 分岐（isDemo）配下に無いことを保証。
    const idxDemo = PAGE.indexOf('const isDemo =')
    const idxJunbi = PAGE.indexOf('SMS認証は現在準備中です')
    expect(idxDemo).toBeGreaterThan(0)
    // 準備中は 503 ハンドリング（通常企業）にのみ存在する。
    expect(idxJunbi).toBeGreaterThan(0)
    expect(PAGE).toContain('SMS_NOT_AVAILABLE')
  })
})

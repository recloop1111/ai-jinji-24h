import { describe, it, expect } from 'vitest'
import { isFixedSmsCodeAllowed, DEMO_FIXED_SMS_CODE } from './sms-demo-policy'

// 固定コード(1234)の許可判定は「server が slug から解決した company.is_demo」のみを SoT とする。
// client 由来の値は本関数の入力にならない（route が service-role で解決した company を渡す）。

describe('isFixedSmsCodeAllowed', () => {
  const demo = { id: 'demo-co', is_demo: true }
  const normal = { id: 'real-co', is_demo: false }

  it('req6: is_demo=true の企業は（本番/Preview 含め）固定コードを許可', () => {
    // env に依存せず is_demo だけで許可（環境一律 bypass ではなく「demo 指定された企業だけ」）。
    expect(isFixedSmsCodeAllowed(demo, {})).toBe(true)
    expect(isFixedSmsCodeAllowed(demo, { SMS_FIXED_CODE_COMPANY_ID: undefined })).toBe(true)
  })

  it('req4: 通常企業（is_demo=false）は固定コードを絶対に許可しない', () => {
    expect(isFixedSmsCodeAllowed(normal, {})).toBe(false)
    expect(isFixedSmsCodeAllowed(normal, { SMS_FIXED_CODE_COMPANY_ID: '' })).toBe(false)
  })

  it('is_demo が null/undefined は許可しない（安全側）', () => {
    expect(isFixedSmsCodeAllowed({ id: 'x', is_demo: null }, {})).toBe(false)
    expect(isFixedSmsCodeAllowed({ id: 'x', is_demo: undefined as unknown as boolean }, {})).toBe(false)
  })

  it('env override: SMS_FIXED_CODE_COMPANY_ID に一致する company_id だけ追加許可', () => {
    expect(isFixedSmsCodeAllowed(normal, { SMS_FIXED_CODE_COMPANY_ID: 'real-co' })).toBe(true)
    // 別の company には波及しない（全企業許可にならない）
    expect(isFixedSmsCodeAllowed({ id: 'other-co', is_demo: false }, { SMS_FIXED_CODE_COMPANY_ID: 'real-co' })).toBe(false)
  })

  it('req5: cross-company — 解決された company が normal なら、どんな env でも 1 社にしか効かない', () => {
    // slug spoof で別 slug を渡しても route は「その slug の company」を解決する。
    // ここでは「解決結果が normal 企業」なら false であることを保証（demo へ昇格しない）。
    expect(isFixedSmsCodeAllowed(normal, { SMS_FIXED_CODE_COMPANY_ID: 'demo-co' })).toBe(false)
  })

  it('固定コードは 1234', () => {
    expect(DEMO_FIXED_SMS_CODE).toBe('1234')
  })
})

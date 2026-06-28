// 請求書の発行者/振込先/支払案内文（billing_issuer_settings・運営の単一設定 id='default'）の
// 共通フィールド定義・サニタイズ・config fallback。admin の billing-settings API が共有する。
// DB未設定時は lib/config/billing.ts（BILLING_ISSUER / BILLING_BANK / BILLING_TERMS.paymentNote）を fallback。
// ※ taxRate / numberPrefix / issuableStatuses はロジック定数のため DB化しない（config のまま）。

import { BILLING_ISSUER, BILLING_BANK, BILLING_TERMS } from '@/lib/config/billing'

export const BILLING_ISSUER_SETTINGS_FIELDS = [
  // 発行者
  'issuer_name',
  'postal_code',
  'address',
  'building',
  'tel',
  'registration_number', // 空OK（空なら請求書PDFに登録番号行を出さない）
  // 振込先
  'bank_name',
  'branch_name',
  'account_type',
  'account_number',
  'account_holder',
  // 文言
  'payment_note',
] as const

export type BillingIssuerSettingsField = (typeof BILLING_ISSUER_SETTINGS_FIELDS)[number]
export type BillingIssuerSettingsInput = Partial<Record<BillingIssuerSettingsField, string | null>>
export type BillingIssuerSettingsRow = Record<BillingIssuerSettingsField, string>

// 1フィールドの最大長（DBは text・無制限だが、暴走入力を防ぐためアプリ側で上限）。
const MAX_LEN = 500

// body から発行者設定フィールドのみを抽出し trim。空文字/空白は null（未設定）に正規化。
// 文字列以外（undefined含む）はキーごとスキップ（upsert で当該列を変更しない）。
export function sanitizeIssuerSettings(body: unknown): BillingIssuerSettingsInput {
  const out: BillingIssuerSettingsInput = {}
  if (!body || typeof body !== 'object') return out
  const b = body as Record<string, unknown>
  for (const f of BILLING_ISSUER_SETTINGS_FIELDS) {
    const v = b[f]
    if (typeof v === 'string') {
      const trimmed = v.trim().slice(0, MAX_LEN)
      out[f] = trimmed.length > 0 ? trimmed : null
    } else if (v === null) {
      out[f] = null
    }
  }
  return out
}

// 未設定時の fallback（lib/config/billing.ts 由来）。GET で UI へ「現在の既定値」として返す
// （placeholder 表示用）。DB行が無い間はこの値が請求書PDFに使われる（DB化後の resolver で参照予定）。
export function configFallbackIssuerSettings(): BillingIssuerSettingsRow {
  return {
    issuer_name: BILLING_ISSUER.companyName,
    postal_code: BILLING_ISSUER.postalCode,
    address: BILLING_ISSUER.address,
    building: BILLING_ISSUER.building,
    tel: BILLING_ISSUER.tel,
    registration_number: BILLING_ISSUER.registrationNumber,
    bank_name: BILLING_BANK.bankName,
    branch_name: BILLING_BANK.branchName,
    account_type: BILLING_BANK.accountType,
    account_number: BILLING_BANK.accountNumber,
    account_holder: BILLING_BANK.accountHolder,
    payment_note: BILLING_TERMS.paymentNote,
  }
}

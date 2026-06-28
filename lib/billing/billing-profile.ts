// 請求先情報（company_billing_profiles）の共通フィールド定義・サニタイズ。
// client/admin の billing-profile API が共有する。請求先側の登録番号は持たない（発行者側のみ）。

export const BILLING_PROFILE_FIELDS = [
  'billing_name',
  'department',
  'contact_name',
  'contact_email',
  'postal_code',
  'address',
  'building',
  'phone',
  'note',
] as const

export type BillingProfileField = (typeof BILLING_PROFILE_FIELDS)[number]
export type BillingProfileInput = Partial<Record<BillingProfileField, string | null>>

// 1フィールドの最大長（DBは text・無制限だが、暴走入力を防ぐためアプリ側で上限）。
const MAX_LEN = 500

// body から請求先フィールドのみを抽出し trim。空文字/空白は null（未設定）に正規化。
// 文字列以外（undefined含む）はキーごとスキップ（upsert で当該列を変更しない）。
export function sanitizeBillingProfile(body: unknown): BillingProfileInput {
  const out: BillingProfileInput = {}
  if (!body || typeof body !== 'object') return out
  const b = body as Record<string, unknown>
  for (const f of BILLING_PROFILE_FIELDS) {
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

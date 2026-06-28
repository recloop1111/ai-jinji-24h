// 請求書（PDF）の発行者・振込先・条件の定数。
// ⚠️ 本番前に正式な会社名/住所/振込先/登録番号へ差し替え必須（docs/PRE_RELEASE_CHECKLIST.md 参照）。
// secret値ではないが口座情報を含むため、本番前チェック対象として管理する。

export const BILLING_ISSUER = {
  companyName: '株式会社サンプル（プレースホルダ）',
  postalCode: '000-0000',
  address: '東京都〇〇区〇〇 0-0-0',
  building: '', // 任意（建物名）
  tel: '00-0000-0000',
  email: 'billing@example.com',
  representative: '', // 任意（代表者名）
  // 登録番号（T+13桁）。空のときは PDF に登録番号行を出さない（現状インボイス未登録）。
  registrationNumber: '',
} as const

export const BILLING_BANK = {
  bankName: '〇〇銀行（プレースホルダ）',
  branchName: '〇〇支店',
  accountType: '普通',
  accountNumber: '0000000',
  accountHolder: 'カ）サンプル',
} as const

export const BILLING_TERMS = {
  taxRate: 0.1, // 表示用。金額は billing_records の確定値（amount/tax/total_jpy）を使用する
  numberPrefix: 'INV',
  paymentNote: 'お支払いは本請求書記載の振込先へ、支払期限までにお振込みをお願いいたします。',
  // 請求書を発行できる支払ステータス（failed/refunded は発行不可）
  issuableStatuses: ['pending', 'paid'] as const,
} as const

export type IssuableStatus = (typeof BILLING_TERMS.issuableStatuses)[number]

export function isIssuableStatus(status: string | null | undefined): status is IssuableStatus {
  return status != null && (BILLING_TERMS.issuableStatuses as readonly string[]).includes(status)
}

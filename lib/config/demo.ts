// 企業管理画面の「開発用デモ」共通設定。
// middleware（Edge）/ Server Component / Client いずれからも import 可能（client/server 専用 API を含めない）。
//
// 方針:
// - デモは開発専用。本番（NODE_ENV==='production'）では必ず無効。
// - デモ状態は「サーバ判別可能な cookie」で表現する（sessionStorage を認証根拠にしない）。
//   cookie は middleware が dev かつ ?demo=true のときだけ発行する。
// - デモは実セッションを持たないため、保護API（getClientUser）と RLS により実企業データへは到達できない。

export const CLIENT_DEMO_ENABLED = process.env.NODE_ENV !== 'production'

export const DEMO_COOKIE_NAME = 'client_demo'
export const DEMO_COOKIE_VALUE = '1'

export const DEMO_COMPANY_ID = '7a58cc1b-9f81-4da5-ae2c-fd3abea05c33'

// --- クライアント用ヘルパ（document.cookie ベース。本番は CLIENT_DEMO_ENABLED=false で常に無効）---
// middleware（dev・?demo=true 時）が発行した cookie を読む。sessionStorage は使わない。
export function hasDemoCookie(): boolean {
  if (!CLIENT_DEMO_ENABLED || typeof document === 'undefined') return false
  return document.cookie
    .split('; ')
    .some((c) => c === `${DEMO_COOKIE_NAME}=${DEMO_COOKIE_VALUE}`)
}

// デモ cookie を失効させる（ログアウト時など）。
export function clearDemoCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${DEMO_COOKIE_NAME}=; Max-Age=0; path=/`
}

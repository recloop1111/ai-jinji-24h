// PR-P8: 通常企業 SMS 認証（OTP）の provider 非依存ポリシー SoT。秘密情報・API key はここに置かない。
//   実 provider（Twilio 等）はまだ接続しない。実 SMS 送信は Production で行わない。
//   demo 企業の固定コード（1234）は本 SoT とは別系統（lib/interview/sms-demo-policy.ts が権威）。
//
// gate（Task A9）: default OFF / fail-closed。SMS_PROVIDER_ENABLED === 'true' のときだけ provider 経路を許可。
//   これが false（未設定含む）なら、send/verify は provider へ到達しない（＝実 SMS 0・課金 0 を保証）。

// 厳格に 'true' のときだけ有効（未設定/他値は無効＝既定 OFF）。
export function isSmsProviderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SMS_PROVIDER_ENABLED === 'true'
}

// ── OTP ポリシー（Task A3）──────────────────────────────────────────────────────────────────────
export const OTP_CODE_LENGTH = 6 // 実 SMS OTP は 6 桁（demo の 1234=4桁 とは別系統）
export const OTP_TTL_MS = 5 * 60 * 1000 // コード有効期限 5 分
export const OTP_MAX_VERIFY_ATTEMPTS = 5 // 1 コードあたりの照合失敗上限（超過で lockout）
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000 // 再送の最小間隔（連打抑制）
export const OTP_MAX_RESENDS = 3 // 1 認証セッションあたりの再送上限
// abuse / cost guard（Task A7）: 電話番号・応募者単位の総送信上限（従量課金の連打防止）。
export const OTP_MAX_SENDS_PER_PHONE = 5 // 同一電話番号への総送信上限（rate-limit window 内）
export const OTP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // レート制限のウィンドウ（1 時間）
export const OTP_MAX_SENDS_PER_APPLICANT = 5 // 同一 applicant/interview への総送信上限

// provider へ渡す送信 1 回のタイムアウト（実接続は R 系）。
export const SMS_SEND_TIMEOUT_MS = 10_000

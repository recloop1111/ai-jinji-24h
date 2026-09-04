// 応募者総合レポートのメール共有 — 純ロジック（DB/HTTP/provider 非依存・テスト可能）。
//   recipient/message の validation、Demo/Preview の送信ポリシー（allowlist）、件名/本文/監査文言。

// 件名は固定（PII 最小化: 応募者氏名・会社名を含めない）。
export const SHARE_EMAIL_SUBJECT = 'AIMEN24｜応募者総合レポートのご送付'
// sent_emails.body（NOT NULL）へ入れる非PII の固定監査文言（PDF/本文/評価は保存しない）。
export const SHARE_EMAIL_AUDIT_BODY = '応募者総合レポートPDFをメール共有'

export type RecipientResult = { ok: true; email: string } | { ok: false; error: string }
// 単一 recipient のみ。trim・空禁止・最大254・CRLF 禁止・RFC-lite。comma 区切り複数は不可。
export function validateRecipientEmail(raw: unknown): RecipientResult {
  if (typeof raw !== 'string') return { ok: false, error: '送信先メールアドレスを入力してください' }
  const email = raw.trim()
  if (email === '') return { ok: false, error: '送信先メールアドレスを入力してください' }
  if (email.length > 254) return { ok: false, error: 'メールアドレスが長すぎます' }
  if (/[\r\n]/.test(email)) return { ok: false, error: 'メールアドレスの形式が正しくありません' }
  // comma を含む=複数指定は不可。@ とドメインの現実的チェック。
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) return { ok: false, error: 'メールアドレスの形式が正しくありません' }
  return { ok: true, email }
}

export type MessageResult = { ok: true; message: string } | { ok: false; error: string }
// 任意・string のみ・trim・最大1000・plain text（HTML 解釈しない）。
export function validateShareMessage(raw: unknown): MessageResult {
  if (raw == null) return { ok: true, message: '' }
  if (typeof raw !== 'string') return { ok: false, error: 'メッセージの形式が正しくありません' }
  const message = raw.trim()
  if (message.length > 1000) return { ok: false, error: 'メッセージは1000文字以内で入力してください' }
  return { ok: true, message }
}

// MAIL_TEST_RECIPIENT_ALLOWLIST（comma 区切り）を正規化（trim・小文字・空除去）。
export function parseAllowlist(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '')
}

// 送信ポリシー: demo 企業 OR 非 production 環境 → allowlist 内の宛先のみ実送信可。
//   production かつ non-demo → 通常の validated 宛先へ送信可。allowlist 未設定時は demo/preview の送信を拒否。
export interface SendPolicyInput {
  isDemo: boolean
  isProduction: boolean
  recipient: string
  allowlist: string[]
}
export type SendPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: 'allowlist_only' | 'allowlist_unset' }
export function evaluateSendPolicy(input: SendPolicyInput): SendPolicyDecision {
  const restricted = input.isDemo || !input.isProduction
  if (!restricted) return { allowed: true } // production non-demo
  if (input.allowlist.length === 0) return { allowed: false, reason: 'allowlist_unset' }
  const r = input.recipient.trim().toLowerCase()
  return input.allowlist.includes(r) ? { allowed: true } : { allowed: false, reason: 'allowlist_only' }
}

// plain text 本文を組み立てる（応募者氏名は本文にのみ・件名には出さない）。任意 message が空なら余計な空行を作らない。
export function buildShareEmailBody(applicantName: string, message: string): string {
  const name = (applicantName ?? '').trim() || '応募者'
  const lines: string[] = [`応募者「${name}」さんの応募者総合レポートをお送りします。`]
  const m = (message ?? '').trim()
  if (m) lines.push('', m)
  lines.push(
    '',
    '本メールには履歴書情報およびAI面接評価を含む個人情報資料が添付されています。お取り扱いには十分ご注意ください。',
    '',
    'AIMEN24',
  )
  return lines.join('\n')
}

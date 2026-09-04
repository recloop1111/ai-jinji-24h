import { Resend } from 'resend'

// server 専用のメール送信ラッパ（Resend）。
//   - sender は env MAIL_FROM から解決（hard-code しない）。API key は env RESEND_API_KEY。
//   - env 未設定なら実送信せず honest に unconfigured を返す（成功を偽装しない）。
//   - PII（宛先/本文/添付/API key）を一切ログに出さない。独自 timeout は設けない（曖昧な二重送信状態を作らない）。

export interface EmailAttachment {
  filename: string
  content: Buffer
}
export interface SendEmailParams {
  to: string
  subject: string
  text: string // plain text 本文（HTML 化しない）
  attachments?: EmailAttachment[]
}
export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'unconfigured' | 'provider_error' }

export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim())
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.MAIL_FROM?.trim()
  if (!apiKey || !from) return { ok: false, reason: 'unconfigured' }

  try {
    const resend = new Resend(apiKey)
    // Resend SDK v6: emails.send(payload) → { data: { id } | null, error }
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
    })
    // provider が message id を返した場合のみ成功。error あり / id 無しは失敗（成功を偽装しない）。
    if (error || !data?.id) return { ok: false, reason: 'provider_error' }
    return { ok: true, messageId: data.id }
  } catch {
    // ネットワーク/例外は provider_error（詳細・PII はログに出さない）。
    return { ok: false, reason: 'provider_error' }
  }
}

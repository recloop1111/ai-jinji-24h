// 公開面接フロー用 ケイパビリティ・トークン（HMAC-SHA256）。
// 応募者本人の面接フローだけを service-role API で安全に更新できるようにするための署名トークン。
// - 外部パッケージ不要（node:crypto）。Node runtime 想定（Edge専用APIにしない）。
// - DBカラム追加なし・ステートレス。秘密鍵は INTERVIEW_TOKEN_SECRET（サーバ専用 env）。
// - payload は { slug, applicant_id, iat, exp }。interview_id は含めない（DB側で applicant↔interview の整合を検証する）。

import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_TTL_SECONDS = 2 * 60 * 60 // 2時間（面接時間＋余裕）

export type InterviewTokenPayload = {
  slug: string
  applicant_id: string
  iat: number
  exp: number
}

function getSecret(): string {
  const secret = process.env.INTERVIEW_TOKEN_SECRET
  if (!secret) {
    throw new Error('INTERVIEW_TOKEN_SECRET is not set')
  }
  return secret
}

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function sign(payloadB64: string, secret: string): string {
  return base64urlEncode(createHmac('sha256', secret).update(payloadB64).digest())
}

export function signInterviewToken(input: { slug: string; applicant_id: string; ttlSeconds?: number }): string {
  const secret = getSecret()
  const now = Math.floor(Date.now() / 1000)
  const payload: InterviewTokenPayload = {
    slug: input.slug,
    applicant_id: input.applicant_id,
    iat: now,
    exp: now + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  }
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

// 署名・有効期限を検証し、正当なら payload を、不正なら null を返す。
export function verifyInterviewToken(token: string | null | undefined): InterviewTokenPayload | null {
  if (!token || typeof token !== 'string') return null
  const secret = getSecret()
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, providedSig] = parts

  const expectedSig = sign(payloadB64, secret)
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: InterviewTokenPayload
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8')) as InterviewTokenPayload
  } catch {
    return null
  }
  if (typeof payload.slug !== 'string' || typeof payload.applicant_id !== 'string') return null
  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) >= payload.exp) return null
  return payload
}

import { randomBytes, createHash } from 'node:crypto'

// 招待 token の生成/hash（E-5-3-2）。
//   ※ 平文 token は URL（メールリンク）にのみ載せ、DB には hash（SHA-256 hex）だけ保存する。
//   ※ token は 256bit ランダム（base64url）。log/URL 以外に平文を出さない。

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

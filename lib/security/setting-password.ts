import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

/**
 * 設定変更用パスワードのハッシュ/検証（企業側・運営側で共通利用）。
 * - ログインパスワードとは別のパスワード。
 * - 平文保存は禁止。保存形式は "<saltHex>:<hashHex>"（scrypt, salt付き）。
 */

const KEY_LEN = 32

/** パスワードを salt 付き scrypt でハッシュ化して "<saltHex>:<hashHex>" を返す */
export function hashSettingPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, KEY_LEN)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

/** 平文パスワードと保存済みハッシュを比較（timing-safe）。未設定/不正形式は false */
export function verifySettingPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false
  const [saltHex, hashHex] = storedHash.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), KEY_LEN)
    const expected = Buffer.from(hashHex, 'hex')
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** 設定変更用パスワードの最低要件チェック（最低8文字） */
export function isValidSettingPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8
}

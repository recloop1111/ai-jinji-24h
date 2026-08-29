// デジタル履歴書 v1 — 正規化/整形の純ロジック（DB/HTTP 非依存）。
import { normalizeDigits } from '@/lib/utils/normalizeDigits'

// 郵便番号を 7桁半角数字へ正規化。全角数字・ハイフン・空白を許容し、7桁の数字にできなければ null。
//   "220-0012" → "2200012" / "２２０００１２" → "2200012" / それ以外/桁不一致 → null。
export function normalizePostalCode(input: string | null | undefined): string | null {
  if (input == null) return null
  const digits = normalizeDigits(String(input)).replace(/[-−ー－\s]/g, '')
  return /^\d{7}$/.test(digits) ? digits : null
}

// 年月 'YYYY-MM' 検証（01–12・4桁年）。全角数字は許容して正規化。
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
export function normalizeYearMonth(input: string | null | undefined): string | null {
  if (input == null) return null
  const s = normalizeDigits(String(input)).trim()
  if (s === '') return null
  return YM_RE.test(s) ? s : null // 不正形式は null（呼び出し側で「無効」を扱う）
}
export function isValidYearMonth(input: string | null | undefined): boolean {
  if (input == null || String(input).trim() === '') return true // 未入力は許容（任意項目）
  return normalizeYearMonth(input) !== null
}
// 'YYYY-MM' の大小比較用に数値化（YYYY*12+MM）。不正/未入力は null。
export function yearMonthToOrdinal(input: string | null | undefined): number | null {
  const s = normalizeYearMonth(input)
  if (s === null) return null
  const [y, m] = s.split('-').map((n) => parseInt(n, 10))
  return y * 12 + (m - 1)
}

// 満年齢を birth_date（'YYYY-MM-DD'）と基準日から算出。age は SoT にしない（表示/PDF で都度計算）。
export function computeAge(birthDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate).trim())
  if (!m) return null
  const by = parseInt(m[1], 10), bm = parseInt(m[2], 10), bd = parseInt(m[3], 10)
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) return null
  let age = now.getFullYear() - by
  // 誕生日をまだ迎えていなければ -1（月→日で比較）。誕生日当日は据え置き（+0）。
  const beforeBirthday = now.getMonth() + 1 < bm || (now.getMonth() + 1 === bm && now.getDate() < bd)
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 150 ? age : null
}

// 前後空白除去。空文字は null（未入力）に寄せる。
export function trimToNull(s: string | null | undefined): string | null {
  if (s == null) return null
  const t = String(s).trim()
  return t === '' ? null : t
}

// PR-P8: 日本国内前提の電話番号正規化（純関数・OpenAI/DB/UI 非依存）。
//   canonical = E.164（+81...）。UI 表示用 mask も pure 化。
//   方針: 現仕様は「日本の携帯番号（070/080/090・11桁）」のみ許可。固定電話・海外番号・桁不足/過多・
//   異常文字は reject（曖昧を通さない）。既存 applicants.phone_number（生保存）は破壊しない＝本関数は
//   新フローの検証/正規化用途で、既存データの migration は行わない。

import { normalizeDigits } from '@/lib/utils/normalizeDigits'

export type PhoneNormalizeError =
  | 'empty'
  | 'invalid_chars' // 数字/記号/+ 以外が混入
  | 'too_short'
  | 'too_long'
  | 'not_jp_mobile' // 日本の携帯（070/080/090）でない（固定電話/海外等）

export type PhoneNormalizeResult =
  | { ok: true; e164: string; national: string } // e164='+8190...' national='09012345678'
  | { ok: false; reason: PhoneNormalizeError }

// 日本の携帯プレフィックス（国内 0 付き 3 桁）。
const JP_MOBILE_PREFIXES = ['070', '080', '090'] as const

// 入力（全角/ハイフン/空白/+81 等）→ E.164 + 国内表記。曖昧・不正は reject。
export function normalizePhoneJP(input: string | null | undefined): PhoneNormalizeResult {
  if (!input || typeof input !== 'string') return { ok: false, reason: 'empty' }
  // 全角数字を半角へ、全角＋を半角+へ、ハイフン/空白/括弧を除去。先頭 + は国番号として一旦保持。
  const half = normalizeDigits(input).replace(/＋/g, '+').trim()
  if (half.length === 0) return { ok: false, reason: 'empty' }
  const hasPlus = half.startsWith('+')
  const stripped = half.replace(/[\s\-()]/g, '')
  const body = hasPlus ? stripped.slice(1) : stripped
  // 許可文字は数字のみ（+ は先頭のみ許容済み）。
  if (!/^\d+$/.test(body)) return { ok: false, reason: 'invalid_chars' }

  // 国内 0 始まりの 11 桁（携帯）へ正規化する。
  let national: string
  if (hasPlus) {
    // + が付く場合は日本国番号 81 のみ許可（海外番号は現仕様で不可）。
    if (!body.startsWith('81')) return { ok: false, reason: 'not_jp_mobile' }
    const withoutCc = body.slice(2)
    if (withoutCc.startsWith('0')) return { ok: false, reason: 'not_jp_mobile' } // +810... は不正
    national = '0' + withoutCc
  } else if (body.startsWith('81') && body.length === 12) {
    // 先頭 + 無しの 81XXXXXXXXXX（12桁）も国番号として許容（8190... → 090...）。
    national = '0' + body.slice(2)
  } else {
    national = body // 国内表記そのまま（09012345678 等）
  }

  if (national.length < 11) return { ok: false, reason: 'too_short' }
  if (national.length > 11) return { ok: false, reason: 'too_long' }
  const prefix = national.slice(0, 3)
  if (!(JP_MOBILE_PREFIXES as readonly string[]).includes(prefix)) return { ok: false, reason: 'not_jp_mobile' }

  const e164 = '+81' + national.slice(1) // 先頭 0 を国番号 +81 に置換
  return { ok: true, e164, national }
}

// 表示用マスク（09012345678 / +8190... → 090-****-5678）。正規化不能な入力は '***' を返す（PII を晒さない）。
export function maskPhoneJP(input: string | null | undefined): string {
  const r = normalizePhoneJP(input)
  if (!r.ok) return '***'
  const n = r.national // 0AB CDEF GHIJ（11桁）
  return `${n.slice(0, 3)}-****-${n.slice(7)}`
}

// 保存/検証で使う canonical（E.164）。不正は null。
export function toE164JP(input: string | null | undefined): string | null {
  const r = normalizePhoneJP(input)
  return r.ok ? r.e164 : null
}

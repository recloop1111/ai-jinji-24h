// 請求の支払期限（due_date）と overdue 判定（JST基準）。
// 請求日 = billing_records.created_at。支払期限 = 請求日の「翌月末」（JST）。
// overdue は DB に持たず、payment_status='pending' かつ 今日(JST) > 支払期限 で導出する。

// 今日（JST, YYYY-MM-DD）
function todayJst(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * 請求日(created_at)の翌月末（JST, YYYY-MM-DD）を返す。
 * 例: created_at が 2026-07-01(JST) → 翌月=8月 → 2026-08-31。
 * Date.UTC(y, m+2, 0) は「(m+1)月の最終日」＝翌月末（m は createdAt の0-indexed JST月）。
 */
export function jstDueDate(createdAtIso: string | null | undefined): string | null {
  if (!createdAtIso) return null
  const t = new Date(createdAtIso).getTime()
  if (!Number.isFinite(t)) return null
  const jst = new Date(t + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = jst.getUTCMonth() // createdAt の JST 月（0-indexed）
  const last = new Date(Date.UTC(y, m + 2, 0)) // 翌月の最終日
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`
}

/**
 * overdue 判定: payment_status='pending' かつ 今日(JST) が支払期限を過ぎている。
 * paid/failed/refunded は overdue にしない。
 */
export function isOverdue(
  createdAtIso: string | null | undefined,
  paymentStatus: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (paymentStatus !== 'pending') return false
  const due = jstDueDate(createdAtIso)
  if (!due) return false
  return todayJst(now) > due
}

/**
 * 表示用の実効ステータス: pending かつ overdue なら 'overdue'、それ以外は payment_status。
 */
export function effectiveStatus(
  createdAtIso: string | null | undefined,
  paymentStatus: string | null | undefined,
  now: number = Date.now(),
): string {
  const ps = paymentStatus ?? 'pending'
  return isOverdue(createdAtIso, ps, now) ? 'overdue' : ps
}

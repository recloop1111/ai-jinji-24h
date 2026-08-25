// PR-19D: completion grace（面接終了 race による末尾 transcript 欠落の緩和・純ロジック）。
//
// 背景: client flush は末尾 transcript を /end より前に送るが、network / Vercel 遅延で 1 件が /end の後に
//   着弾し得る。/end は status を completed / cancelled へ確定するため、その後の transcript write は
//   従来 INTERVIEW_NOT_ACTIVE で失われる。そこで「completed になった直後の短い grace window」に限り write を許す。
//
// 判定:
//   - status='completed' かつ ended_at から grace 以内 → 許可（末尾着弾を拾う）。
//   - status='cancelled' → 不許可（途中離脱に後から発話を足さない）。
//   - status='in_progress' はここでは扱わない（通常の authz が許可する）。
//
// completed 時刻の Source of Truth = interviews.ended_at（/end route が確定時に set）。新列は追加しない（YAGNI）。
// clock skew を考慮し、ended_at が「わずかに未来」でも許容する小さな負側許容を持つ。

// grace window（30〜60秒帯）。client flush（〜5s）+ network/Vercel 遅延に十分な余裕。過度に長くしない
//（長すぎると completed 後の遅延投稿を無制限に許してしまう）。
export const TRANSCRIPT_COMPLETION_GRACE_MS = 60_000

// ended_at がわずかに未来（サーバ/クライアント時計差）でも許容する負側許容。
const CLOCK_SKEW_TOLERANCE_MS = 5_000

// completed かつ grace 以内なら true。それ以外（cancelled / in_progress / ended_at 無効 / 期限切れ）は false。
export function isWithinCompletionGrace(
  status: string,
  endedAt: string | null | undefined,
  nowMs: number,
  graceMs: number = TRANSCRIPT_COMPLETION_GRACE_MS,
): boolean {
  if (status !== 'completed') return false
  if (typeof endedAt !== 'string' || endedAt.length === 0) return false
  const endedMs = Date.parse(endedAt)
  if (!Number.isFinite(endedMs)) return false
  const age = nowMs - endedMs
  return age <= graceMs && age >= -CLOCK_SKEW_TOLERANCE_MS
}

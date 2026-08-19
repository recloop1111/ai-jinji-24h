// P1-2（Codex）: realtime-call の「同一 interview あたり多重 OpenAI 呼び出し」防止ロックの純関数群。
// 実際の原子的クレーム（条件付き UPDATE）はルート側が service-role client で行い、ここは
// TTL 定数と「クレーム結果の解釈」だけを提供する（副作用なし＝単体テスト可能）。
//
// ロックの実体は interviews.realtime_call_locked_until（timestamptz）。
// 追加 SQL: supabase/rls/phase_h_realtime_call_lock.sql（未適用・適用は承認後）。
// 本列が未適用の間は UPDATE がエラーになるが、その場合は fail-open（阻害しない）で段階ロールアウトする。

import { MAX_INTERVIEW_SECONDS } from '@/lib/config/interview-policy'

// ロックの TTL（ミリ秒）。
// 追加P1（Codex）: Realtime セッションは最大 60分続くため、20秒などの短いTTLでは失効後に
// 2本目の並行セッションを張れてしまう。TTL は「面接の最大長 + バッファ」に設定し、セッション寿命を
// またいで保持する。正常終了時は /end がロックを解放するので、正当な次セッションは即許可される
// （＝永久禁止にはならない）。応募者が /end を送らず離脱した場合でも本TTLで自動失効する。
export const REALTIME_CALL_LOCK_TTL_MS = (MAX_INTERVIEW_SECONDS + 300) * 1000 // 60分 + 5分バッファ = 65分

// 条件付き UPDATE ... RETURNING の結果解釈:
//   - error あり（例: 列 realtime_call_locked_until 未適用 / 一時的DB障害）→ 'failopen'（続行）。
//     段階ロールアウトのため、ロック不能を理由に正当な面接を止めない。
//   - error なし & 1行以上 → 'acquired'（ロック取得。続行）。
//   - error なし & 0行 → 'contended'（別セッションが保持中。409 で弾く）。
export type LockClaimOutcome = 'acquired' | 'contended' | 'failopen'

export function interpretLockClaim(
  rows: { id?: unknown }[] | null | undefined,
  error: unknown,
): LockClaimOutcome {
  if (error) return 'failopen'
  if (rows && rows.length > 0) return 'acquired'
  return 'contended'
}

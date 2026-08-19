// P1-2（Codex）: realtime-call の「同一 interview あたり多重 OpenAI 呼び出し」防止ロックの純関数群。
// 実際の原子的クレーム（条件付き UPDATE）はルート側が service-role client で行い、ここは
// TTL 定数と「クレーム結果の解釈」だけを提供する（副作用なし＝単体テスト可能）。
//
// ロックの実体は interviews.realtime_call_locked_until（timestamptz・本番適用済み）。
// SQL: supabase/rls/phase_h_realtime_call_lock.sql（適用済み）。
// 追加P1（Codex）: 列は適用済みのため fail-closed。クレームが確定（acquired）しない限り有料呼び出しへ
// 進めない（error/contended はいずれも拒否）。以前の "failopen（段階ロールアウト）" は撤回した。

import { MAX_INTERVIEW_SECONDS } from '@/lib/config/interview-policy'

// ロックの TTL（ミリ秒）。
// 追加P1（Codex）: Realtime セッションは最大 60分続くため、20秒などの短いTTLでは失効後に
// 2本目の並行セッションを張れてしまう。TTL は「面接の最大長 + バッファ」に設定し、セッション寿命を
// またいで保持する。正常終了時は /end がロックを解放するので、正当な次セッションは即許可される
// （＝永久禁止にはならない）。応募者が /end を送らず離脱した場合でも本TTLで自動失効する。
export const REALTIME_CALL_LOCK_TTL_MS = (MAX_INTERVIEW_SECONDS + 300) * 1000 // 60分 + 5分バッファ = 65分

// 条件付き UPDATE ... RETURNING の結果解釈（fail-closed）:
//   - error なし & 1行以上 → 'acquired'（ロックを確実に取得＝続行）。
//   - error なし & 0行 → 'contended'（別セッションが保持中 → 409 で弾く）。
//   - error あり（一過性のDB書き込み失敗等）→ 'error'。追加P1（Codex）: ロックを取得できたか不明な状態で
//     有料 OpenAI 呼び出しへ進むと、同一面接で複数の課金セッションを張れてしまう。列は本番適用済みなので
//     以前の "failopen（段階ロールアウト）" は撤回し、取得が確定しない限り fail-closed で拒否する。
export type LockClaimOutcome = 'acquired' | 'contended' | 'error'

export function interpretLockClaim(
  rows: { id?: unknown }[] | null | undefined,
  error: unknown,
): LockClaimOutcome {
  if (error) return 'error'
  if (rows && rows.length > 0) return 'acquired'
  return 'contended'
}

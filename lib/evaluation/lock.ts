// PR-4E-3: 評価の並行実行ロック（二重 Provider 呼び出し＝二重課金の排除）。
// 既存 realtime_call_locked_until と同思想: interviews に短TTLロック列 + 原子的な「条件付き UPDATE」で claim する。
//   （SELECT→UPDATE の 2段は race するため使わない。UPDATE ... WHERE (locked IS NULL OR locked < now()) RETURNING id が原子的。）
// client 注入・import/create で DB access しない。実 method 呼び出し時のみ副作用。本 PR では Production から呼ばない。

// ロック TTL（評価は数秒〜十数秒。retry を含めても十分・crash 時は TTL で自然回復）。
export const EVALUATION_LOCK_TTL_MS = 5 * 60 * 1000 // 5 分

export type LockClaimOutcome = 'acquired' | 'contended' | 'error'

export interface EvaluationLock {
  acquire(interviewId: string): Promise<LockClaimOutcome>
  release(interviewId: string): Promise<void>
}

// 原子的 claim/clear の低レベル store（Supabase 実装 or fake）。
export interface EvaluationLockStore {
  // UPDATE ... SET evaluation_locked_until=lockUntil WHERE id=? AND (locked IS NULL OR locked<now) RETURNING id
  tryClaim(interviewId: string, lockUntilIso: string, nowIso: string): Promise<LockClaimOutcome>
  clear(interviewId: string): Promise<void>
}

export function createEvaluationLock(store: EvaluationLockStore, opts?: { ttlMs?: number; now?: () => number }): EvaluationLock {
  const ttlMs = opts?.ttlMs ?? EVALUATION_LOCK_TTL_MS
  const now = opts?.now ?? (() => Date.now())
  return {
    async acquire(interviewId: string): Promise<LockClaimOutcome> {
      const t = now()
      return store.tryClaim(interviewId, new Date(t + ttlMs).toISOString(), new Date(t).toISOString())
    },
    async release(interviewId: string): Promise<void> {
      await store.clear(interviewId)
    },
  }
}

// ── Supabase store（thenable な PostgREST builder を注入。fake も同形で満たす）──────────────────
export interface PgLikeBuilder {
  update(row: Record<string, unknown>): PgLikeBuilder
  eq(col: string, val: string): PgLikeBuilder
  or(filter: string): PgLikeBuilder
  select(cols: string): PgLikeBuilder
  then<TResult>(onfulfilled: (value: { data: unknown; error: unknown }) => TResult): Promise<TResult>
}
export interface PgLikeClient {
  from(table: string): PgLikeBuilder
}

const TABLE = 'interviews'

// data が 1 行 = 取得 / 0 行 = 競合 / error = 障害（fail-closed 側で扱う）。
function interpretClaim(data: unknown, error: unknown): LockClaimOutcome {
  if (error) return 'error'
  if (Array.isArray(data) && data.length > 0) return 'acquired'
  return 'contended'
}

export function createSupabaseEvaluationLockStore(client: PgLikeClient): EvaluationLockStore {
  return {
    async tryClaim(interviewId, lockUntilIso, nowIso): Promise<LockClaimOutcome> {
      const { data, error } = await client
        .from(TABLE)
        .update({ evaluation_locked_until: lockUntilIso })
        .eq('id', interviewId)
        .or(`evaluation_locked_until.is.null,evaluation_locked_until.lt.${nowIso}`)
        .select('id')
      return interpretClaim(data, error)
    },
    async clear(interviewId): Promise<void> {
      // 解放失敗は TTL で自然回復するため throw しない（元の評価結果を壊さない）。
      try {
        await client.from(TABLE).update({ evaluation_locked_until: null }).eq('id', interviewId).select('id')
      } catch {
        /* noop */
      }
    },
  }
}

// ── fake（実 DB なし）: 有効期限付き in-memory ロック ─────────────────────────────────────────
export class InMemoryEvaluationLockStore implements EvaluationLockStore {
  private held = new Map<string, number>() // interviewId → lockUntil(ms)
  async tryClaim(interviewId: string, lockUntilIso: string, nowIso: string): Promise<LockClaimOutcome> {
    const now = Date.parse(nowIso)
    const cur = this.held.get(interviewId)
    if (cur !== undefined && cur >= now) return 'contended' // 有効なロックが存在
    this.held.set(interviewId, Date.parse(lockUntilIso)) // 期限切れ or 未取得 → 取得（上書き）
    return 'acquired'
  }
  async clear(interviewId: string): Promise<void> {
    this.held.delete(interviewId)
  }
}

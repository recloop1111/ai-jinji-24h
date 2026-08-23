// PR-19I: 評価の「リクエスト跨ぎ cooldown」（temporary provider 失敗後の連打による OpenAI 課金/retry storm を抑制）。
//
// 責務の分離（重要・事故防止）:
//   - 並行ロック（evaluation_locked_until / lock.ts）= 「同時実行の 1 系列化」。finally で必ず release される短命ロック。
//   - cooldown（本ファイル）= 「temporary 失敗後の短時間の再試行抑制」。release されない・TTL で自然失効する別概念。
//   両者を同じ列で兼ねると、lock release が cooldown を消す等の事故になるため、別列（evaluation_retry_after /
//   evaluation_cooldown_hash）で表現する。
//
// scope: interviewId + transcriptHash。古い transcript の失敗が、別 transcript（別 hash）の評価を止めない。
// multi-instance(Vercel serverless): in-memory ではインスタンス跨ぎで効かないため DB backed（interviews 行に保存）。
// PII: transcriptHash は本文由来だが hash（非可逆・非 PII）。本文/prompt/raw provider error は保存しない。

// cooldown TTL。根拠: OpenAI の temporary 失敗（429 / 5xx / timeout / network）は多くが数十秒で解消する。
//   60 秒あれば「障害中の連打」を抑えつつ、正当な再試行は 1 分後に可能（長時間ロックアウトしない・手動解除不要）。
export const EVALUATION_COOLDOWN_MS = 60_000

// interviews 行に保存された cooldown 状態（service-role のみ読み書き）。
export interface EvaluationCooldownRow {
  retryAfterIso: string | null
  cooldownHash: string | null
}

// 低レベル DB store（Supabase 実装 or fake）。読み書きのみ・判定ロジックは持たない。
export interface EvaluationCooldownDbStore {
  read(interviewId: string): Promise<EvaluationCooldownRow | null>
  write(interviewId: string, retryAfterIso: string | null, cooldownHash: string | null): Promise<void>
}

// orchestration が使う高レベル cooldown。
export interface EvaluationCooldown {
  // active=true のときは Provider を呼ばない（retryAfterMs = 残り時間）。
  check(interviewId: string, transcriptHash: string): Promise<{ active: boolean; retryAfterMs: number }>
  // temporary 最終失敗時のみ呼ぶ（now+TTL を retry_after に設定・現 hash を cooldown_hash に記録）。
  markTemporaryFailure(interviewId: string, transcriptHash: string): Promise<void>
  // 成功/insufficient 時に呼ぶ（stale cooldown を消す）。
  clear(interviewId: string): Promise<void>
}

// ── 純判定（テスト容易・DB 非依存）─────────────────────────────────────────────────────────────
//   active 条件: retry_after が未来 かつ cooldown_hash が現 hash と一致（別 transcript は対象外）。
export function computeCooldownActive(
  row: EvaluationCooldownRow | null,
  currentHash: string,
  nowMs: number,
): { active: boolean; retryAfterMs: number } {
  if (!row || !row.retryAfterIso || row.cooldownHash !== currentHash) return { active: false, retryAfterMs: 0 }
  const retryAtMs = Date.parse(row.retryAfterIso)
  if (!Number.isFinite(retryAtMs) || retryAtMs <= nowMs) return { active: false, retryAfterMs: 0 }
  return { active: true, retryAfterMs: retryAtMs - nowMs }
}

export function createEvaluationCooldown(
  store: EvaluationCooldownDbStore,
  opts?: { ttlMs?: number; now?: () => number },
): EvaluationCooldown {
  const ttlMs = opts?.ttlMs ?? EVALUATION_COOLDOWN_MS
  const now = opts?.now ?? (() => Date.now())
  return {
    async check(interviewId, transcriptHash) {
      const row = await store.read(interviewId)
      return computeCooldownActive(row, transcriptHash, now())
    },
    async markTemporaryFailure(interviewId, transcriptHash) {
      const retryAfterIso = new Date(now() + ttlMs).toISOString()
      await store.write(interviewId, retryAfterIso, transcriptHash)
    },
    async clear(interviewId) {
      await store.write(interviewId, null, null)
    },
  }
}

// ── Supabase 低レベル store（PostgREST の literal update/select で表現可能＝RPC 不要）──────────────
export interface CooldownDbResult {
  data: unknown
  error: unknown
}
export interface CooldownDbQuery {
  select(cols: string): CooldownDbQuery
  update(row: Record<string, unknown>): CooldownDbQuery
  eq(col: string, val: string): CooldownDbQuery
  maybeSingle(): Promise<CooldownDbResult>
}
export interface CooldownDbClient {
  from(table: string): CooldownDbQuery
}

const TABLE = 'interviews'

export function createSupabaseEvaluationCooldownStore(client: CooldownDbClient): EvaluationCooldownDbStore {
  return {
    async read(interviewId): Promise<EvaluationCooldownRow | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('evaluation_retry_after, evaluation_cooldown_hash')
        .eq('id', interviewId)
        .maybeSingle()
      if (error || !data || typeof data !== 'object') return null
      const r = data as Record<string, unknown>
      return {
        retryAfterIso: typeof r.evaluation_retry_after === 'string' ? r.evaluation_retry_after : null,
        cooldownHash: typeof r.evaluation_cooldown_hash === 'string' ? r.evaluation_cooldown_hash : null,
      }
    },
    async write(interviewId, retryAfterIso, cooldownHash): Promise<void> {
      // literal 代入（arithmetic なし）→ PostgREST で表現可能。失敗は上位で best-effort に握る。
      await client
        .from(TABLE)
        .update({ evaluation_retry_after: retryAfterIso, evaluation_cooldown_hash: cooldownHash })
        .eq('id', interviewId)
        .select('id')
        .maybeSingle()
    },
  }
}

// ── fake（実 DB なし・テスト用）──────────────────────────────────────────────────────────────
export class InMemoryEvaluationCooldownStore implements EvaluationCooldownDbStore {
  private rows = new Map<string, EvaluationCooldownRow>()
  async read(interviewId: string): Promise<EvaluationCooldownRow | null> {
    return this.rows.get(interviewId) ?? null
  }
  async write(interviewId: string, retryAfterIso: string | null, cooldownHash: string | null): Promise<void> {
    this.rows.set(interviewId, { retryAfterIso, cooldownHash })
  }
}

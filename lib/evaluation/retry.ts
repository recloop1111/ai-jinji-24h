// PR-4E-2: retry policy（純ロジック・sleep 注入）。retryable 失敗のみ小さく再試行。無限 retry しない。
// 実時間 sleep でテストしない（sleep を注入）。PR-4E-1 の failure 分類（retryable=429/5xx/timeout/network）を
// service 経由の failureReason（provider_temporary=retryable / provider_permanent=non-retryable）で判定する。

export interface RetryPolicy {
  maxAttempts: number // initial を含む総試行回数
  baseDelayMs: number
}

// initial + 最大2回 retry = 総3回。
export const DEFAULT_EVALUATION_RETRY_POLICY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 500 }

// 指数バックオフ（決定的・jitter なし＝テスト安定）。500 → 1000 → 2000…
export function computeBackoffMs(attemptIndex: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** attemptIndex
}

// fn を最大 maxAttempts 回試行。isRetryable(result) が true かつ残り回数があれば sleep して再試行。
export async function runWithRetry<T>(
  fn: () => Promise<T>,
  opts: { isRetryable: (result: T) => boolean; policy: RetryPolicy; sleep: (ms: number) => Promise<void> },
): Promise<T> {
  const { isRetryable, policy, sleep } = opts
  const attempts = Math.max(1, policy.maxAttempts)
  let last: T = await fn()
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (!isRetryable(last)) return last
    await sleep(computeBackoffMs(attempt - 1, policy.baseDelayMs))
    last = await fn()
  }
  return last
}

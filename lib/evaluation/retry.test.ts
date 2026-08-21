import { describe, it, expect, vi } from 'vitest'
import { runWithRetry, computeBackoffMs, DEFAULT_EVALUATION_RETRY_POLICY } from './retry'

describe('computeBackoffMs (決定的・指数)', () => {
  it('500 → 1000 → 2000', () => {
    expect(computeBackoffMs(0, 500)).toBe(500)
    expect(computeBackoffMs(1, 500)).toBe(1000)
    expect(computeBackoffMs(2, 500)).toBe(2000)
  })
})

describe('runWithRetry (sleep 注入・実時間 sleep しない)', () => {
  const policy = { maxAttempts: 3, baseDelayMs: 500 }

  it('retryable が続けば maxAttempts 回試行し sleep は attempts-1 回', async () => {
    const fn = vi.fn(async () => ({ status: 'failed' as const }))
    const sleep = vi.fn(async () => {})
    const r = await runWithRetry(fn, { isRetryable: (x) => x.status === 'failed', policy, sleep })
    expect(r).toEqual({ status: 'failed' })
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('途中で成功したら以降 retry しない', async () => {
    let n = 0
    const fn = vi.fn(async () => (++n < 2 ? { status: 'failed' as const } : { status: 'ok' as const }))
    const sleep = vi.fn(async () => {})
    const r = await runWithRetry(fn, { isRetryable: (x) => x.status === 'failed', policy, sleep })
    expect(r).toEqual({ status: 'ok' })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('非 retryable は即返す（sleep しない）', async () => {
    const fn = vi.fn(async () => ({ status: 'permanent' as const }))
    const sleep = vi.fn(async () => {})
    await runWithRetry(fn, { isRetryable: () => false, policy, sleep })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('default policy = initial + 最大2回（総3回）', () => {
    expect(DEFAULT_EVALUATION_RETRY_POLICY.maxAttempts).toBe(3)
  })
})

import { describe, it, expect } from 'vitest'
import {
  computeCooldownActive,
  createEvaluationCooldown,
  createSupabaseEvaluationCooldownStore,
  InMemoryEvaluationCooldownStore,
  EVALUATION_COOLDOWN_MS,
  type CooldownDbClient,
} from './cooldown'

// PR-19I: cooldown（fake/injected clock のみ・実 DB / 実時間 sleep 非依存）。
const T0 = Date.parse('2026-01-01T00:00:00.000Z')

describe('computeCooldownActive (純判定)', () => {
  it('未来 retry_after かつ hash 一致 → active', () => {
    const r = computeCooldownActive({ retryAfterIso: new Date(T0 + 30_000).toISOString(), cooldownHash: 'h1' }, 'h1', T0)
    expect(r).toEqual({ active: true, retryAfterMs: 30_000 })
  })
  it('hash 不一致（別 transcript）→ inactive（古い失敗が新 transcript を止めない）', () => {
    const r = computeCooldownActive({ retryAfterIso: new Date(T0 + 30_000).toISOString(), cooldownHash: 'h1' }, 'h2', T0)
    expect(r.active).toBe(false)
  })
  it('期限切れ → inactive', () => {
    const r = computeCooldownActive({ retryAfterIso: new Date(T0 - 1).toISOString(), cooldownHash: 'h1' }, 'h1', T0)
    expect(r.active).toBe(false)
  })
  it('null / 未設定 → inactive', () => {
    expect(computeCooldownActive(null, 'h1', T0).active).toBe(false)
    expect(computeCooldownActive({ retryAfterIso: null, cooldownHash: null }, 'h1', T0).active).toBe(false)
    expect(computeCooldownActive({ retryAfterIso: 'not-a-date', cooldownHash: 'h1' }, 'h1', T0).active).toBe(false)
  })
})

describe('createEvaluationCooldown (InMemory store + injected clock)', () => {
  const make = (nowRef: { t: number }) => createEvaluationCooldown(new InMemoryEvaluationCooldownStore(), { now: () => nowRef.t })

  it('markTemporaryFailure → 直後 check active（retryAfterMs≈TTL）', async () => {
    const now = { t: T0 }
    const cd = make(now)
    await cd.markTemporaryFailure('iv-1', 'h1')
    const r = await cd.check('iv-1', 'h1')
    expect(r.active).toBe(true)
    expect(r.retryAfterMs).toBe(EVALUATION_COOLDOWN_MS)
  })

  it('TTL 経過後 → inactive（手動解除不要・自然失効）', async () => {
    const now = { t: T0 }
    const cd = make(now)
    await cd.markTemporaryFailure('iv-1', 'h1')
    now.t = T0 + EVALUATION_COOLDOWN_MS + 1
    expect((await cd.check('iv-1', 'h1')).active).toBe(false)
  })

  it('別 hash は cooldown 対象外', async () => {
    const now = { t: T0 }
    const cd = make(now)
    await cd.markTemporaryFailure('iv-1', 'h1')
    expect((await cd.check('iv-1', 'h2')).active).toBe(false)
  })

  it('clear → inactive', async () => {
    const now = { t: T0 }
    const cd = make(now)
    await cd.markTemporaryFailure('iv-1', 'h1')
    await cd.clear('iv-1')
    expect((await cd.check('iv-1', 'h1')).active).toBe(false)
  })
})

describe('createSupabaseEvaluationCooldownStore (fake PostgREST client)', () => {
  it('read: interviews から retry_after / cooldown_hash をマップ', async () => {
    const client: CooldownDbClient = {
      from() {
        const q = {
          select: () => q,
          update: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: { evaluation_retry_after: new Date(T0).toISOString(), evaluation_cooldown_hash: 'h1' }, error: null }),
        }
        return q
      },
    }
    const store = createSupabaseEvaluationCooldownStore(client)
    expect(await store.read('iv-1')).toEqual({ retryAfterIso: new Date(T0).toISOString(), cooldownHash: 'h1' })
  })

  it('write: literal update（retry_after / cooldown_hash）を発行・null clear も可', async () => {
    let sent: Record<string, unknown> | null = null
    const client: CooldownDbClient = {
      from() {
        const q = {
          select: () => q,
          update: (row: Record<string, unknown>) => {
            sent = row
            return q
          },
          eq: () => q,
          maybeSingle: async () => ({ data: { id: 'iv-1' }, error: null }),
        }
        return q
      },
    }
    const store = createSupabaseEvaluationCooldownStore(client)
    await store.write('iv-1', new Date(T0).toISOString(), 'h1')
    expect(sent).toEqual({ evaluation_retry_after: new Date(T0).toISOString(), evaluation_cooldown_hash: 'h1' })
    await store.write('iv-1', null, null)
    expect(sent).toEqual({ evaluation_retry_after: null, evaluation_cooldown_hash: null })
  })

  it('read error → null（crash しない）', async () => {
    const client: CooldownDbClient = {
      from() {
        const q = { select: () => q, update: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { code: 'x' } }) }
        return q
      },
    }
    expect(await createSupabaseEvaluationCooldownStore(client).read('iv-1')).toBeNull()
  })
})

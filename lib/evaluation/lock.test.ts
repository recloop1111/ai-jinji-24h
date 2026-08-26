import { describe, it, expect, vi } from 'vitest'
import {
  createEvaluationLock,
  InMemoryEvaluationLockStore,
  createSupabaseEvaluationLockStore,
  type PgLikeClient,
} from './lock'

describe('createEvaluationLock + InMemoryEvaluationLockStore', () => {
  it('acquire → 2回目は contended、release 後は再取得可', async () => {
    const lock = createEvaluationLock(new InMemoryEvaluationLockStore(), { ttlMs: 60_000, now: () => 1000 })
    expect(await lock.acquire('iv-1')).toBe('acquired')
    expect(await lock.acquire('iv-1')).toBe('contended') // 有効なロック中
    await lock.release('iv-1')
    expect(await lock.acquire('iv-1')).toBe('acquired')
  })

  it('TTL 期限切れ後は再取得可（crash 時の自然回復）', async () => {
    let t = 1000
    const lock = createEvaluationLock(new InMemoryEvaluationLockStore(), { ttlMs: 100, now: () => t })
    expect(await lock.acquire('iv-1')).toBe('acquired') // lockUntil = 1100
    t = 1050
    expect(await lock.acquire('iv-1')).toBe('contended') // まだ有効
    t = 1200
    expect(await lock.acquire('iv-1')).toBe('acquired') // 期限切れ→再取得
  })

  it('別 interview は独立', async () => {
    const lock = createEvaluationLock(new InMemoryEvaluationLockStore(), { ttlMs: 60_000, now: () => 1000 })
    expect(await lock.acquire('iv-A')).toBe('acquired')
    expect(await lock.acquire('iv-B')).toBe('acquired')
  })
})

// thenable な PostgREST builder を fake（claim: locked_until が ISO=claim / null=release）。
function fakeLockClient(claimResult: () => { data: unknown; error: unknown }): { client: PgLikeClient; fromSpy: ReturnType<typeof vi.fn> } {
  const fromSpy = vi.fn(() => {
    let row: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.update = (r: Record<string, unknown>) => {
      row = r
      return b
    }
    b.eq = () => b
    b.or = () => b
    b.select = () => b
    b.then = (onF: (v: { data: unknown; error: unknown }) => unknown) => {
      const isClaim = typeof row.evaluation_locked_until === 'string'
      return Promise.resolve(isClaim ? claimResult() : { data: [{ id: 'iv-1' }], error: null }).then(onF)
    }
    return b as unknown as ReturnType<PgLikeClient['from']>
  })
  return { client: { from: fromSpy } as unknown as PgLikeClient, fromSpy }
}

describe('createSupabaseEvaluationLockStore (fake thenable client)', () => {
  it('1行返る → acquired', async () => {
    const store = createSupabaseEvaluationLockStore(fakeLockClient(() => ({ data: [{ id: 'iv-1' }], error: null })).client)
    expect(await store.tryClaim('iv-1', new Date().toISOString(), new Date().toISOString())).toBe('acquired')
  })
  it('0行 → contended', async () => {
    const store = createSupabaseEvaluationLockStore(fakeLockClient(() => ({ data: [], error: null })).client)
    expect(await store.tryClaim('iv-1', new Date().toISOString(), new Date().toISOString())).toBe('contended')
  })
  it('error → error（fail-closed 側で扱う）', async () => {
    const store = createSupabaseEvaluationLockStore(fakeLockClient(() => ({ data: null, error: { message: 'x' } })).client)
    expect(await store.tryClaim('iv-1', new Date().toISOString(), new Date().toISOString())).toBe('error')
  })
  it('clear は throw しない（解放失敗は TTL 回復）', async () => {
    const store = createSupabaseEvaluationLockStore(fakeLockClient(() => ({ data: [], error: null })).client)
    await expect(store.clear('iv-1')).resolves.toBeUndefined()
  })
})

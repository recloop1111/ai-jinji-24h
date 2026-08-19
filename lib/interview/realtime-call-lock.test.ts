import { describe, it, expect } from 'vitest'
import { interpretLockClaim, REALTIME_CALL_LOCK_TTL_MS } from './realtime-call-lock'

// P1-2（Codex）: realtime-call 多重呼び出し防止ロックの「クレーム結果解釈」。
// error → failopen（列未適用/一時障害でも面接を止めない）、1行 → acquired、0行 → contended（409）。
describe('interpretLockClaim', () => {
  it('error あり → failopen（列未適用/一時障害でも阻害しない・段階ロールアウト）', () => {
    expect(interpretLockClaim(null, { code: '42703', message: 'column does not exist' })).toBe('failopen')
    // rows があっても error 優先で failopen（続行）
    expect(interpretLockClaim([{ id: 'i1' }], new Error('boom'))).toBe('failopen')
  })

  it('error なし & 1行以上 → acquired（ロック取得・続行）', () => {
    expect(interpretLockClaim([{ id: 'i1' }], null)).toBe('acquired')
  })

  it('error なし & 0行 → contended（別セッション保持中 → 409）', () => {
    expect(interpretLockClaim([], null)).toBe('contended')
  })

  it('error なし & rows が null/undefined → contended（安全側に弾く）', () => {
    expect(interpretLockClaim(null, null)).toBe('contended')
    expect(interpretLockClaim(undefined, null)).toBe('contended')
  })

  it('TTL は正の有限値（自動失効で永久禁止にしない）', () => {
    expect(REALTIME_CALL_LOCK_TTL_MS).toBeGreaterThan(0)
    expect(Number.isFinite(REALTIME_CALL_LOCK_TTL_MS)).toBe(true)
  })
})

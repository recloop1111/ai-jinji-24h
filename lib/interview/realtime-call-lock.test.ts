import { describe, it, expect } from 'vitest'
import { interpretLockClaim, REALTIME_CALL_LOCK_TTL_MS } from './realtime-call-lock'
import { MAX_INTERVIEW_SECONDS } from '@/lib/config/interview-policy'

// P1-2 / 追加P1（Codex）: realtime-call 多重呼び出し防止ロックの「クレーム結果解釈」（fail-closed）。
// error → 'error'（拒否・取得未確定で有料呼び出しへ進めない）、1行 → acquired、0行 → contended（409）。
describe('interpretLockClaim', () => {
  it('error あり → error（fail-closed。取得未確定なので拒否する）', () => {
    expect(interpretLockClaim(null, { code: '08006', message: 'connection failure' })).toBe('error')
    // rows があっても error 優先で 'error'（拒否）
    expect(interpretLockClaim([{ id: 'i1' }], new Error('boom'))).toBe('error')
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

  it('TTL は面接最大長（セッション寿命）をまたいで保持する（追撃P1-2）', () => {
    // 短TTLだと失効後に2本目の並行セッションを張れてしまうため、最大面接長以上であること。
    expect(REALTIME_CALL_LOCK_TTL_MS).toBeGreaterThanOrEqual(MAX_INTERVIEW_SECONDS * 1000)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { assertSupabaseSafeForDev, isLocalSupabaseUrl } from './env-guard'

const PROD = 'https://example-remote-project.supabase.co' // 汎用の remote 例（実 Production project ref は使わない）
const LOCAL = 'http://127.0.0.1:54421'

afterEach(() => vi.unstubAllEnvs())

describe('isLocalSupabaseUrl', () => {
  it('127.0.0.1 / localhost / 0.0.0.0 → true', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:54421')).toBe(true)
    expect(isLocalSupabaseUrl('http://localhost:3000')).toBe(true)
    expect(isLocalSupabaseUrl('http://0.0.0.0:54421')).toBe(true)
    expect(isLocalSupabaseUrl('http://127.0.0.1:54322')).toBe(true) // 別 local project も local 扱い（prod ではない）
  })
  it('remote / 空 / undefined → false', () => {
    expect(isLocalSupabaseUrl(PROD)).toBe(false)
    expect(isLocalSupabaseUrl('https://example.supabase.co')).toBe(false)
    expect(isLocalSupabaseUrl('')).toBe(false)
    expect(isLocalSupabaseUrl(undefined)).toBe(false)
    expect(isLocalSupabaseUrl('http://127.0.0.1.evil.com')).toBe(false) // spoof 防止（host は 127.0.0.1 で終端）
  })
})

describe('assertSupabaseSafeForDev', () => {
  it('development + remote(prod) URL + escape なし → throw（本番誤接続を拒否）', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ALLOW_REMOTE_SUPABASE_IN_DEV', '')
    expect(() => assertSupabaseSafeForDev(PROD)).toThrow(/env guard/)
  })
  it('development + local URL → 通過', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => assertSupabaseSafeForDev(LOCAL)).not.toThrow()
  })
  it('development + missing URL → throw（未設定は non-local 扱い＝安全側）', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => assertSupabaseSafeForDev(undefined)).toThrow(/env guard/)
  })
  it('development + remote + ALLOW_REMOTE_SUPABASE_IN_DEV=true → 通過（明示 opt-in）', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ALLOW_REMOTE_SUPABASE_IN_DEV', 'true')
    expect(() => assertSupabaseSafeForDev(PROD)).not.toThrow()
  })
  it('production build（NODE_ENV=production）+ remote → 通過（Preview/本番を壊さない）', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => assertSupabaseSafeForDev(PROD)).not.toThrow()
  })
  it('test（NODE_ENV=test）+ remote → 通過（CI/vitest を壊さない）', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(() => assertSupabaseSafeForDev(PROD)).not.toThrow()
  })
  it('error message に URL 値（project ref）を含めない', () => {
    vi.stubEnv('NODE_ENV', 'development')
    try {
      assertSupabaseSafeForDev(PROD)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as Error).message).not.toContain('example-remote-project') // URL 値を message に含めない
    }
  })
})

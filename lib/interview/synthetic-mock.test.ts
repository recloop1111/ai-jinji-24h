import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canUseSyntheticMock, resolveConnectFailureMode } from './synthetic-mock'

const SESSION = readFileSync(join(process.cwd(), 'app/interview/[slug]/session/page.tsx'), 'utf8')
const ELIG = readFileSync(join(process.cwd(), 'lib/billing/interview-eligibility.ts'), 'utf8')

describe('canUseSyntheticMock（mock は DB is_demo=true のみ）', () => {
  it('1. isDemo=true → mock 許可', () => {
    expect(canUseSyntheticMock({ isDemo: true })).toBe(true)
  })
  it('2. isDemo=false → mock 禁止', () => {
    expect(canUseSyntheticMock({ isDemo: false })).toBe(false)
  })
  it('3. isDemo=null/undefined（未確定）→ mock 禁止', () => {
    expect(canUseSyntheticMock({ isDemo: null })).toBe(false)
    expect(canUseSyntheticMock({ isDemo: undefined })).toBe(false)
  })
  it('resolveConnectFailureMode: demo→mock / それ以外→blocking', () => {
    expect(resolveConnectFailureMode({ isDemo: true })).toBe('mock')
    expect(resolveConnectFailureMode({ isDemo: false })).toBe('blocking')
    expect(resolveConnectFailureMode({ isDemo: null })).toBe('blocking')
  })
})

describe('session/page.tsx: 非demo は mock へ落とさない（Codex #1）', () => {
  it('4/5/6/7. Realtime 接続失敗の mock は canUseSyntheticMock でガード（非demo は connectBlocked）', () => {
    // 全ての setMode('mock') が canUseSyntheticMock ガード内にある（無条件 fallback なし）。
    const mockCalls = SESSION.match(/setMode\('mock'\)/g) ?? []
    expect(mockCalls.length).toBeGreaterThanOrEqual(1)
    for (const m of SESSION.matchAll(/canUseSyntheticMock\(\{ isDemo: isDemoRef\.current \}\)\)\s*\{\s*setMode\('mock'\)\s*\}\s*else\s*\{\s*setConnectBlocked\(true\)/g)) {
      expect(m).toBeTruthy()
    }
    // ガードされた mock ブロックが 2 箇所（接続失敗 / 初回応答timeout）
    const guarded = SESSION.match(/canUseSyntheticMock\(\{ isDemo: isDemoRef\.current \}\)/g) ?? []
    expect(guarded.length).toBeGreaterThanOrEqual(2)
    // 非demo は connectBlocked（blocking）へ
    expect(SESSION).toContain('setConnectBlocked(true)')
  })
  it('8. 初回応答 timeout も mock 無条件ではなく demo ガード', () => {
    expect(SESSION).toMatch(/!aiRespondedRef\.current[\s\S]{0,320}canUseSyntheticMock/)
  })
  it('旧「10秒で必ず mock へ落とす安全網」は撤去', () => {
    expect(SESSION).not.toMatch(/if \(!realtimeAttemptedRef\.current\) \{[\s\S]{0,60}setMode\('mock'\)/)
  })
})

describe('session/page.tsx: media 失敗は mock/completed へ進めず blocking+retry（Codex #2）', () => {
  it('10/11. getUserMedia 失敗は setMediaBlocked（mock ではない・mediaFailed は撤去）', () => {
    expect(SESSION).not.toContain('mediaFailed')
    expect(SESSION).toContain('setMediaBlocked(true)')
  })
  it('media 未取得（!hasStream）では接続も mock も開始しない', () => {
    expect(SESSION).toMatch(/if \(!hasStream\) return[\s\S]{0,120}realtimeAttemptedRef\.current = true/)
  })
  it('mediaBlocked blocking UI＋再試行（media 再取得）', () => {
    expect(SESSION).toContain('カメラ・マイクを使用できません')
    expect(SESSION).toContain('setMediaRetryNonce')
  })
  it('9. connectBlocked blocking UI＋再試行（再接続）', () => {
    expect(SESSION).toContain('AI面接に接続できませんでした')
    expect(SESSION).toMatch(/setConnectBlocked\(false\)[\s\S]{0,80}setMode\('connecting'\)/)
  })
  it('12/13. media/接続 blocking 中はタイマーを動かさない（時間切れ→completed→課金を作らない）', () => {
    expect(SESSION).toContain('if (!hasStream || mediaBlocked || connectBlocked) return')
  })
  it('media 未取得のまま離脱は disconnected（technical・非課金）', () => {
    expect(SESSION).toContain("mediaAcquiredRef.current ? '自主終了' : 'disconnected'")
  })
})

describe('15/16/17. billing helper は変更しない（completed/time_limit → true 維持）', () => {
  it('computeIsBillable の completed/time_limit → true が不変（mode/mock 分岐を入れない）', () => {
    expect(ELIG).toContain("input.category === 'completed' || input.category === 'time_limit'")
    expect(ELIG).not.toContain('mock')
    expect(ELIG).not.toContain('isDemo')
  })
})

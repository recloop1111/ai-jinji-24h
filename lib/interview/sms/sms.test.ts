import { describe, it, expect } from 'vitest'
import { normalizePhoneJP, maskPhoneJP, toE164JP } from './phone'
import {
  initOtpState,
  hashOtp,
  evaluateSendRequest,
  evaluateVerify,
  InMemoryOtpStore,
  type OtpState,
} from './otp'
import {
  DeterministicMockSmsProvider,
  resolveSmsAuthChannel,
  resolveSmsProvider,
  mapProviderError,
} from './provider'
import { isSmsProviderEnabled, OTP_MAX_VERIFY_ATTEMPTS, OTP_MAX_RESENDS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from '@/lib/config/sms'
import { isFixedSmsCodeAllowed } from '@/lib/interview/sms-demo-policy'

// PR-P8 Part A: 通常企業 SMS provider 非依存基盤（実 SMS 送信 0・OpenAI 0）。

const IV = 'iv-sms-1'
// 送信して pending 状態にした OtpState を作る（code は '123456'）。
function sent(nowMs = 1000, code = '123456'): OtpState {
  const s = initOtpState(IV)
  return evaluateSendRequest(s, { nowMs, codeHash: hashOtp(IV, code) }).state
}

describe('Task A10 #1-5: phone normalization / mask', () => {
  it('#1 JP mobile 09012345678 → +819012345678', () => {
    const r = normalizePhoneJP('09012345678')
    expect(r.ok && r.e164).toBe('+819012345678')
    expect(r.ok && r.national).toBe('09012345678')
  })
  it('#2 ハイフン付き 090-1234-5678 → 正規化', () => {
    expect(toE164JP('090-1234-5678')).toBe('+819012345678')
  })
  it('#3 +81 入力 +819012345678 / 全角 → 正規化', () => {
    expect(toE164JP('+819012345678')).toBe('+819012345678')
    expect(toE164JP('＋８１９０１２３４５６７８')).toBe('+819012345678')
    expect(toE164JP('０９０１２３４５６７８')).toBe('+819012345678')
  })
  it('#4 invalid phone は reject（固定電話/桁不足/文字混入/海外）', () => {
    expect(normalizePhoneJP('05012345678')).toEqual({ ok: false, reason: 'not_jp_mobile' }) // IP電話（11桁・非携帯）
    expect(normalizePhoneJP('0312345678').ok).toBe(false) // 固定電話（10桁）
    expect(normalizePhoneJP('0901234')).toEqual({ ok: false, reason: 'too_short' })
    expect(normalizePhoneJP('090123456789')).toEqual({ ok: false, reason: 'too_long' })
    expect(normalizePhoneJP('090-abcd-5678').ok).toBe(false)
    expect(normalizePhoneJP('').ok).toBe(false)
    expect(normalizePhoneJP('+12025550100')).toEqual({ ok: false, reason: 'not_jp_mobile' }) // 海外
  })
  it('#5 mask は 090-****-5678（不正入力は ***・PII を晒さない）', () => {
    expect(maskPhoneJP('09012345678')).toBe('090-****-5678')
    expect(maskPhoneJP('invalid')).toBe('***')
  })
})

describe('Task A10 #6-14: OTP lifecycle', () => {
  it('#6 normal send → allow_send / status pending / expiresAt 設定', () => {
    const r = evaluateSendRequest(initOtpState(IV), { nowMs: 1000, codeHash: hashOtp(IV, '123456') })
    expect(r.decision).toBe('allow_send')
    expect(r.state.status).toBe('pending')
    expect(r.state.expiresAtMs).toBe(1000 + OTP_TTL_MS)
  })
  it('#7 normal verify（正しいコード）→ verified・コード無効化', () => {
    const s = sent(1000, '123456')
    const r = evaluateVerify(s, { nowMs: 2000, codeHash: hashOtp(IV, '123456') })
    expect(r.decision).toBe('verified')
    expect(r.state.status).toBe('verified')
    expect(r.state.codeHash).toBeNull() // 再利用不可
  })
  it('#8 wrong OTP → invalid_code・attempts++', () => {
    const s = sent(1000, '123456')
    const r = evaluateVerify(s, { nowMs: 2000, codeHash: hashOtp(IV, '000000') })
    expect(r.decision).toBe('invalid_code')
    expect(r.state.verifyAttempts).toBe(1)
  })
  it('#9 expired OTP → expired（期限切れコード再利用不可）', () => {
    const s = sent(1000, '123456')
    const r = evaluateVerify(s, { nowMs: 1000 + OTP_TTL_MS + 1, codeHash: hashOtp(IV, '123456') })
    expect(r.decision).toBe('expired')
  })
  it('#10 retry limit 到達 → locked', () => {
    let s = sent(1000, '123456')
    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
      s = evaluateVerify(s, { nowMs: 2000, codeHash: hashOtp(IV, 'wrong') }).state
    }
    expect(s.status).toBe('locked')
    expect(evaluateVerify(s, { nowMs: 2000, codeHash: hashOtp(IV, '123456') }).decision).toBe('locked')
  })
  it('#11 resend cooldown 中は cooldown（新コード発行しない）', () => {
    const s = sent(1000, '123456')
    const r = evaluateSendRequest(s, { nowMs: 1000 + OTP_RESEND_COOLDOWN_MS - 1, codeHash: hashOtp(IV, '654321') })
    expect(r.decision).toBe('cooldown')
    expect(r.retryAfterMs).toBeGreaterThan(0)
    expect(r.state.codeHash).toBe(s.codeHash) // 旧コードのまま
  })
  it('#12 resend max 到達 → max_resends', () => {
    let s = sent(1000, '000000')
    let t = 1000
    for (let i = 0; i < OTP_MAX_RESENDS; i++) {
      t += OTP_RESEND_COOLDOWN_MS
      s = evaluateSendRequest(s, { nowMs: t, codeHash: hashOtp(IV, 'c' + i) }).state
    }
    t += OTP_RESEND_COOLDOWN_MS
    expect(evaluateSendRequest(s, { nowMs: t, codeHash: hashOtp(IV, 'x') }).decision).toBe('max_resends')
  })
  it('#13 duplicate send（cooldown 内）→ 冪等（新コードを発行しない）', () => {
    const s = sent(1000, '123456')
    const r = evaluateSendRequest(s, { nowMs: 1005, codeHash: hashOtp(IV, '999999') })
    expect(r.decision).toBe('cooldown')
    expect(r.state.sendCount).toBe(s.sendCount) // 送信回数は増えない
  })
  it('#14 duplicate verify（verified 後）→ already_verified', () => {
    const s = sent(1000, '123456')
    const v = evaluateVerify(s, { nowMs: 2000, codeHash: hashOtp(IV, '123456') }).state
    expect(evaluateVerify(v, { nowMs: 2100, codeHash: hashOtp(IV, '123456') }).decision).toBe('already_verified')
  })
})

describe('Task A10 #15-17: provider domain result mapping（生エラーを露出しない）', () => {
  it('#15 rate limited', async () => {
    const p = new DeterministicMockSmsProvider({ mode: 'rate_limited', bypassProductionGuardForTest: true })
    expect(await p.sendVerificationCode({ e164: '+819012345678' })).toBe('rate_limited')
  })
  it('#16 provider unavailable', async () => {
    const p = new DeterministicMockSmsProvider({ mode: 'provider_unavailable', bypassProductionGuardForTest: true })
    expect(await p.checkVerificationCode({ e164: '+819012345678', code: '1' })).toBe('provider_unavailable')
  })
  it('#17 provider error', async () => {
    const p = new DeterministicMockSmsProvider({ mode: 'provider_failure', bypassProductionGuardForTest: true })
    expect(await p.sendVerificationCode({ e164: '+819012345678' })).toBe('provider_error')
  })
  it('mapProviderError は provider 固有種別を安全な domain へ写像', () => {
    expect(mapProviderError('rate_limited')).toBe('rate_limited')
    expect(mapProviderError('timeout')).toBe('provider_unavailable')
    expect(mapProviderError('unknown')).toBe('provider_error')
  })
})

describe('Task A10 #18-23: demo 完全分離 / spoof 防止', () => {
  it('#18 demo（is_demo=true）→ demo_fixed channel', () => {
    expect(resolveSmsAuthChannel({ id: 'c1', is_demo: true })).toBe('demo_fixed')
  })
  it('#19 demo は provider へ行かない（channel は常に demo_fixed）', () => {
    expect(resolveSmsAuthChannel({ id: 'c1', is_demo: true })).not.toBe('provider')
  })
  it('#20 normal company + 1234 は demo bypass にならない（channel=provider）', () => {
    expect(resolveSmsAuthChannel({ id: 'c2', is_demo: false })).toBe('provider')
    // demo 判定は is_demo のみ。normal は固定コード許可されない。
    expect(isFixedSmsCodeAllowed({ id: 'c2', is_demo: false })).toBe(false)
  })
  it('#21 demo → provider call 0（resolveSmsProvider は demo と無関係に gate 依存）', () => {
    // demo は provider を呼ばない設計。provider 経路は gate OFF で null。
    expect(resolveSmsProvider({} as NodeJS.ProcessEnv)).toBeNull()
  })
  it('#22 client is_demo spoof は無効（SoT は server 解決の company.is_demo のみ）', () => {
    // resolveSmsAuthChannel は server 解決 company だけを見る。normal company は is_demo=false 固定。
    expect(resolveSmsAuthChannel({ id: 'c3', is_demo: false })).toBe('provider')
    // env 明示（SMS_FIXED_CODE_COMPANY_ID）も別 id なら無効。
    expect(resolveSmsAuthChannel({ id: 'c3', is_demo: false }, { SMS_FIXED_CODE_COMPANY_ID: 'other' } as NodeJS.ProcessEnv)).toBe('provider')
  })
  it('#23 cross-company: OTP state は interview 単位で独立（別 interview を汚染しない）', async () => {
    const store = new InMemoryOtpStore()
    await store.save({ ...initOtpState('iv-A'), version: 0 }, 0)
    await store.save({ ...initOtpState('iv-B'), version: 0 }, 0)
    const a = evaluateSendRequest((await store.load('iv-A'))!, { nowMs: 1000, codeHash: hashOtp('iv-A', '111111') }).state
    await store.save(a, 0)
    const b = await store.load('iv-B')
    expect(b!.status).toBe('idle') // iv-A の送信は iv-B に影響しない
  })
})

describe('Task A10 #24 + gate: SMS_PROVIDER_ENABLED default OFF / fail-closed', () => {
  it('#24 gate OFF（未設定）→ resolveSmsProvider は null（provider call 0）', () => {
    expect(isSmsProviderEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(resolveSmsProvider({} as NodeJS.ProcessEnv)).toBeNull()
  })
  it('gate は厳格 === true のみ（"1"/"TRUE" は無効）', () => {
    for (const v of ['1', 'TRUE', 'yes', '', undefined]) {
      expect(isSmsProviderEnabled({ SMS_PROVIDER_ENABLED: v } as NodeJS.ProcessEnv)).toBe(false)
    }
    expect(isSmsProviderEnabled({ SMS_PROVIDER_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true)
  })
  it('gate ON でも実 provider 未実装のため resolveSmsProvider は null（勝手に送信しない）', () => {
    expect(resolveSmsProvider({ SMS_PROVIDER_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBeNull()
  })
})

describe('DeterministicMockSmsProvider: Production 誤用ガード', () => {
  it('test/dev 以外では構築時 throw（bypass 明示時のみ許可）', () => {
    const prevNode = process.env.NODE_ENV
    const prevVitest = process.env.VITEST
    // vitest は NODE_ENV=test。production を模擬（VITEST も外す）。
    try {
      process.env.NODE_ENV = 'production'
      delete process.env.VITEST
      expect(() => new DeterministicMockSmsProvider({ mode: 'send_success' })).toThrow(/test-only/)
      // bypass 明示時のみ許可。
      expect(() => new DeterministicMockSmsProvider({ mode: 'send_success', bypassProductionGuardForTest: true })).not.toThrow()
    } finally {
      process.env.NODE_ENV = prevNode
      if (prevVitest === undefined) delete process.env.VITEST
      else process.env.VITEST = prevVitest
    }
  })
})

// PR-P8: SMS provider 抽象（実 Twilio 等の SDK は入れない）。provider 固有エラーを応募者へ露出しない domain result へ mapping。
//   demo 企業の固定コード（1234）とは完全に別系統（下記 resolveSmsAuthChannel を SoT 化）。
//   実送信は Production で行わない（gate: isSmsProviderEnabled・default OFF）。

import { isSmsProviderEnabled } from '@/lib/config/sms'
import { isFixedSmsCodeAllowed, type FixedCodeCompany } from '@/lib/interview/sms-demo-policy'

// ── domain result（provider 非依存の安全な結果集合）───────────────────────────────────────────
// send/verify 共通のエラー系（provider 固有エラーはすべてこの集合へ写像＝生エラーを露出しない）。
export type SmsErrorResult = 'rate_limited' | 'provider_unavailable' | 'provider_error'
export type SmsSendResult = 'sent' | 'invalid_phone' | SmsErrorResult
export type SmsVerifyResult = 'verified' | 'invalid_code' | 'expired' | SmsErrorResult

// ── provider interface（R 系で実装を差し込む。ここでは interface + mock のみ）───────────────────
export interface SmsProvider {
  sendVerificationCode(input: { e164: string }): Promise<SmsSendResult>
  checkVerificationCode(input: { e164: string; code: string }): Promise<SmsVerifyResult>
}

// provider 固有のエラー識別子 → 安全な domain result（生エラー文言/コードを応募者へ出さない）。
export function mapProviderError(kind: 'unavailable' | 'rate_limited' | 'timeout' | 'unknown'): SmsErrorResult {
  switch (kind) {
    case 'rate_limited':
      return 'rate_limited'
    case 'unavailable':
    case 'timeout':
      return 'provider_unavailable'
    default:
      return 'provider_error'
  }
}

// ── demo 分離（Task A8）: server 解決の company.is_demo だけで channel を決める（client 値は信用しない）──
export type SmsAuthChannel = 'demo_fixed' | 'provider'
export function resolveSmsAuthChannel(company: FixedCodeCompany, env: NodeJS.ProcessEnv = process.env): SmsAuthChannel {
  // is_demo=true（＋ env 明示指定）は固定コード（1234）系。通常企業は provider 系。
  return isFixedSmsCodeAllowed(company, env) ? 'demo_fixed' : 'provider'
}

// ── DeterministicMockSmsProvider（Task A5・local/test 専用・実送信 0）─────────────────────────────
export type MockSmsMode =
  | 'send_success' // 送信成功 + 正しい OTP は verify 成功
  | 'wrong_code' // verify は常に invalid_code
  | 'expired' // verify は常に expired
  | 'rate_limited' // send/verify とも rate_limited
  | 'provider_unavailable' // send/verify とも provider_unavailable
  | 'provider_failure' // send/verify とも provider_error

export interface DeterministicMockSmsConfig {
  mode: MockSmsMode
  // send_success 時に「正しい」とみなす OTP（決定的・test が指定）。
  expectedCode?: string
  bypassProductionGuardForTest?: boolean
}

// Production runtime での誤用防止（evaluation mock と同思想）。gate ON でも実 provider 未実装のため、
// mock を本番から呼べないよう test/dev 以外では構築時 throw。
function assertMockAllowed(bypass?: boolean): void {
  if (bypass) return
  const underTest =
    typeof process !== 'undefined' &&
    (process.env?.VITEST === 'true' || process.env?.NODE_ENV === 'test' || process.env?.NODE_ENV === 'development')
  if (!underTest) throw new Error('DeterministicMockSmsProvider is test-only and must not run in production runtime')
}

export class DeterministicMockSmsProvider implements SmsProvider {
  private readonly config: DeterministicMockSmsConfig
  constructor(config: DeterministicMockSmsConfig) {
    assertMockAllowed(config.bypassProductionGuardForTest)
    this.config = config
  }
  async sendVerificationCode(_input: { e164: string }): Promise<SmsSendResult> {
    void _input
    switch (this.config.mode) {
      case 'rate_limited':
        return 'rate_limited'
      case 'provider_unavailable':
        return 'provider_unavailable'
      case 'provider_failure':
        return 'provider_error'
      default:
        return 'sent' // send_success / wrong_code / expired は送信自体は成功
    }
  }
  async checkVerificationCode(input: { e164: string; code: string }): Promise<SmsVerifyResult> {
    switch (this.config.mode) {
      case 'rate_limited':
        return 'rate_limited'
      case 'provider_unavailable':
        return 'provider_unavailable'
      case 'provider_failure':
        return 'provider_error'
      case 'expired':
        return 'expired'
      case 'wrong_code':
        return 'invalid_code'
      case 'send_success':
      default:
        return this.config.expectedCode && input.code === this.config.expectedCode ? 'verified' : 'invalid_code'
    }
  }
}

// gate を尊重した provider 解決（Task A9）: gate OFF なら provider を返さない（実 SMS に到達しない）。
//   R 系で実 provider factory を差し込む。gate OFF/未実装時は null（呼び出し側は SMS_NOT_AVAILABLE を返す）。
export function resolveSmsProvider(env: NodeJS.ProcessEnv = process.env): SmsProvider | null {
  if (!isSmsProviderEnabled(env)) return null // fail-closed（default OFF）
  // R 系で実 provider を返す。現段階では実装なし＝null（勝手に送信しない）。
  return null
}

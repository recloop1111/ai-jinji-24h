// PR-P8: OTP ライフサイクル（provider 非依存・純ロジック）。実 SMS 送信 0。
//   request(send) → pending → verify → verified / expired / locked / rate_limited の状態契約を固定する。
//   plaintext の OTP / 電話番号は state に保存しない（codeHash / phoneHash のみ）。実永続化は store 越し。
//
// abuse / cost guard（Task A7）: resend cooldown / max resends / 電話・applicant 単位の総送信上限で、
//   provider actual を繋いだ瞬間の連打課金を防ぐ。冪等: cooldown 中の再送は新コードを発行しない。

import { createHash } from 'node:crypto'
import {
  OTP_TTL_MS,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_MAX_RESENDS,
  OTP_MAX_SENDS_PER_PHONE,
} from '@/lib/config/sms'

export type OtpStatus = 'idle' | 'pending' | 'verified' | 'locked'

// serializable（DB jsonb 等へ保存可能）。plaintext OTP/phone は持たない。
export interface OtpState {
  interviewId: string
  codeHash: string | null
  expiresAtMs: number | null
  verifyAttempts: number // 現コードの照合失敗回数
  resendCount: number // 再送回数（初回送信は 0）
  sendCount: number // 総送信回数（abuse guard）
  lastSentAtMs: number | null
  status: OtpStatus
  version: number
}

export function initOtpState(interviewId: string): OtpState {
  return {
    interviewId,
    codeHash: null,
    expiresAtMs: null,
    verifyAttempts: 0,
    resendCount: 0,
    sendCount: 0,
    lastSentAtMs: null,
    status: 'idle',
    version: 0,
  }
}

// OTP の hash（plaintext を保存しないため）。interviewId を salt にして横断再利用を防ぐ。
export function hashOtp(interviewId: string, code: string): string {
  return createHash('sha256').update(`otp:${interviewId}:${code}`).digest('hex')
}

// ── 送信要求の評価（Task A6/A7）─────────────────────────────────────────────────────────────────
export type SendDecision = 'allow_send' | 'cooldown' | 'max_resends' | 'max_sends' | 'already_verified'
export interface SendEvaluation {
  decision: SendDecision
  state: OtpState
  retryAfterMs?: number // cooldown のとき
}

// nowMs / 新コードの codeHash を受けて、送信可否を決定（allow なら state を新コードで更新）。
export function evaluateSendRequest(state: OtpState, input: { nowMs: number; codeHash: string }): SendEvaluation {
  if (state.status === 'verified') return { decision: 'already_verified', state }
  // 総送信上限（電話/applicant 単位。連打課金防止）。
  if (state.sendCount >= OTP_MAX_SENDS_PER_PHONE) return { decision: 'max_sends', state }
  // 再送 cooldown（初回は lastSentAt=null で即許可）。
  if (state.lastSentAtMs !== null) {
    const elapsed = input.nowMs - state.lastSentAtMs
    if (elapsed < OTP_RESEND_COOLDOWN_MS) return { decision: 'cooldown', state, retryAfterMs: OTP_RESEND_COOLDOWN_MS - elapsed }
    if (state.resendCount >= OTP_MAX_RESENDS) return { decision: 'max_resends', state }
  }
  const next: OtpState = {
    ...state,
    codeHash: input.codeHash,
    expiresAtMs: input.nowMs + OTP_TTL_MS,
    verifyAttempts: 0, // 新コードで照合回数リセット
    resendCount: state.lastSentAtMs === null ? 0 : state.resendCount + 1,
    sendCount: state.sendCount + 1,
    lastSentAtMs: input.nowMs,
    status: 'pending',
    version: state.version + 1,
  }
  return { decision: 'allow_send', state: next }
}

// ── 照合の評価（Task A6/A7）─────────────────────────────────────────────────────────────────────
export type VerifyDecision = 'verified' | 'invalid_code' | 'expired' | 'locked' | 'already_verified' | 'no_active_code'
export interface VerifyEvaluation {
  decision: VerifyDecision
  state: OtpState
}

export function evaluateVerify(state: OtpState, input: { nowMs: number; codeHash: string }): VerifyEvaluation {
  if (state.status === 'verified') return { decision: 'already_verified', state } // 成功後の再利用不可（冪等）
  if (state.status === 'locked') return { decision: 'locked', state }
  if (state.status !== 'pending' || !state.codeHash || state.expiresAtMs === null) {
    return { decision: 'no_active_code', state } // まだ送信していない
  }
  // 期限切れコードは再利用不可。
  if (input.nowMs > state.expiresAtMs) {
    return { decision: 'expired', state: { ...state, version: state.version + 1 } }
  }
  // 照合上限（超過で lockout）。
  if (state.verifyAttempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    return { decision: 'locked', state: { ...state, status: 'locked', version: state.version + 1 } }
  }
  if (input.codeHash === state.codeHash) {
    // 成功: コードを無効化（再利用不可）し verified 終端へ。
    return { decision: 'verified', state: { ...state, status: 'verified', codeHash: null, version: state.version + 1 } }
  }
  // 失敗: attempts++（上限到達なら次回 locked）。
  const verifyAttempts = state.verifyAttempts + 1
  const locked = verifyAttempts >= OTP_MAX_VERIFY_ATTEMPTS
  return {
    decision: 'invalid_code',
    state: { ...state, verifyAttempts, status: locked ? 'locked' : 'pending', version: state.version + 1 },
  }
}

// ── 永続化 store（R 系で結線。version 楽観ロック）───────────────────────────────────────────────
export interface OtpStore {
  load(interviewId: string): Promise<OtpState | null>
  save(state: OtpState, expectedVersion: number): Promise<'saved' | 'conflict' | 'error'>
}

export class InMemoryOtpStore implements OtpStore {
  private rows = new Map<string, OtpState>()
  async load(interviewId: string): Promise<OtpState | null> {
    return this.rows.get(interviewId) ?? null
  }
  async save(state: OtpState, expectedVersion: number): Promise<'saved' | 'conflict' | 'error'> {
    const cur = this.rows.get(state.interviewId)
    if ((cur ? cur.version : 0) !== expectedVersion) return 'conflict'
    this.rows.set(state.interviewId, state)
    return 'saved'
  }
}

import { describe, it, expect } from 'vitest'
import {
  describeSessionState,
  toSafeSessionState,
  formatElapsed,
  remainingSeconds,
  shouldWarnTime,
  isTimeLimitReached,
  clampElapsedSeconds,
  formatCompanyNameForHeader,
  buildSessionHeader,
  QUESTION_DISPLAY_POLICY,
  safeSupportHint,
  type SessionUiState,
  type InternalErrorKind,
} from './session-ui'
import { MAX_INTERVIEW_SECONDS, INTERVIEW_WARNING_SECONDS } from '@/lib/config/interview-policy'

// PR-P9: 面接セッション応募者向け view-model を固定（DOM/WebRTC/OpenAI 非依存）。

const ALL_STATES: SessionUiState[] = [
  'starting', 'connecting', 'ai_speaking', 'listening', 'processing', 'mic_denied',
  'mic_unavailable', 'muted', 'reconnecting', 'reconnect_success', 'reconnect_exhausted',
  'early_end_confirm', 'finishing', 'completed', 'already_completed', 'time_limit',
  'session_unavailable', 'unexpected_error',
]
// 応募者へ絶対に出さない内部語（Task 2/9）。
const FORBIDDEN = ['openai', 'realtime', 'supabase', 'webrtc', 'sdp', 'http', 'stack', 'undefined', 'null', 'index', 'score', 'evaluation', 'request']

describe('Task 16: 18 session UI states（+ #19/#20 は helper）', () => {
  it('全状態が応募者向け label を持ち、内部語を含まない・色以外の手掛かり(severity/aria)を返す', () => {
    for (const s of ALL_STATES) {
      const v = describeSessionState(s)
      expect(v.primaryLabel.length).toBeGreaterThan(0)
      const text = `${v.primaryLabel} ${v.secondaryLabel ?? ''} ${v.actionLabel ?? ''}`.toLowerCase()
      for (const bad of FORBIDDEN) expect(text).not.toContain(bad)
      expect(['info', 'success', 'warn', 'error']).toContain(v.severity)
      expect(['off', 'polite', 'assertive']).toContain(v.ariaLive)
    }
  })
  it('#3 ai_speaking / #4 listening / #5 processing の区別', () => {
    expect(describeSessionState('ai_speaking').primaryLabel).toContain('AI面接官')
    expect(describeSessionState('listening').micActive).toBe(true) // 声が入っている
    expect(describeSessionState('processing').primaryLabel).toContain('確認')
  })
  it('#6 mic_denied / #7 mic_unavailable は error + assertive + 再試行', () => {
    for (const s of ['mic_denied', 'mic_unavailable'] as SessionUiState[]) {
      const v = describeSessionState(s)
      expect(v.severity).toBe('error')
      expect(v.ariaLive).toBe('assertive')
      expect(v.actionLabel).toBe('再試行')
    }
  })
  it('#8 muted は micActive=false（声が入っていない）', () => {
    expect(describeSessionState('muted').micActive).toBe(false)
  })
  it('#9-11 reconnecting→success→exhausted。exhausted は terminal・正常完了ではない', () => {
    expect(describeSessionState('reconnecting').severity).toBe('warn')
    expect(describeSessionState('reconnect_success').severity).toBe('success')
    const ex = describeSessionState('reconnect_exhausted')
    expect(ex.isTerminal).toBe(true)
    expect(ex.primaryLabel).not.toContain('完了') // 異常終了を「完了」と誤表示しない
  })
  it('#12 early_end_confirm は確認 UI（即終了しない・終了で途中終了になる旨）', () => {
    const v = describeSessionState('early_end_confirm')
    expect(v.primaryLabel).toContain('終了しますか')
    expect(v.actionLabel).toBe('終了する')
    expect(v.secondaryLabel).toContain('途中')
  })
  it('#13 finishing / #14 completed / #15 already_completed', () => {
    expect(describeSessionState('finishing').primaryLabel).toContain('終了しています')
    expect(describeSessionState('completed').isTerminal).toBe(true)
    expect(describeSessionState('already_completed').isTerminal).toBe(true)
  })
  it('#16 time_limit は terminal・穏やかな表現', () => {
    const v = describeSessionState('time_limit')
    expect(v.isTerminal).toBe(true)
    expect(v.primaryLabel).toContain('制限時間')
  })
  it('#17 session_unavailable / #18 unexpected_error は安全な一般表現・terminal', () => {
    expect(describeSessionState('session_unavailable').isTerminal).toBe(true)
    expect(describeSessionState('unexpected_error').primaryLabel).toBe('問題が発生しました')
  })
})

describe('Task 9: 安全なエラー写像（内部種別 → 応募者状態・技術情報を露出しない）', () => {
  const cases: [InternalErrorKind, SessionUiState][] = [
    ['mic_permission_denied', 'mic_denied'],
    ['mic_device_unavailable', 'mic_unavailable'],
    ['network_lost', 'reconnecting'],
    ['reconnect_failed', 'reconnect_exhausted'],
    ['session_unavailable', 'session_unavailable'],
    ['already_finalized', 'already_completed'],
    ['time_limit_reached', 'time_limit'],
    ['openai_error', 'unexpected_error'], // OpenAI/WebRTC/SDP/Supabase 等はすべて一般表現へ
    ['unknown', 'unexpected_error'],
  ]
  it('内部種別を安全な状態へ畳み込む', () => {
    for (const [kind, expected] of cases) expect(toSafeSessionState(kind)).toBe(expected)
  })
  it('safeSupportHint は技術情報/PII を含まない', () => {
    const h = safeSupportHint().toLowerCase()
    for (const bad of FORBIDDEN) expect(h).not.toContain(bad)
  })
})

describe('Task 6: timer は interview-policy SoT に一致（UI 側で別定数を持たない）', () => {
  it('formatElapsed / clamp（MAX で頭打ち・負値は 0）', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65)).toBe('1:05')
    expect(formatElapsed(-5)).toBe('0:00')
    expect(clampElapsedSeconds(MAX_INTERVIEW_SECONDS + 100)).toBe(MAX_INTERVIEW_SECONDS)
  })
  it('remaining / warn / time-limit は SoT 秒に一致', () => {
    expect(remainingSeconds(0)).toBe(MAX_INTERVIEW_SECONDS)
    expect(shouldWarnTime(INTERVIEW_WARNING_SECONDS - 1)).toBe(false)
    expect(shouldWarnTime(INTERVIEW_WARNING_SECONDS)).toBe(true)
    expect(isTimeLimitReached(MAX_INTERVIEW_SECONDS)).toBe(true)
    expect(isTimeLimitReached(MAX_INTERVIEW_SECONDS - 1)).toBe(false)
  })
})

describe('Task 16 #19: 長い企業名はヘッダーで省略（レイアウトを壊さない）', () => {
  it('maxChars 超は … で省略・空/未定義は空文字', () => {
    expect(formatCompanyNameForHeader('短い会社')).toBe('短い会社')
    const long = 'あ'.repeat(40)
    const out = formatCompanyNameForHeader(long, 24)
    expect(out.length).toBe(24)
    expect(out.endsWith('…')).toBe(true)
    expect(formatCompanyNameForHeader('')).toBe('')
    expect(formatCompanyNameForHeader(null)).toBe('')
  })
  it('buildSessionHeader は企業名 + AI面接 バッジのみ（内部情報なし）', () => {
    const h = buildSessionHeader('テスト株式会社')
    expect(h.companyName).toBe('テスト株式会社')
    expect(h.badge).toBe('AI面接')
  })
})

describe('Task 3: 質問本文表示ポリシー', () => {
  it('既定は assistive（全文常時表示にしない）・SR announce・最終確定は R1', () => {
    expect(QUESTION_DISPLAY_POLICY.default).toBe('assistive')
    expect(QUESTION_DISPLAY_POLICY.screenReaderAnnounce).toBe(true)
    expect(QUESTION_DISPLAY_POLICY.finalDecisionAtR1).toBe(true)
  })
})

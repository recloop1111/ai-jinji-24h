// PR-P9: 面接セッションの「応募者向け状態表示」view-model（純ロジック・DOM/Realtime/OpenAI 非依存）。
//   初回 Realtime 実接続の前に、音声品質以外の応募者体験（状態表示・安全なエラー・タイマー・長い企業名）を
//   決定論的に固定し、component/view-model test で検証する。実 WebRTC 挙動は R1。
//
// 原則:
//   * 応募者へ内部情報（currentQuestionIndex / score / evaluation / OpenAI / Supabase / WebRTC / SDP /
//     HTTP status / stack / request id / technical event 名）を出さない。ラベルは平易な日本語のみ。
//   * 状態は色だけで伝えない（label + severity + aria を併せて返し、UI 側でアイコン/文言を必ず付ける）。
//   * タイマー等の定数は既存 SoT（interview-policy）を再利用（UI 側で別定数を持たない）。

import {
  MAX_INTERVIEW_SECONDS,
  INTERVIEW_WARNING_SECONDS,
  MAX_INTERVIEW_MINUTES,
} from '@/lib/config/interview-policy'

// 応募者向けの正規セッション状態（Task 16 の 1〜18。#19 長い企業名 / #20 小型ビューポートは helper/条件）。
export type SessionUiState =
  | 'starting' // セッション開始準備
  | 'connecting' // 接続中
  | 'ai_speaking' // AI が話しています
  | 'listening' // あなたの回答をお聞きしています
  | 'processing' // 回答を確認しています
  | 'mic_denied' // マイク許可がない
  | 'mic_unavailable' // マイクが使えない（デバイス無し/占有）
  | 'muted' // ミュート中
  | 'reconnecting' // 再接続しています
  | 'reconnect_success' // 再接続しました
  | 'reconnect_exhausted' // 再接続に失敗（正常終了ではない）
  | 'early_end_confirm' // 終了確認
  | 'finishing' // 面接を終了しています
  | 'completed' // 面接が完了しました
  | 'already_completed' // すでに完了済み
  | 'time_limit' // 制限時間に達した
  | 'session_unavailable' // セッションを利用できない
  | 'unexpected_error' // 予期しない問題（安全な一般表現）

export type SessionSeverity = 'info' | 'success' | 'warn' | 'error'
export type SessionAriaLive = 'off' | 'polite' | 'assertive'

export interface SessionUiView {
  state: SessionUiState
  primaryLabel: string // 応募者向けの短い状態文
  secondaryLabel: string | null // 補助説明（不要なら null）
  severity: SessionSeverity
  ariaLive: SessionAriaLive // 状態変化を SR へ伝える強さ（error/確認は assertive）
  micActive: boolean // 「今あなたの声が入っています」を示すか（listening/muted の判断材料）
  actionLabel: string | null // 主要操作の文言（確認/再試行等・不要なら null）
  isTerminal: boolean // completed/already_completed/time_limit/reconnect_exhausted 等（以後操作させない）
}

// 状態 → 応募者向け表示（内部語を一切出さない）。色に依存せず label/severity/aria を返す。
export function describeSessionState(state: SessionUiState): SessionUiView {
  const base = (v: Partial<SessionUiView>): SessionUiView => ({
    state,
    primaryLabel: '',
    secondaryLabel: null,
    severity: 'info',
    ariaLive: 'polite',
    micActive: false,
    actionLabel: null,
    isTerminal: false,
    ...v,
  })
  switch (state) {
    case 'starting':
      return base({ primaryLabel: '面接の準備をしています', ariaLive: 'polite' })
    case 'connecting':
      return base({ primaryLabel: '接続しています…', ariaLive: 'polite' })
    case 'ai_speaking':
      return base({ primaryLabel: 'AI面接官が話しています', ariaLive: 'polite' })
    case 'listening':
      return base({ primaryLabel: 'あなたの回答をお聞きしています', micActive: true, ariaLive: 'polite' })
    case 'processing':
      return base({ primaryLabel: '回答を確認しています', ariaLive: 'polite' })
    case 'mic_denied':
      return base({
        primaryLabel: 'マイクの使用が許可されていません',
        secondaryLabel: 'ブラウザの設定でマイクの使用を許可してください',
        severity: 'error',
        ariaLive: 'assertive',
        actionLabel: '再試行',
      })
    case 'mic_unavailable':
      return base({
        primaryLabel: 'マイクを利用できません',
        secondaryLabel: 'マイクが接続されているかご確認ください',
        severity: 'error',
        ariaLive: 'assertive',
        actionLabel: '再試行',
      })
    case 'muted':
      return base({ primaryLabel: 'ミュート中です', secondaryLabel: 'ミュートを解除すると回答できます', severity: 'warn', micActive: false })
    case 'reconnecting':
      return base({ primaryLabel: '再接続しています…', secondaryLabel: 'そのままお待ちください', severity: 'warn', ariaLive: 'assertive' })
    case 'reconnect_success':
      return base({ primaryLabel: '再接続しました', severity: 'success', ariaLive: 'polite' })
    case 'reconnect_exhausted':
      return base({
        primaryLabel: '接続を回復できませんでした',
        secondaryLabel: 'お手数ですが、時間をおいて最初からやり直してください',
        severity: 'error',
        ariaLive: 'assertive',
        isTerminal: true,
      })
    case 'early_end_confirm':
      return base({
        primaryLabel: '面接を終了しますか？',
        secondaryLabel: '終了すると、回答の途中でも面接は終了します',
        severity: 'warn',
        ariaLive: 'assertive',
        actionLabel: '終了する',
      })
    case 'finishing':
      return base({ primaryLabel: '面接を終了しています…', ariaLive: 'polite' })
    case 'completed':
      return base({ primaryLabel: '面接が完了しました', secondaryLabel: 'ご参加ありがとうございました', severity: 'success', ariaLive: 'assertive', isTerminal: true })
    case 'already_completed':
      return base({ primaryLabel: 'この面接はすでに完了しています', severity: 'info', ariaLive: 'polite', isTerminal: true })
    case 'time_limit':
      return base({
        primaryLabel: '制限時間になりましたので面接を終了します',
        secondaryLabel: 'ここまでの内容で受け付けます',
        severity: 'info',
        ariaLive: 'assertive',
        isTerminal: true,
      })
    case 'session_unavailable':
      return base({
        primaryLabel: '現在、面接を開始できません',
        secondaryLabel: 'お手数ですが、時間をおいて最初からやり直してください',
        severity: 'error',
        ariaLive: 'assertive',
        isTerminal: true,
      })
    case 'unexpected_error':
    default:
      return base({
        primaryLabel: '問題が発生しました',
        secondaryLabel: 'お手数ですが、最初からやり直してください',
        severity: 'error',
        ariaLive: 'assertive',
        isTerminal: true,
      })
  }
}

// ── 安全なエラー写像（Task 9）: 内部エラー種別 → 応募者向け状態。生の技術情報は絶対に露出しない。──────
export type InternalErrorKind =
  | 'mic_permission_denied'
  | 'mic_device_unavailable'
  | 'network_lost'
  | 'reconnect_failed'
  | 'session_unavailable'
  | 'already_finalized'
  | 'time_limit_reached'
  | 'openai_error' // OpenAI/Realtime/SDP/WebRTC/Supabase/HTTP 等はすべてここへ畳む
  | 'unknown'

export function toSafeSessionState(kind: InternalErrorKind): SessionUiState {
  switch (kind) {
    case 'mic_permission_denied':
      return 'mic_denied'
    case 'mic_device_unavailable':
      return 'mic_unavailable'
    case 'network_lost':
      return 'reconnecting'
    case 'reconnect_failed':
      return 'reconnect_exhausted'
    case 'session_unavailable':
      return 'session_unavailable'
    case 'already_finalized':
      return 'already_completed'
    case 'time_limit_reached':
      return 'time_limit'
    case 'openai_error':
    case 'unknown':
    default:
      return 'unexpected_error'
  }
}

// 応募者へ出してよい問い合わせ用の最小情報（PII/技術情報を含めない）。support code は非機微な短い識別子のみ。
export function safeSupportHint(): string {
  return 'この画面のまま、時間をおいて最初からやり直してください。解決しない場合は応募先の担当者へお問い合わせください。'
}

// ── 質問本文表示ポリシー（Task 3）─────────────────────────────────────────────────────────────
//   音声面接では「文章を読んで答える」体験を避けるため、原則は全文常時表示にしない（B: 補助表示）。
//   ただしアクセシビリティのため、現在質問は SR 向けに aria-live で 1 回読ませる（既存 session 実装と整合）。
//   最終確定（全文/補助/非表示のいずれを既定にするか）は R1 の実音声を聞いて決める（本 SoT は既定=assistive）。
export const QUESTION_DISPLAY_POLICY = {
  default: 'assistive' as 'full' | 'assistive' | 'hidden',
  screenReaderAnnounce: true, // 現在質問を aria-live=polite で 1 回読ませる（視覚は補助表示）
  finalDecisionAtR1: true,
} as const

// ── タイマー（Task 6・SoT 再利用）─────────────────────────────────────────────────────────────
//   応募者を不必要に焦らせないため既定は「経過時間」を表示（残り時間は警告時のみ補助的に）。
export function clampElapsedSeconds(elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0
  return Math.min(Math.floor(elapsed), MAX_INTERVIEW_SECONDS)
}
export function formatElapsed(elapsed: number): string {
  const s = clampElapsedSeconds(elapsed)
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}
export function remainingSeconds(elapsed: number): number {
  return Math.max(0, MAX_INTERVIEW_SECONDS - clampElapsedSeconds(elapsed))
}
export function shouldWarnTime(elapsed: number): boolean {
  return clampElapsedSeconds(elapsed) >= INTERVIEW_WARNING_SECONDS
}
export function isTimeLimitReached(elapsed: number): boolean {
  return clampElapsedSeconds(elapsed) >= MAX_INTERVIEW_SECONDS
}
// 残り時間の警告文（分単位・SoT 由来）。応募者向けの穏やかな表現。
export function timeWarningLabel(): string {
  const remainMin = MAX_INTERVIEW_MINUTES - Math.floor(INTERVIEW_WARNING_SECONDS / 60)
  return `まもなく面接時間（約${remainMin}分）が終了します`
}

// ── 長い企業名（Task 16 #19）: ヘッダーでレイアウトを壊さない省略（PII ではないが視覚安全）。────────
export function formatCompanyNameForHeader(name: string | null | undefined, maxChars = 24): string {
  const n = (name ?? '').trim()
  if (n.length === 0) return ''
  if (n.length <= maxChars) return n
  return n.slice(0, maxChars - 1) + '…'
}

// header に出してよい最小情報（内部情報を出さない）。企業名 + 「AI面接」だけ。
export function buildSessionHeader(companyName: string | null | undefined): { companyName: string; badge: string } {
  return { companyName: formatCompanyNameForHeader(companyName), badge: 'AI面接' }
}

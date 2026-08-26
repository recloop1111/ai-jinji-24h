// PR-P7.1: サーバ権威の面接進行状態（Server-authoritative Interview Progress）。純ロジック（OpenAI/DB/UI 非依存）。
//
// 目的:
//   Realtime の AI/LLM や client を「面接進行状態の Source of Truth」にしない。AI が質問を飛ばす／同じ質問を
//   繰り返す／早すぎる complete_interview を呼ぶ、client が index/count/complete を詐称する等をしても、
//   サーバが検証できる最小の状態機械（reducer）＋ premature-complete guard を提供する。
//
// 設計方針（過剰にしない）:
//   * index は「1歩ずつ ADVANCE」でしか進まない（N→N+2 へ飛べない）。未回答の質問は ADVANCE できない。
//   * COMPLETE は「全必須質問が完了」しているときだけ正常完了。未完了なら rejected_premature（正常完了にしない）。
//   * client 由来の index/count/complete は state へ代入しない（reducer は自分の遷移でしか index を動かさない）。
//   * eventId による冪等（同一 event の retry で二重 ADVANCE/二重 COMPLETE しない）。
//   * version による楽観的並行制御（compare-and-set）。store 層で version 不一致は conflict。
//   * interviewId を state に束縛し、別 interview の event を弾く（spoof 拒否の 1 層）。
//   ※ 認可（company/applicant/interview/token）は既存の route 層（capability token + service-role 整合）を維持。
//   ※ 本 PR では Realtime actual event とは結線しない（R1 で normalized event → 本 reducer へ橋渡し）。

import { MAX_FOLLOWUPS_PER_QUESTION } from '@/lib/interview/conversation-policy'

export type ProgressTerminal = 'none' | 'completed' | 'early_ended' | 'aborted'

// serializable（interviews.interview_progress jsonb へそのまま保存できる形）。PII を持たない（index/count のみ）。
export interface InterviewProgressState {
  interviewId: string
  totalQuestions: number
  currentIndex: number // 1-based。0 = 未開始（まだ Q1 を提示していない）
  currentAnswered: boolean // 現在質問に受理済み回答があるか（ADVANCE 可否の条件）
  completedCount: number // 回答受理済みの質問数（COMPLETE 可否の条件）
  followupsUsed: number // 現在質問の深掘り回数
  terminal: ProgressTerminal
  terminalReason: string | null
  version: number // 状態変更ごとに +1（楽観ロック & 冪等の補助）
  lastEventId: string | null // 直近で適用した eventId（重複適用の抑止）
}

export function initInterviewProgress(interviewId: string, totalQuestions: number): InterviewProgressState {
  const total = Number.isFinite(totalQuestions) && totalQuestions > 0 ? Math.floor(totalQuestions) : 0
  return {
    interviewId,
    totalQuestions: total,
    currentIndex: 0,
    currentAnswered: false,
    completedCount: 0,
    followupsUsed: 0,
    terminal: 'none',
    terminalReason: null,
    version: 0,
    lastEventId: null,
  }
}

// 早期終了の理由 → terminal 種別（Task 5: premature complete とは別物）。
export type EarlyEndReason = 'applicant_end' | 'time_limit' | 'admin_cancel' | 'fatal_error' | 'retry_exhausted'
const ABORT_REASONS = new Set<EarlyEndReason>(['fatal_error', 'retry_exhausted'])
export function earlyTerminalFor(reason: EarlyEndReason): Extract<ProgressTerminal, 'early_ended' | 'aborted'> {
  return ABORT_REASONS.has(reason) ? 'aborted' : 'early_ended'
}

// 進行イベント（サーバが受ける正規化済みイベント。Realtime 結線は R1）。
export type ProgressEvent =
  | { type: 'ASK_CURRENT'; eventId?: string; interviewId?: string }
  | { type: 'FOLLOW_UP'; eventId?: string; interviewId?: string }
  | { type: 'ANSWER_ACCEPTED'; eventId?: string; interviewId?: string }
  | { type: 'ADVANCE'; eventId?: string; interviewId?: string }
  | { type: 'END_EARLY'; reason: EarlyEndReason; eventId?: string; interviewId?: string }
  | { type: 'COMPLETE'; eventId?: string; interviewId?: string }

export type ProgressApplyResult =
  | 'applied'
  | 'noop_duplicate' // 同一 eventId の再送（冪等）
  | 'rejected_terminal' // 既に終端（不可逆）
  | 'rejected_interview_mismatch' // 別 interview の event（spoof）
  | 'rejected_invalid' // 不正遷移（未回答で ADVANCE / index 範囲外 / 深掘り上限 等）
  | 'rejected_premature' // 質問未完了での COMPLETE（早すぎる完了）

export interface ApplyOutcome {
  state: InterviewProgressState
  result: ProgressApplyResult
}

// 状態を変えずに返す（reject/noop 用）。
const unchanged = (state: InterviewProgressState, result: ProgressApplyResult): ApplyOutcome => ({ state, result })
// 状態変更を確定（version++・lastEventId 更新）。
function commit(prev: InterviewProgressState, next: Partial<InterviewProgressState>, eventId?: string): ApplyOutcome {
  return {
    state: { ...prev, ...next, version: prev.version + 1, lastEventId: eventId ?? prev.lastEventId },
    result: 'applied',
  }
}

// 決定論的 reducer。client 入力の index/count は一切参照しない（type と reason のみ）。
export function applyProgressEvent(state: InterviewProgressState, event: ProgressEvent): ApplyOutcome {
  // interview 束縛（別 interview の event を弾く）。
  if (event.interviewId && event.interviewId !== state.interviewId) {
    return unchanged(state, 'rejected_interview_mismatch')
  }
  // 冪等: 同一 eventId の再送は no-op（二重 ADVANCE/COMPLETE を防ぐ）。
  if (event.eventId && event.eventId === state.lastEventId) {
    return unchanged(state, 'noop_duplicate')
  }
  // 終端は不可逆（COMPLETE/END_EARLY の再送は上の dedup で吸収。ここは別 event）。
  if (state.terminal !== 'none') {
    return unchanged(state, 'rejected_terminal')
  }

  switch (event.type) {
    case 'ASK_CURRENT': {
      // 最初の質問提示（index 0 → 1）。既に提示済みなら index を進めない（同じ質問の再提示は許容）。
      if (state.totalQuestions <= 0) return unchanged(state, 'rejected_invalid')
      if (state.currentIndex === 0) return commit(state, { currentIndex: 1, currentAnswered: false, followupsUsed: 0 }, event.eventId)
      return commit(state, {}, event.eventId) // 再提示（version は進めて lastEventId を記録）
    }

    case 'FOLLOW_UP': {
      if (state.currentIndex < 1) return unchanged(state, 'rejected_invalid')
      if (state.followupsUsed >= MAX_FOLLOWUPS_PER_QUESTION) return unchanged(state, 'rejected_invalid') // 深掘り上限
      return commit(state, { followupsUsed: state.followupsUsed + 1 }, event.eventId)
    }

    case 'ANSWER_ACCEPTED': {
      if (state.currentIndex < 1) return unchanged(state, 'rejected_invalid')
      // 現在質問を「回答済み」にする（completedCount は現在 index までを最大とする＝二重加算しない）。
      const completedCount = Math.max(state.completedCount, state.currentIndex)
      return commit(state, { currentAnswered: true, completedCount }, event.eventId)
    }

    case 'ADVANCE': {
      if (state.currentIndex < 1) return unchanged(state, 'rejected_invalid')
      if (!state.currentAnswered) return unchanged(state, 'rejected_invalid') // 未回答の質問は飛ばせない
      if (state.currentIndex >= state.totalQuestions) return unchanged(state, 'rejected_invalid') // これ以上進めない→COMPLETE
      // 1 歩だけ進む（N→N+1）。N→N+2 へは飛べない。
      return commit(state, { currentIndex: state.currentIndex + 1, currentAnswered: false, followupsUsed: 0 }, event.eventId)
    }

    case 'END_EARLY': {
      const terminal = earlyTerminalFor(event.reason)
      return commit(state, { terminal, terminalReason: event.reason }, event.eventId)
    }

    case 'COMPLETE': {
      // premature guard: 全必須質問が完了していなければ正常完了にしない。
      if (!isAllQuestionsCompleted(state)) return unchanged(state, 'rejected_premature')
      return commit(state, { terminal: 'completed', terminalReason: 'normal' }, event.eventId)
    }
  }
}

// 全必須質問が完了しているか（COMPLETE 可否の唯一の判定）。
export function isAllQuestionsCompleted(state: InterviewProgressState): boolean {
  return state.totalQuestions > 0 && state.completedCount >= state.totalQuestions
}

// ── 完了要求の評価（Task 4/5）: 正常完了 vs 早期終了 を区別し、premature を弾く ─────────────────────
export type CompletionRequestReason = 'normal' | EarlyEndReason
export interface CompletionDecision {
  allowed: boolean
  terminal: ProgressTerminal // allowed=false のときは 'none'
  outcome: 'complete' | 'early_end' | 'reject_premature'
}

export function evaluateCompletionRequest(
  state: InterviewProgressState,
  input: { reason: CompletionRequestReason },
): CompletionDecision {
  // 早期終了は premature complete とは別（正常完了にしない）。
  if (input.reason !== 'normal') {
    const terminal = earlyTerminalFor(input.reason)
    return { allowed: true, terminal, outcome: 'early_end' }
  }
  // 正常完了は全質問完了のときだけ許可。未完了は reject（AI/client の早すぎる complete を弾く）。
  if (isAllQuestionsCompleted(state)) return { allowed: true, terminal: 'completed', outcome: 'complete' }
  return { allowed: false, terminal: 'none', outcome: 'reject_premature' }
}

// ── reconnect（Task 8）: 保存済み state から復元。malformed は null（crash しない）。────────────────
export function restoreProgress(raw: unknown): InterviewProgressState | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const interviewId = typeof o.interviewId === 'string' && o.interviewId ? o.interviewId : null
  if (!interviewId) return null
  const num = (v: unknown, min = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? Math.floor(v) : null)
  const total = num(o.totalQuestions)
  const currentIndex = num(o.currentIndex)
  const completedCount = num(o.completedCount)
  const followupsUsed = num(o.followupsUsed)
  const version = num(o.version)
  if (total === null || currentIndex === null || completedCount === null || followupsUsed === null || version === null) return null
  const terminal: ProgressTerminal =
    o.terminal === 'completed' || o.terminal === 'early_ended' || o.terminal === 'aborted' ? o.terminal : 'none'
  return {
    interviewId,
    totalQuestions: total,
    currentIndex: Math.min(currentIndex, total > 0 ? total : currentIndex),
    currentAnswered: o.currentAnswered === true,
    completedCount: Math.min(completedCount, total > 0 ? total : completedCount),
    followupsUsed,
    terminal,
    terminalReason: typeof o.terminalReason === 'string' ? o.terminalReason : null,
    version,
    lastEventId: typeof o.lastEventId === 'string' ? o.lastEventId : null,
  }
}

// 再接続時に復元してよいか（完了/異常終了は再開しない＝二重セッション/再課金防止）。
export function canResume(state: InterviewProgressState): boolean {
  return state.terminal === 'none'
}
// 再開すべき質問位置（index が 0 へ戻らない）。
export function resumeIndex(state: InterviewProgressState): number {
  return state.currentIndex >= 1 ? state.currentIndex : 1
}

// ── 永続化 store（Task 11: R1 で結線する interface）─────────────────────────────────────────────
//   楽観ロック: save は expectedVersion（読み込んだ時の version）と一致する時だけ書き込み、
//   不一致は 'conflict'（並行更新）。これで「同時 ADVANCE で二重加算」等を DB 側でも防ぐ。
export interface InterviewProgressStore {
  load(interviewId: string): Promise<InterviewProgressState | null>
  save(state: InterviewProgressState, expectedVersion: number): Promise<'saved' | 'conflict' | 'error'>
}

// テスト用 in-memory 実装（実 DB なし）。
export class InMemoryInterviewProgressStore implements InterviewProgressStore {
  private rows = new Map<string, InterviewProgressState>()
  async load(interviewId: string): Promise<InterviewProgressState | null> {
    return this.rows.get(interviewId) ?? null
  }
  async save(state: InterviewProgressState, expectedVersion: number): Promise<'saved' | 'conflict' | 'error'> {
    const cur = this.rows.get(state.interviewId)
    const curVersion = cur ? cur.version : 0
    // 新規（cur 無し）は expectedVersion=0 の時だけ許可。既存は version 一致時のみ。
    if ((cur ? curVersion : 0) !== expectedVersion) return 'conflict'
    this.rows.set(state.interviewId, state)
    return 'saved'
  }
}

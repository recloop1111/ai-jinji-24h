// PR-P7: AI 面接官の「会話挙動仕様（Interview Behavior Specification）」の唯一の権威（SoT）。
//   OpenAI Realtime を初めて実接続する前に、「何をどう話し／どの条件で次へ進み／いつ深掘りし／いつ終了するか」を
//   可能な限り決定論的に固定する。本 module は純ロジックのみ（OpenAI/DB/UI/network 非依存＝vitest で検証可能）。
//   ここで固定できない実挙動（voice 品質 / server_vad の実タイミング / barge-in 品質 等）は R1 の実スモークで確認する
//   （docs/INTERVIEW_BEHAVIOR_SPEC.md の R1 チェックリスト参照）。
//
// 重複定数を作らない: 面接時間・質問上限・深掘り上限・ロック TTL は既存 SoT を再利用（下記 re-export）。

import {
  MAX_INTERVIEW_SECONDS,
  MAX_TOTAL_QUESTIONS,
  MAX_EVALUATION_QUESTIONS,
} from '@/lib/config/interview-policy'
import { REALTIME_MAX_FOLLOWUPS } from '@/lib/config/openai'
import { REALTIME_CALL_LOCK_TTL_MS } from '@/lib/interview/realtime-call-lock'

// ── 既存 SoT の再利用（重複定義しない）─────────────────────────────────────────────────────────
export { MAX_INTERVIEW_SECONDS, MAX_TOTAL_QUESTIONS, MAX_EVALUATION_QUESTIONS, REALTIME_CALL_LOCK_TTL_MS }
// 1 質問あたりの深掘り上限＝instructions builder が使う REALTIME_MAX_FOLLOWUPS を唯一の SoT にする。
export const MAX_FOLLOWUPS_PER_QUESTION = REALTIME_MAX_FOLLOWUPS

// ── Task 2: 面接の基本原則（instructions/挙動の SoT）────────────────────────────────────────────
export const INTERVIEW_PRINCIPLES: readonly string[] = [
  '一度に1問だけ質問する',
  '応募者の回答が完了するまで待つ',
  '回答の途中で次の質問をしない',
  'questions_snapshot の順番を基本とする',
  '同一の質問を不要に繰り返さない',
  '応募者の回答を勝手に補完しない',
  '応募者を特定の答えへ誘導しない',
  '評価につながる正解・模範解答を教えない',
  '面接官自身が長く話しすぎない',
  '丁寧だが過剰にフレンドリーにしない',
] as const

// ── Task 16: 会話トーン（Character の voice/画像は P9。ここは会話ロジックに必要な範囲のみ）──────────
export const INTERVIEW_TONE: readonly string[] = [
  '敬語で話す',
  '簡潔に話す（冗長な前置きをしない）',
  '中立を保つ（応募者を否定・称賛しすぎない）',
  '相槌は控えめにする',
  '過度な感情表現をしない',
  '応募者を人格否定しない',
  '評価内容・スコアを応募者本人に漏らさない',
] as const

// ── Task 3: 面接開始フロー（冗長にしない）──────────────────────────────────────────────────────
export const INTERVIEW_START_STEPS: readonly string[] = [
  '簡単な挨拶',
  '参加へのお礼',
  '所要時間の目安を一言',
  '聞き取りづらい時は遠慮なく伝えてよい旨',
  '準備ができているかの確認',
  '最初の本質問へ進む',
] as const

// ── Task 9: 面接官が能動的に聞いてはいけないトピック（採用判断に不要な protected 属性）──────────────
//   P4 の FORBIDDEN_EVAL_KEYS（評価フィールドとして受理しない protected 属性）と思想を揃える。
//   応募者が自ら話しても、これらを評価誘導・追及に使わない（評価側は P4 bias guard で strip 済み）。
export const PROHIBITED_INTERVIEWER_TOPICS: readonly string[] = [
  '宗教・信条',
  '政治思想',
  '家族計画・結婚予定',
  '妊娠・出産予定',
  '性的指向',
  '採用判断に不要な健康・病歴情報',
  '人種・民族',
  '国籍を理由にした適性判断',
  '本籍・出生地',
  '思想信条にかかわる団体加入',
] as const

// ── Task 6: 沈黙（silence）契約。server_vad の実タイミングは R1 で確認（ここは方針の固定値）──────────
export const SILENCE_NORMAL_WAIT_MS = 4000 // これ未満の沈黙は「考え中」として通常待機（声かけしない）
export const SILENCE_PROMPT_AFTER_MS = 8000 // これを超えたら一度だけ「聞こえていますか」等の声かけ
export const SILENCE_MAX_PROMPTS = 2 // 声かけの上限（無限に急かさない）
export const SILENCE_GIVEUP_AFTER_MS = 20000 // 声かけ後も無反応が続けば、その質問は保留して次へ進む目安

// ── Task 12: reconnect 契約（cost amplification / reconnect storm 防止）──────────────────────────
//   実 OpenAI 呼び出しの多重化は既存の realtime-call-lock（interviews.realtime_call_locked_until・fail-closed・
//   TTL=REALTIME_CALL_LOCK_TTL_MS）で 1 面接 1 セッションに制限済み。ここは client 側の再試行契約を固定する。
export const MAX_RECONNECT_ATTEMPTS = 3 // これを超えたら「異常終了」（正常完了と誤認しない）
export const RECONNECT_COOLDOWN_MS = 3000 // 連続再接続の最小間隔（reconnect storm 抑制）

// ── Task 5: 深掘り（follow-up）トリガー理由。抽象的/具体例なし/役割不明/結果不明/理由不明 ─────────────
export const FOLLOWUP_TRIGGER_REASONS = ['abstract', 'no_example', 'role_unclear', 'result_unclear', 'reason_unclear'] as const
export type FollowupTriggerReason = (typeof FOLLOWUP_TRIGGER_REASONS)[number]

// ── Task 4: 回答分類 contract（A–J）。実際の意味分類（NLP 精度）は R1 で確認するため、
//   ここでは「分類の集合」と「各分類に対して次に取るべき行動」だけを決定論的に固定する。────────────────
export const ANSWER_CLASSES = [
  'sufficient', // A. 十分な回答
  'too_short', // B. 短すぎる回答
  'vague', // C. 曖昧な回答
  'no_answer', // D. 無回答
  'inaudible', // E. 聞き取れない
  'off_topic', // F. 質問と無関係
  'reverse_question', // G. 逆質問
  'too_long', // H. 長すぎる回答（情報は十分）
  'inappropriate', // I. 不適切/攻撃的
  'refusal', // J. 回答拒否
] as const
export type AnswerClass = (typeof ANSWER_CLASSES)[number]

// ── 会話状態機械 ───────────────────────────────────────────────────────────────────────────────
export type InterviewPhase =
  | 'not_started'
  | 'greeting'
  | 'awaiting_answer' // 現在質問を提示済みで回答待ち
  | 'closing'
  | 'completed'
  | 'aborted'

export interface InterviewConversationState {
  phase: InterviewPhase
  currentIndex: number // 1-based（0=未提示）。questions_snapshot の位置。
  totalQuestions: number
  followupsUsed: number // 現在質問の深掘り回数
  silencePrompts: number // 現在質問の沈黙声かけ回数
  reconnectAttempts: number
  elapsedSeconds: number
  completed: boolean
  aborted: boolean
}

export function initialInterviewState(totalQuestions: number): InterviewConversationState {
  const total = Number.isFinite(totalQuestions) && totalQuestions > 0 ? Math.floor(totalQuestions) : 0
  return {
    phase: 'not_started',
    currentIndex: 0,
    totalQuestions: total,
    followupsUsed: 0,
    silencePrompts: 0,
    reconnectAttempts: 0,
    elapsedSeconds: 0,
    completed: false,
    aborted: false,
  }
}

// 入力イベント（決定論的 reducer が受ける）。
export type InterviewInput =
  | { kind: 'start' }
  | { kind: 'answer'; answerClass: AnswerClass }
  | { kind: 'silence'; sinceLastSpeechMs: number }
  | { kind: 'interruption' } // barge-in（応募者が AI 発話中に話し始めた）
  | { kind: 'time_tick'; elapsedSeconds: number }
  | { kind: 'complete_tool' } // LLM が complete_interview を呼んだ
  | { kind: 'disconnect' }
  | { kind: 'reconnect' }
  | { kind: 'applicant_end_request' }

// AI が次に取るべき行動。
export type InterviewActionType =
  | 'GREET' // 開始フロー
  | 'ASK_CURRENT' // 現在の質問を提示（初回/再接続後の再提示）
  | 'ASK_NEXT' // 次の質問へ進む（index++・followups/silence リセット）
  | 'FOLLOW_UP' // 深掘り（上限内）
  | 'CLARIFY' // 曖昧→具体例を求める（深掘りの一種・上限内）
  | 'REDIRECT' // 無関係/不適切→丁寧に質問へ戻す（追及しない）
  | 'REPROMPT' // 無回答/聞き取れない/沈黙→一度だけ促す（上限内）
  | 'WAIT' // 通常待機（声かけしない）
  | 'STOP_AND_LISTEN' // barge-in：発話を止め応募者を優先
  | 'ANSWER_REVERSE_QUESTION' // 逆質問へ登録情報の範囲で誠実に回答し、質問へ戻る
  | 'CLOSE' // 全質問完了→締めの案内
  | 'FINISH' // 正常完了（complete_interview を発火してよい）
  | 'END_EARLY_SAFE' // 時間上限/応募者終了要求→安全に終了（正常完了ではない）
  | 'RESUME' // 再接続：現在質問位置から再開（snapshot 不変・大量再送しない）
  | 'ABORT' // 異常終了（切断/再接続上限）→正常完了と誤認しない
  | 'IGNORE_PREMATURE_COMPLETE' // 質問未完了での complete_tool を無視して面接継続

export interface InterviewAction {
  type: InterviewActionType
  // 補助情報（非機密・UI/instructions 用途）。
  reason?: string
  askIndex?: number // ASK_CURRENT/ASK_NEXT/RESUME が指す 1-based index
}

const clampIndex = (i: number, total: number) => Math.min(Math.max(i, 0), total)

// ── 決定論的 reducer: (state, input) → { state, action }。同一入力列 → 常に同一出力。─────────────────
export function reduceInterview(
  state: InterviewConversationState,
  input: InterviewInput,
): { state: InterviewConversationState; action: InterviewAction } {
  // 既に終端なら何もしない（completed/aborted は不可逆）。
  if (state.phase === 'completed' || state.phase === 'aborted') {
    return { state, action: { type: state.completed ? 'FINISH' : 'ABORT', reason: 'terminal' } }
  }

  switch (input.kind) {
    case 'start': {
      // 開始フロー（挨拶〜準備確認）を行い、最初の本質問（Q1）を提示するところまでを 1 ターンとする。
      const askIndex = state.totalQuestions > 0 ? 1 : 0
      const next = {
        ...state,
        phase: (state.totalQuestions > 0 ? 'awaiting_answer' : 'closing') as InterviewPhase,
        currentIndex: askIndex,
        followupsUsed: 0,
        silencePrompts: 0,
      }
      return { state: next, action: { type: 'GREET', reason: 'interview_start', askIndex } }
    }

    // 時間上限は最優先（どの段階でも安全終了。正常完了と区別）。
    case 'time_tick': {
      const elapsed = Number.isFinite(input.elapsedSeconds) ? Math.max(0, Math.floor(input.elapsedSeconds)) : state.elapsedSeconds
      const next = { ...state, elapsedSeconds: elapsed }
      if (elapsed >= MAX_INTERVIEW_SECONDS) {
        return { state: { ...next, phase: 'completed', aborted: false, completed: false, }, action: { type: 'END_EARLY_SAFE', reason: 'time_limit' } }
      }
      return { state: next, action: { type: 'WAIT', reason: 'within_time' } }
    }

    // barge-in: 常に発話停止＆傾聴（質問の二重送信/再生ループを避ける＝index/followups は変えない）。
    case 'interruption':
      return { state, action: { type: 'STOP_AND_LISTEN', reason: 'barge_in' } }

    // 応募者の終了要求: 無理に継続しない（安全終了・正常完了ではない）。
    case 'applicant_end_request':
      return { state: { ...state, phase: 'completed', completed: false, aborted: false }, action: { type: 'END_EARLY_SAFE', reason: 'applicant_requested' } }

    case 'disconnect':
      // 切断は即異常終了にせず、reconnect の機会を残す（次に reconnect/その他が来る）。ここでは中断アクションのみ。
      return { state, action: { type: 'ABORT', reason: 'disconnected' } }

    case 'reconnect': {
      const attempts = state.reconnectAttempts + 1
      if (attempts > MAX_RECONNECT_ATTEMPTS) {
        return { state: { ...state, reconnectAttempts: attempts, phase: 'aborted', aborted: true }, action: { type: 'ABORT', reason: 'reconnect_exhausted' } }
      }
      if (state.completed) {
        // 完了済み面接は再開しない（二重セッション/再課金を防ぐ）。
        return { state: { ...state, reconnectAttempts: attempts }, action: { type: 'FINISH', reason: 'already_completed' } }
      }
      // 現在質問位置から再開（snapshot 不変・大量再送しない）。
      const idx = state.currentIndex >= 1 ? state.currentIndex : 1
      return { state: { ...state, reconnectAttempts: attempts }, action: { type: 'RESUME', reason: 'reconnect', askIndex: clampIndex(idx, state.totalQuestions) } }
    }

    case 'complete_tool': {
      // 質問未完了での完了は無視して継続（LLM の早すぎる complete を server/logic 側で弾く）。
      if (state.currentIndex < state.totalQuestions || state.totalQuestions === 0) {
        return { state, action: { type: 'IGNORE_PREMATURE_COMPLETE', reason: 'questions_incomplete' } }
      }
      return { state: { ...state, phase: 'completed', completed: true }, action: { type: 'FINISH', reason: 'complete_tool' } }
    }

    case 'silence': {
      const ms = Number.isFinite(input.sinceLastSpeechMs) ? Math.max(0, input.sinceLastSpeechMs) : 0
      if (ms < SILENCE_PROMPT_AFTER_MS) {
        // 通常待機（考え中）。勝手に回答完了と決めない。
        return { state, action: { type: 'WAIT', reason: 'thinking' } }
      }
      if (state.silencePrompts < SILENCE_MAX_PROMPTS) {
        return { state: { ...state, silencePrompts: state.silencePrompts + 1 }, action: { type: 'REPROMPT', reason: 'silence' } }
      }
      // 声かけ上限に達したら、その質問を保留して次へ（無限に急かさない）。
      return advanceOrClose(state, 'silence_giveup')
    }

    case 'answer':
      return handleAnswer(state, input.answerClass)
  }
}

// 回答分類 → 次の行動（決定論的）。
function handleAnswer(
  state: InterviewConversationState,
  answerClass: AnswerClass,
): { state: InterviewConversationState; action: InterviewAction } {
  // 現在質問が未提示（greeting 直後の最初の回答は通常来ない）でも安全側で扱う。
  switch (answerClass) {
    case 'sufficient':
    case 'too_long':
      // 情報は十分 → 次へ（深掘りしない）。
      return advanceOrClose(state, answerClass === 'too_long' ? 'enough_though_long' : 'sufficient')

    case 'too_short':
    case 'vague': {
      if (state.followupsUsed < MAX_FOLLOWUPS_PER_QUESTION) {
        const next = { ...state, followupsUsed: state.followupsUsed + 1 }
        return {
          state: next,
          action: { type: answerClass === 'vague' ? 'CLARIFY' : 'FOLLOW_UP', reason: answerClass },
        }
      }
      // 深掘り上限 → 言い換えて何度も聞かず次へ。
      return advanceOrClose(state, 'followup_exhausted')
    }

    case 'off_topic':
    case 'inappropriate': {
      // 追及せず丁寧に質問へ戻す。ループ防止のため followup 予算を消費。
      if (state.followupsUsed < MAX_FOLLOWUPS_PER_QUESTION) {
        return { state: { ...state, followupsUsed: state.followupsUsed + 1 }, action: { type: 'REDIRECT', reason: answerClass } }
      }
      return advanceOrClose(state, 'redirect_exhausted')
    }

    case 'no_answer':
    case 'inaudible': {
      // 一度だけ促す（silence と同じ予算）。上限なら次へ（勝手に補完しない）。
      if (state.silencePrompts < SILENCE_MAX_PROMPTS) {
        return { state: { ...state, silencePrompts: state.silencePrompts + 1 }, action: { type: 'REPROMPT', reason: answerClass } }
      }
      return advanceOrClose(state, 'no_answer_giveup')
    }

    case 'reverse_question':
      // 逆質問には登録情報の範囲で誠実に答え、その後同じ質問へ戻る（index/followups は進めない）。
      return { state, action: { type: 'ANSWER_REVERSE_QUESTION', reason: 'reverse_question' } }

    case 'refusal':
      // 回答拒否は執拗に聞かず次へ（再質問しない）。
      return advanceOrClose(state, 'refusal')
  }
}

// 次の質問へ進む／全問終わっていれば締めへ。index/followups/silence をリセット。
function advanceOrClose(
  state: InterviewConversationState,
  reason: string,
): { state: InterviewConversationState; action: InterviewAction } {
  const nextIndex = state.currentIndex + 1
  if (state.totalQuestions > 0 && nextIndex > state.totalQuestions) {
    return { state: { ...state, phase: 'closing' }, action: { type: 'CLOSE', reason } }
  }
  const next = {
    ...state,
    phase: 'awaiting_answer' as InterviewPhase,
    currentIndex: clampIndex(nextIndex, state.totalQuestions),
    followupsUsed: 0,
    silencePrompts: 0,
  }
  return { state: next, action: { type: 'ASK_NEXT', reason, askIndex: next.currentIndex } }
}

// 面接官が能動的に聞いてはいけないトピックかの判定（instructions/guard 用）。
export function isProhibitedInterviewerTopic(topic: string): boolean {
  const t = (topic ?? '').trim()
  if (!t) return false
  return PROHIBITED_INTERVIEWER_TOPICS.some((p) => p === t)
}

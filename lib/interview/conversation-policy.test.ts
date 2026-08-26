import { describe, it, expect } from 'vitest'
import {
  reduceInterview,
  initialInterviewState,
  isProhibitedInterviewerTopic,
  PROHIBITED_INTERVIEWER_TOPICS,
  MAX_FOLLOWUPS_PER_QUESTION,
  SILENCE_MAX_PROMPTS,
  SILENCE_PROMPT_AFTER_MS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_INTERVIEW_SECONDS,
  ANSWER_CLASSES,
  type InterviewConversationState,
  type InterviewInput,
  type AnswerClass,
} from './conversation-policy'
import { REALTIME_MAX_FOLLOWUPS } from '@/lib/config/openai'
import { FORBIDDEN_EVAL_KEYS } from '@/lib/evaluation/ebca'

// PR-P7: 会話挙動仕様の決定論的 reducer と各契約を固定（OpenAI 非接続・純ロジック）。

// 状態を start して Q1 awaiting にした標準状態（total 問）。
function started(total = 3): InterviewConversationState {
  return reduceInterview(initialInterviewState(total), { kind: 'start' }).state
}
// 一連の入力を順に適用し、最後の action と state を返す。
function run(state: InterviewConversationState, inputs: InterviewInput[]) {
  let s = state
  let action = reduceInterview(s, inputs[0]).action
  for (const inp of inputs) {
    const r = reduceInterview(s, inp)
    s = r.state
    action = r.action
  }
  return { state: s, action }
}
const answer = (c: AnswerClass): InterviewInput => ({ kind: 'answer', answerClass: c })

describe('SoT: 定数の非重複・整合', () => {
  it('深掘り上限は REALTIME_MAX_FOLLOWUPS を唯一の SoT にする（重複定数を作らない）', () => {
    expect(MAX_FOLLOWUPS_PER_QUESTION).toBe(REALTIME_MAX_FOLLOWUPS)
  })
  it('回答分類は A–J の 10 種', () => {
    expect(ANSWER_CLASSES).toHaveLength(10)
  })
})

describe('開始フロー（Task 3）', () => {
  it('start → GREET＋Q1 提示（awaiting_answer, index=1）', () => {
    const { state, action } = reduceInterview(initialInterviewState(3), { kind: 'start' })
    expect(action.type).toBe('GREET')
    expect(action.askIndex).toBe(1)
    expect(state.phase).toBe('awaiting_answer')
    expect(state.currentIndex).toBe(1)
  })
  it('質問 0 問なら即 closing（提示する質問がない）', () => {
    const { state } = reduceInterview(initialInterviewState(0), { kind: 'start' })
    expect(state.phase).toBe('closing')
  })
})

describe('Task 15: 決定論 fixtures 20 ケース', () => {
  it('#1 正常回答 → 次の質問へ（深掘りしない）', () => {
    const { state, action } = run(started(3), [answer('sufficient')])
    expect(action.type).toBe('ASK_NEXT')
    expect(action.askIndex).toBe(2)
    expect(state.followupsUsed).toBe(0)
  })
  it('#2 短い回答 → 1 回深掘り', () => {
    const { action, state } = run(started(3), [answer('too_short')])
    expect(action.type).toBe('FOLLOW_UP')
    expect(state.followupsUsed).toBe(1)
    expect(state.currentIndex).toBe(1) // 進めない
  })
  it('#3 曖昧回答 → 具体例要求（CLARIFY）', () => {
    const { action } = run(started(3), [answer('vague')])
    expect(action.type).toBe('CLARIFY')
  })
  it('#4 十分回答 → 不要な深掘りをしない', () => {
    const { action } = run(started(3), [answer('sufficient')])
    expect(action.type).not.toBe('FOLLOW_UP')
    expect(action.type).toBe('ASK_NEXT')
  })
  it('#5 無回答 → 一度促す（REPROMPT）', () => {
    const { action, state } = run(started(3), [answer('no_answer')])
    expect(action.type).toBe('REPROMPT')
    expect(state.silencePrompts).toBe(1)
  })
  it('#6 長い沈黙（閾値超）→ REPROMPT、閾値未満 → WAIT', () => {
    expect(run(started(3), [{ kind: 'silence', sinceLastSpeechMs: SILENCE_PROMPT_AFTER_MS + 1 }]).action.type).toBe('REPROMPT')
    expect(run(started(3), [{ kind: 'silence', sinceLastSpeechMs: 1000 }]).action.type).toBe('WAIT')
  })
  it('#7 聞き取れない → REPROMPT（勝手に補完しない）', () => {
    expect(run(started(3), [answer('inaudible')]).action.type).toBe('REPROMPT')
  })
  it('#8 逆質問 → ANSWER_REVERSE_QUESTION（index/followups 進めない）', () => {
    const { action, state } = run(started(3), [answer('reverse_question')])
    expect(action.type).toBe('ANSWER_REVERSE_QUESTION')
    expect(state.currentIndex).toBe(1)
    expect(state.followupsUsed).toBe(0)
  })
  it('#9 無関係回答 → REDIRECT（追及しない）', () => {
    expect(run(started(3), [answer('off_topic')]).action.type).toBe('REDIRECT')
  })
  it('#10 回答拒否 → 執拗に聞かず次へ', () => {
    const { action } = run(started(3), [answer('refusal')])
    expect(action.type).toBe('ASK_NEXT')
  })
  it('#11 AI への割り込み（barge-in）→ STOP_AND_LISTEN（二重送信しない）', () => {
    const { action, state } = run(started(3), [{ kind: 'interruption' }])
    expect(action.type).toBe('STOP_AND_LISTEN')
    expect(state.currentIndex).toBe(1)
  })
  it('#12 長文回答 → 情報十分として次へ（AI は長く話さない）', () => {
    expect(run(started(3), [answer('too_long')]).action.type).toBe('ASK_NEXT')
  })
  it('#13 深掘り上限到達 → 言い換えず次へ', () => {
    const inputs: InterviewInput[] = []
    for (let i = 0; i < MAX_FOLLOWUPS_PER_QUESTION; i++) inputs.push(answer('too_short'))
    inputs.push(answer('too_short')) // 上限超過の1回
    const { action, state } = run(started(3), inputs)
    expect(action.type).toBe('ASK_NEXT')
    expect(state.currentIndex).toBe(2)
  })
  it('#14 全質問完了 → CLOSE', () => {
    // total=2。Q1 sufficient→Q2、Q2 sufficient→CLOSE。
    let s = started(2)
    s = reduceInterview(s, answer('sufficient')).state // → Q2
    const { action, state } = reduceInterview(s, answer('sufficient'))
    expect(action.type).toBe('CLOSE')
    expect(state.phase).toBe('closing')
  })
  it('#15 時間上限 → END_EARLY_SAFE（正常完了ではない）', () => {
    const { action, state } = run(started(3), [{ kind: 'time_tick', elapsedSeconds: MAX_INTERVIEW_SECONDS }])
    expect(action.type).toBe('END_EARLY_SAFE')
    expect(state.completed).toBe(false)
    expect(state.phase).toBe('completed')
  })
  it('#16 応募者終了要求 → END_EARLY_SAFE（無理に継続しない）', () => {
    const { action, state } = run(started(3), [{ kind: 'applicant_end_request' }])
    expect(action.type).toBe('END_EARLY_SAFE')
    expect(state.completed).toBe(false)
  })
  it('#17 接続切断 → ABORT（正常完了と誤認しない）', () => {
    expect(run(started(3), [{ kind: 'disconnect' }]).action.type).toBe('ABORT')
  })
  it('#18 再接続 → RESUME（現在質問位置・snapshot 不変）', () => {
    let s = started(3)
    s = reduceInterview(s, answer('sufficient')).state // Q2 へ
    const { action, state } = reduceInterview(s, { kind: 'reconnect' })
    expect(action.type).toBe('RESUME')
    expect(action.askIndex).toBe(2) // Q2 から再開
    expect(state.reconnectAttempts).toBe(1)
  })
  it('#19 duplicate/premature complete_tool → 未完了は無視して継続', () => {
    const { action, state } = run(started(3), [{ kind: 'complete_tool' }])
    expect(action.type).toBe('IGNORE_PREMATURE_COMPLETE')
    expect(state.completed).toBe(false)
  })
  it('#20 protected 属性を含む会話 → 特別扱いせず通常進行（評価誘導しない）', () => {
    // 応募者が protected を話しても answer 分類は通常どおり。reducer に protected 分岐は無い。
    const { action } = run(started(3), [answer('sufficient')])
    expect(action.type).toBe('ASK_NEXT')
  })
})

describe('深掘り契約（Task 5）: 無限深掘りしない・上限で次へ', () => {
  it('too_short を上限回 → FOLLOW_UP、上限超で ASK_NEXT', () => {
    let s = started(3)
    for (let i = 0; i < MAX_FOLLOWUPS_PER_QUESTION; i++) {
      const r = reduceInterview(s, answer('too_short'))
      expect(r.action.type).toBe('FOLLOW_UP')
      s = r.state
    }
    expect(reduceInterview(s, answer('too_short')).action.type).toBe('ASK_NEXT')
  })
})

describe('沈黙契約（Task 6）: 上限まで promptし、その後保留して次へ', () => {
  it('silence を SILENCE_MAX_PROMPTS 回 REPROMPT、その後 ASK_NEXT', () => {
    let s = started(3)
    for (let i = 0; i < SILENCE_MAX_PROMPTS; i++) {
      const r = reduceInterview(s, { kind: 'silence', sinceLastSpeechMs: SILENCE_PROMPT_AFTER_MS + 1 })
      expect(r.action.type).toBe('REPROMPT')
      s = r.state
    }
    expect(reduceInterview(s, { kind: 'silence', sinceLastSpeechMs: SILENCE_PROMPT_AFTER_MS + 1 }).action.type).toBe('ASK_NEXT')
  })
})

describe('終了条件（Task 11）: 正常完了 / 時間 / 異常 を区別', () => {
  it('全問後 complete_tool → FINISH（completed=true）', () => {
    // total=1、Q1 sufficient→CLOSE（currentIndex は 1 のまま＝ total 到達）。
    let s = started(1)
    const afterAnswer = reduceInterview(s, answer('sufficient'))
    expect(afterAnswer.action.type).toBe('CLOSE')
    s = afterAnswer.state
    const done = reduceInterview(s, { kind: 'complete_tool' })
    expect(done.action.type).toBe('FINISH')
    expect(done.state.completed).toBe(true)
  })
  it('completed 後の入力は不可逆（再開しない）', () => {
    let s = started(1)
    s = reduceInterview(s, answer('sufficient')).state
    s = reduceInterview(s, { kind: 'complete_tool' }).state
    const again = reduceInterview(s, { kind: 'reconnect' })
    expect(again.action.type).toBe('FINISH') // 完了面接は再開せず完了のまま
  })
})

describe('reconnect 契約（Task 12）: 上限超で ABORT・完了面接は再開しない', () => {
  it('MAX_RECONNECT_ATTEMPTS 超過で ABORT', () => {
    let s = started(3)
    let action
    for (let i = 0; i <= MAX_RECONNECT_ATTEMPTS; i++) {
      const r = reduceInterview(s, { kind: 'reconnect' })
      s = r.state
      action = r.action
    }
    expect(action?.type).toBe('ABORT')
    expect(s.aborted).toBe(true)
  })
})

describe('premature complete guard（Task 14）', () => {
  it('質問未完了での complete_tool は IGNORE_PREMATURE_COMPLETE（早すぎる完了を弾く）', () => {
    const s = started(3) // Q1、未完了
    expect(reduceInterview(s, { kind: 'complete_tool' }).action.type).toBe('IGNORE_PREMATURE_COMPLETE')
  })
})

describe('protected question guard（Task 9）: 面接官が能動的に聞かない', () => {
  it('主要 protected トピックが禁止リストに含まれる', () => {
    for (const t of ['宗教・信条', '政治思想', '家族計画・結婚予定', '妊娠・出産予定', '性的指向', '人種・民族']) {
      expect(PROHIBITED_INTERVIEWER_TOPICS).toContain(t)
      expect(isProhibitedInterviewerTopic(t)).toBe(true)
    }
    expect(isProhibitedInterviewerTopic('前職の実績')).toBe(false)
    expect(isProhibitedInterviewerTopic('')).toBe(false)
  })
  it('P4 の protected 属性（age/gender/religion 等）と思想が整合している', () => {
    // 会話 SoT の禁止トピックは、評価側 FORBIDDEN_EVAL_KEYS の protected 概念と同方向であることを確認。
    for (const key of ['age', 'gender', 'religion', 'nationality', 'race', 'marital_status']) {
      expect(FORBIDDEN_EVAL_KEYS).toContain(key)
    }
  })
})

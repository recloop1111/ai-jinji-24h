import { describe, it, expect } from 'vitest'
import {
  initInterviewProgress,
  applyProgressEvent,
  evaluateCompletionRequest,
  restoreProgress,
  canResume,
  resumeIndex,
  isAllQuestionsCompleted,
  InMemoryInterviewProgressStore,
  type InterviewProgressState,
  type ProgressEvent,
} from './interview-progress'
import { MAX_FOLLOWUPS_PER_QUESTION } from './conversation-policy'

// PR-P7.1: サーバ権威の面接進行状態を固定（OpenAI 非接続・純ロジック）。

const IV = 'iv-1'
function apply(state: InterviewProgressState, event: ProgressEvent) {
  return applyProgressEvent(state, event)
}
// 全質問を回答して進める（最後の質問は ANSWER_ACCEPTED まで）。
function answerAllThrough(total: number): InterviewProgressState {
  let s = initInterviewProgress(IV, total)
  s = apply(s, { type: 'ASK_CURRENT' }).state
  for (let i = 1; i <= total; i++) {
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state
    if (i < total) s = apply(s, { type: 'ADVANCE' }).state
  }
  return s
}

describe('Task 9: 20 progress fixtures', () => {
  it('#1 Q1 回答 → completedCount=1 / index=1', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    expect(s.currentIndex).toBe(1)
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state
    expect(s.completedCount).toBe(1)
    expect(s.currentIndex).toBe(1)
  })
  it('#2 同一 eventId の ADVANCE retry → 2問進まない（冪等）', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state
    const r1 = apply(s, { type: 'ADVANCE', eventId: 'adv-1' })
    expect(r1.result).toBe('applied')
    expect(r1.state.currentIndex).toBe(2)
    const r2 = apply(r1.state, { type: 'ADVANCE', eventId: 'adv-1' }) // 同一 eventId 再送
    expect(r2.result).toBe('noop_duplicate')
    expect(r2.state.currentIndex).toBe(2) // 3 にならない
  })
  it('#3 ANSWER_ACCEPTED → ADVANCE で Q2 へ正常進行', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state
    const r = apply(s, { type: 'ADVANCE' })
    expect(r.result).toBe('applied')
    expect(r.state.currentIndex).toBe(2)
  })
  it('#4 未回答での ADVANCE（質問飛ばし）→ reject・index 不変', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    const r = apply(s, { type: 'ADVANCE' }) // ANSWER_ACCEPTED 前
    expect(r.result).toBe('rejected_invalid')
    expect(r.state.currentIndex).toBe(1)
  })
  it('#4b ADVANCE は 1 歩だけ（N→N+2 へ飛べない）', () => {
    let s = initInterviewProgress(IV, 5)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state
    s = apply(s, { type: 'ADVANCE' }).state
    expect(s.currentIndex).toBe(2) // 3 へは飛ばない
  })
  it('#5 premature complete → reject（正常完了にしない）', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state // Q1 のみ完了
    const r = apply(s, { type: 'COMPLETE' })
    expect(r.result).toBe('rejected_premature')
    expect(r.state.terminal).toBe('none')
  })
  it('#6 全質問完了 → COMPLETE 許可', () => {
    const s = answerAllThrough(3)
    expect(isAllQuestionsCompleted(s)).toBe(true)
    const r = apply(s, { type: 'COMPLETE' })
    expect(r.result).toBe('applied')
    expect(r.state.terminal).toBe('completed')
  })
  it('#7 duplicate COMPLETE → idempotent（二重完了しない）', () => {
    const s = answerAllThrough(2)
    const r1 = apply(s, { type: 'COMPLETE', eventId: 'c-1' })
    expect(r1.result).toBe('applied')
    const r2 = apply(r1.state, { type: 'COMPLETE', eventId: 'c-1' })
    expect(r2.result).toBe('noop_duplicate')
    expect(r2.state.terminal).toBe('completed')
    expect(r2.state.version).toBe(r1.state.version) // version 増えない
  })
  it('#8 FOLLOW_UP 中は index 不変', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    const r = apply(s, { type: 'FOLLOW_UP' })
    expect(r.result).toBe('applied')
    expect(r.state.currentIndex).toBe(1)
    expect(r.state.followupsUsed).toBe(1)
  })
  it('#9 深掘り上限後は FOLLOW_UP 不可・ANSWER→ADVANCE は可能', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    for (let i = 0; i < MAX_FOLLOWUPS_PER_QUESTION; i++) s = apply(s, { type: 'FOLLOW_UP' }).state
    expect(apply(s, { type: 'FOLLOW_UP' }).result).toBe('rejected_invalid')
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state
    expect(apply(s, { type: 'ADVANCE' }).result).toBe('applied')
  })
  it('#10 applicant early-end → early_ended（正常完了ではない）', () => {
    const dec = evaluateCompletionRequest(initInterviewProgress(IV, 3), { reason: 'applicant_end' })
    expect(dec.outcome).toBe('early_end')
    expect(dec.terminal).toBe('early_ended')
    const r = apply(initInterviewProgress(IV, 3), { type: 'END_EARLY', reason: 'applicant_end' })
    expect(r.state.terminal).toBe('early_ended')
  })
  it('#11 time limit → early_ended', () => {
    expect(evaluateCompletionRequest(initInterviewProgress(IV, 3), { reason: 'time_limit' }).terminal).toBe('early_ended')
  })
  it('#12 fatal → aborted', () => {
    const r = apply(initInterviewProgress(IV, 3), { type: 'END_EARLY', reason: 'fatal_error' })
    expect(r.state.terminal).toBe('aborted')
    expect(evaluateCompletionRequest(initInterviewProgress(IV, 3), { reason: 'retry_exhausted' }).terminal).toBe('aborted')
  })
  it('#13 reconnect → serialize/restore で progress 保持（index 0 に戻らない）', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    s = apply(s, { type: 'ANSWER_ACCEPTED' }).state
    s = apply(s, { type: 'ADVANCE' }).state // index 2
    const restored = restoreProgress(JSON.parse(JSON.stringify(s)))
    expect(restored).not.toBeNull()
    expect(restored!.currentIndex).toBe(2)
    expect(resumeIndex(restored!)).toBe(2)
    expect(canResume(restored!)).toBe(true)
  })
  it('#14 completed reconnect → 再開拒否', () => {
    const s = apply(answerAllThrough(2), { type: 'COMPLETE' }).state
    expect(canResume(s)).toBe(false)
  })
  it('#15 別 interview の event → rejected_interview_mismatch（spoof）', () => {
    const s = apply(initInterviewProgress(IV, 3), { type: 'ASK_CURRENT' }).state
    const r = apply(s, { type: 'ANSWER_ACCEPTED', interviewId: 'iv-OTHER' })
    expect(r.result).toBe('rejected_interview_mismatch')
    expect(r.state.completedCount).toBe(0)
  })
  it('#16 wrong applicant spoof → interview 束縛で弾く（authz は route 層で別途）', () => {
    const s = apply(initInterviewProgress(IV, 3), { type: 'ASK_CURRENT' }).state
    expect(apply(s, { type: 'ADVANCE', interviewId: 'iv-attacker' }).result).toBe('rejected_interview_mismatch')
  })
  it('#17 cross-company → 別 interviewId は適用されない', () => {
    const s = apply(initInterviewProgress(IV, 3), { type: 'ASK_CURRENT' }).state
    expect(apply(s, { type: 'COMPLETE', interviewId: 'iv-otherco' }).result).toBe('rejected_interview_mismatch')
  })
  it('#18 malformed progress → restoreProgress は null（crash しない）', () => {
    expect(restoreProgress(null)).toBeNull()
    expect(restoreProgress('x')).toBeNull()
    expect(restoreProgress({ interviewId: '' })).toBeNull()
    expect(restoreProgress({ interviewId: IV })).toBeNull() // 必須数値欠落
  })
  it('#19 questions_snapshot 無し（total=0）→ ASK_CURRENT reject / COMPLETE premature', () => {
    const s = initInterviewProgress(IV, 0)
    expect(apply(s, { type: 'ASK_CURRENT' }).result).toBe('rejected_invalid')
    expect(apply(s, { type: 'COMPLETE' }).result).toBe('rejected_premature')
  })
  it('#20 concurrent 更新 → 楽観ロックで 1 本のみ saved（もう 1 本は conflict）', async () => {
    const store = new InMemoryInterviewProgressStore()
    const base = initInterviewProgress(IV, 3) // version 0
    await store.save(base, 0) // 初期化（version 0 で保存）
    // 2 本が同じ version(0) を読んで、それぞれ +1 の状態を保存しようとする。
    const a = apply(base, { type: 'ASK_CURRENT' }).state // version 1
    const b = apply(base, { type: 'FOLLOW_UP' }).state // version 1
    const r1 = await store.save(a, 0)
    const r2 = await store.save(b, 0)
    expect([r1, r2].filter((x) => x === 'saved')).toHaveLength(1)
    expect([r1, r2].filter((x) => x === 'conflict')).toHaveLength(1)
  })
})

describe('client 詐称耐性（Task 6）: reducer は client の index/count を代入しない', () => {
  it('index は ADVANCE でしか +1 されない（COMPLETE も server 判定のみ）', () => {
    let s = initInterviewProgress(IV, 3)
    s = apply(s, { type: 'ASK_CURRENT' }).state
    // COMPLETE を連打しても completedCount が満たされなければ terminal にならない。
    for (let i = 0; i < 5; i++) expect(apply(s, { type: 'COMPLETE' }).result).toBe('rejected_premature')
    expect(s.currentIndex).toBe(1)
  })
})

describe('premature complete guard（Task 4）: evaluateCompletionRequest', () => {
  it('normal + 未完了 → reject_premature（allowed=false）', () => {
    const s = apply(initInterviewProgress(IV, 3), { type: 'ASK_CURRENT' }).state
    const dec = evaluateCompletionRequest(s, { reason: 'normal' })
    expect(dec.allowed).toBe(false)
    expect(dec.outcome).toBe('reject_premature')
  })
  it('normal + 全完了 → complete（allowed=true）', () => {
    const dec = evaluateCompletionRequest(answerAllThrough(2), { reason: 'normal' })
    expect(dec.allowed).toBe(true)
    expect(dec.terminal).toBe('completed')
  })
})

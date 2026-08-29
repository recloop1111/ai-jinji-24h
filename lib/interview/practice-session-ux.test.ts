import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldEndPracticeAnswer, ANSWER_SILENCE_MS } from './practice-answer-end'
import { shouldShowAnswerCompleteFallback, ANSWER_COMPLETE_SIGNAL } from './session-answer-signal'
import { isSessionMediaOk, sessionMediaBlockReason } from './session-media'

describe('練習: 発話開始後 約5秒無音で回答終了（未発話は終了しない）', () => {
  it('1. 発話開始前は5秒経っても回答終了しない', () => {
    expect(shouldEndPracticeAnswer({ hasSpoken: false, lastSpeechAtMs: null, nowMs: 999999 })).toBe(false)
    // hasSpoken=false は lastSpeech があっても終了しない
    expect(shouldEndPracticeAnswer({ hasSpoken: false, lastSpeechAtMs: 0, nowMs: 10000 })).toBe(false)
  })
  it('2. 発話開始後、最後の発話から5秒無音で回答終了', () => {
    expect(shouldEndPracticeAnswer({ hasSpoken: true, lastSpeechAtMs: 0, nowMs: 5000 })).toBe(true)
    expect(shouldEndPracticeAnswer({ hasSpoken: true, lastSpeechAtMs: 0, nowMs: 5001 })).toBe(true)
  })
  it('3. 3秒では終了しない（旧仕様の3秒を廃止）', () => {
    expect(shouldEndPracticeAnswer({ hasSpoken: true, lastSpeechAtMs: 0, nowMs: 3000 })).toBe(false)
    expect(shouldEndPracticeAnswer({ hasSpoken: true, lastSpeechAtMs: 0, nowMs: 4999 })).toBe(false)
  })
  it('無音しきい値は5秒', () => {
    expect(ANSWER_SILENCE_MS).toBe(5000)
  })
})

describe('session: 回答を終える fallback は default 非表示・signal であって nextQuestion 強制でない', () => {
  it('10. 通常（待機短い）は非表示', () => {
    expect(shouldShowAnswerCompleteFallback({ aiSpeaking: false, answerCompleteDetected: false, waitElapsedMs: 0 })).toBe(false)
    expect(shouldShowAnswerCompleteFallback({ aiSpeaking: false, answerCompleteDetected: false, waitElapsedMs: 5000 })).toBe(false)
  })
  it('AI 発話中は非表示', () => {
    expect(shouldShowAnswerCompleteFallback({ aiSpeaking: true, answerCompleteDetected: false, waitElapsedMs: 99999 })).toBe(false)
  })
  it('回答終了が長時間確定しないときだけ控えめ表示', () => {
    expect(shouldShowAnswerCompleteFallback({ aiSpeaking: false, answerCompleteDetected: false, waitElapsedMs: 20000 })).toBe(true)
  })
  it('11. signal 名は user_answer_complete（直接 nextQuestion を意味しない）', () => {
    expect(ANSWER_COMPLETE_SIGNAL).toBe('user_answer_complete')
    const SRC = readFileSync(join(process.cwd(), 'app/interview/[slug]/session/page.tsx'), 'utf8')
    // fallback ボタンは default 非表示（shouldShowAnswerCompleteFallback を条件に描画）
    expect(SRC).toContain('shouldShowAnswerCompleteFallback')
  })
})

describe('session media: カメラ・マイク必須（audio-only を ok にしない）', () => {
  it('12. audio+video → ok', () => {
    expect(isSessionMediaOk({ hasAudio: true, hasVideo: true })).toBe(true)
    expect(sessionMediaBlockReason({ hasAudio: true, hasVideo: true })).toBe('ok')
  })
  it('13. audio のみ（カメラ無し）は ok にしない', () => {
    expect(isSessionMediaOk({ hasAudio: true, hasVideo: false })).toBe(false)
    expect(sessionMediaBlockReason({ hasAudio: true, hasVideo: false })).toBe('no_camera')
  })
  it('mic 無しは no_mic', () => {
    expect(isSessionMediaOk({ hasAudio: false, hasVideo: true })).toBe(false)
    expect(sessionMediaBlockReason({ hasAudio: false, hasVideo: true })).toBe('no_mic')
  })
})

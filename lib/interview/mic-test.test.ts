import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  shouldPassMicTest,
  isVoiceActive,
  isGreetingMatch,
  MIC_FALLBACK_SUSTAINED_MS,
} from './mic-test'

describe('マイクテスト誤判定防止（環境音/無音では合格しない）', () => {
  it('3. 無言（voice無し・phrase無し）→ 合格しない', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: true, phraseMatched: false, voiceDetected: false, sustainedVoiceMs: 0 }),
    ).toBe(false)
    // fallback でも無言は不可
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: false, phraseMatched: false, voiceDetected: false, sustainedVoiceMs: 0 }),
    ).toBe(false)
  })
  it('4. 一瞬の環境ノイズ（sustained 不足）→ 合格しない（fallback）', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: false, phraseMatched: false, voiceDetected: true, sustainedVoiceMs: 200 }),
    ).toBe(false)
  })
  it('5. sustained voice だが SpeechRecognition で phrase 不一致 → 合格しない', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: true, phraseMatched: false, voiceDetected: true, sustainedVoiceMs: 5000 }),
    ).toBe(false)
  })
  it('6. 「こんにちは」認識 + voice → 合格', () => {
    expect(isGreetingMatch('こんにちは')).toBe(true)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: true, phraseMatched: true, voiceDetected: true, sustainedVoiceMs: 0 }),
    ).toBe(true)
  })
  it('7. 「こんにちわ」認識 + voice → 合格', () => {
    expect(isGreetingMatch('えーと こんにちわ')).toBe(true)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: true, phraseMatched: true, voiceDetected: true, sustainedVoiceMs: 0 }),
    ).toBe(true)
  })
  it('8. analyser/AudioContext 例外相当（hasLiveAudio でも voice未検出）→ 自動合格しない', () => {
    // fail-open 廃止: 解析不能で voice/ phrase を確認できなければ false のまま。
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: true, phraseMatched: false, voiceDetected: false, sustainedVoiceMs: 0 }),
    ).toBe(false)
  })
  it('9. SpeechRecognition 非対応 fallback: 無言では合格しない / sustained voice で合格', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: false, phraseMatched: false, voiceDetected: false, sustainedVoiceMs: 0 }),
    ).toBe(false)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechSupported: false, phraseMatched: false, voiceDetected: true, sustainedVoiceMs: MIC_FALLBACK_SUSTAINED_MS }),
    ).toBe(true)
  })
  it('hasLiveAudio 無し → 常に false', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: false, speechSupported: true, phraseMatched: true, voiceDetected: true, sustainedVoiceMs: 9999 }),
    ).toBe(false)
  })
  it('isVoiceActive: noise floor を十分超えたときだけ true（微小は false）', () => {
    expect(isVoiceActive(15, 5)).toBe(false) // 絶対下限未満
    expect(isVoiceActive(30, 25)).toBe(false) // margin 未満
    expect(isVoiceActive(60, 25)).toBe(true) // margin 超え
  })
})

describe('prepare/page.tsx: fail-open 撤去＋発話確認＋camera 再attach seam', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/prepare/page.tsx'), 'utf8')
  it('shouldPassMicTest を使用（音量のみの旧判定でない）', () => {
    expect(PAGE).toContain('shouldPassMicTest')
  })
  it('AudioContext catch の fail-open（旧「合格扱いにして先へ進める」）が撤去されている', () => {
    // 旧 fail-open のコメント/挙動を削除し、代わりに「fail-open 廃止」を明記していること。
    expect(PAGE).not.toContain('合格扱いにして先へ進めるようにする')
    expect(PAGE).toContain('fail-open 廃止')
  })
  it('SpeechRecognition(ja-JP) をマイクテストに使用', () => {
    expect(PAGE).toContain("'ja-JP'")
    expect(PAGE).toContain('webkitSpeechRecognition')
  })
  it('camera 再attach seam: srcObject !== streamRef を条件に再接続する', () => {
    expect(PAGE).toContain('srcObject !== streamRef.current')
  })
})

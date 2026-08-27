import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  shouldPassMicTest,
  isVoiceActive,
  isGreetingMatch,
  normalizeTranscript,
  hasSpeechTranscript,
  isFatalSpeechError,
  computeNoiseFloor,
  MIC_FALLBACK_SUSTAINED_MS,
  MIC_NOISE_FLOOR_MAX,
} from './mic-test'

// 目的: 「マイクが正常で本人の明確な発話が入力されている」ことの確認。文字列の完全一致は合否条件にしない。
//   以前の「環境音/無音で通る」バグは再発させず、「人が普通に話せば確実に通る」ことを純ロジックで固定。

describe('shouldPassMicTest: recognition 正常環境は挨拶認識を必須にする', () => {
  it('1. healthy ＋ voice ＋「こんにちは」→ pass', () => {
    expect(isGreetingMatch('こんにちは')).toBe(true)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: true, voiceDetected: true, sustainedVoiceMs: 0 }),
    ).toBe(true)
  })
  it('2. healthy ＋ voice ＋「こんにちわ」→ pass', () => {
    expect(isGreetingMatch('こんにちわ')).toBe(true)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: true, voiceDetected: true, sustainedVoiceMs: 0 }),
    ).toBe(true)
  })
  it('3. healthy ＋ voice ＋「今日は」→ pass', () => {
    expect(isGreetingMatch('今日は')).toBe(true)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: true, voiceDetected: true, sustainedVoiceMs: 0 }),
    ).toBe(true)
  })
  it('4. healthy ＋ voice ＋ transcript「テストです」（greeting 無し）→ fail', () => {
    expect(isGreetingMatch('テストです')).toBe(false)
    expect(hasSpeechTranscript('テストです')).toBe(true)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: false, voiceDetected: true, sustainedVoiceMs: 0 }),
    ).toBe(false)
  })
  it('5. healthy ＋ sustainedVoice 2000ms ＋ greeting 無し → fail（sustained だけで healthy pass しない）', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: false, voiceDetected: true, sustainedVoiceMs: 2000 }),
    ).toBe(false)
  })
  it('6. healthy ＋ voice ＋ greeting 無し（空 transcript 相当）→ fail', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: false, voiceDetected: true, sustainedVoiceMs: 0 }),
    ).toBe(false)
  })
  it('healthy ＋ greeting あり だが voice 未検出 → fail', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: true, voiceDetected: false, sustainedVoiceMs: 0 }),
    ).toBe(false)
  })
})

describe('shouldPassMicTest: recognition が本当に使えない時だけ WebAudio fallback', () => {
  it('7. unhealthy ＋ sustainedVoice ≥ threshold → pass', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: false, greetingMatched: false, voiceDetected: true, sustainedVoiceMs: MIC_FALLBACK_SUSTAINED_MS }),
    ).toBe(true)
  })
  it('8. unhealthy ＋ 一瞬 noise（sustained 不足）→ fail', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: false, greetingMatched: false, voiceDetected: true, sustainedVoiceMs: 200 }),
    ).toBe(false)
  })
  it('API ありだが network fatal → healthy=false 判定へ（fallback で救済）', () => {
    expect(isFatalSpeechError('network')).toBe(true)
  })
})

describe('shouldPassMicTest: 誤判定防止', () => {
  it('9. 無言（voice 無し）→ pass しない（healthy / unhealthy とも）', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: true, greetingMatched: false, voiceDetected: false, sustainedVoiceMs: 0 }),
    ).toBe(false)
    expect(
      shouldPassMicTest({ hasLiveAudio: true, speechRecognitionHealthy: false, greetingMatched: false, voiceDetected: false, sustainedVoiceMs: 9999 }),
    ).toBe(false)
  })
  it('hasLiveAudio 無し → 常に false（fail-open しない）', () => {
    expect(
      shouldPassMicTest({ hasLiveAudio: false, speechRecognitionHealthy: true, greetingMatched: true, voiceDetected: true, sustainedVoiceMs: 9999 }),
    ).toBe(false)
  })
})

describe('noise floor calibration（robust・即発話でも詰まない）', () => {
  it('11. 開始直後すぐ発話で計測窓が大音量でも floor は cap で頭打ち（永久 fail しない）', () => {
    // 窓全体が発話で埋まっても median は高いが cap で MIC_NOISE_FLOOR_MAX 以下に抑える。
    expect(computeNoiseFloor([80, 90, 100, 85, 95])).toBe(MIC_NOISE_FLOOR_MAX)
  })
  it('通常の静かな環境は median を素直に返す（過小評価しない）', () => {
    expect(computeNoiseFloor([5, 6, 7, 8])).toBe(6.5)
  })
  it('空配列 → 0', () => {
    expect(computeNoiseFloor([])).toBe(0)
  })
  it('floor を cap した状態でも普通の声（level 60）は voice active になる', () => {
    const floor = computeNoiseFloor([80, 90, 100]) // = cap 35
    expect(isVoiceActive(60, floor)).toBe(true) // 60 >= max(22, 35+12=47)
  })
})

describe('transcript 正規化 / greeting / fatal error', () => {
  it('normalizeTranscript: 空白・句読点を除去', () => {
    expect(normalizeTranscript(' こんにちは。 ')).toBe('こんにちは')
    expect(normalizeTranscript('えーと、今日は！')).toBe('えーと今日は')
  })
  it('hasSpeechTranscript: 非空のみ true', () => {
    expect(hasSpeechTranscript('あ')).toBe(true)
    expect(hasSpeechTranscript('   ')).toBe(false)
    expect(hasSpeechTranscript('')).toBe(false)
  })
  it('isGreetingMatch: 表記揺れ（こんにちは/こんにちわ/今日は・句読点あり）を許容', () => {
    expect(isGreetingMatch('こんにちは')).toBe(true)
    expect(isGreetingMatch('えーと こんにちわ')).toBe(true)
    expect(isGreetingMatch('今日は。')).toBe(true)
    expect(isGreetingMatch('さようなら')).toBe(false)
  })
  it('isFatalSpeechError: recognition を利用できない致命的 error のみ true', () => {
    for (const e of ['network', 'service-not-allowed', 'audio-capture', 'not-allowed']) {
      expect(isFatalSpeechError(e)).toBe(true)
    }
    for (const e of ['no-speech', 'aborted', 'no-match', '']) {
      expect(isFatalSpeechError(e)).toBe(false)
    }
  })
  it('isVoiceActive: noise floor を十分超えたときだけ true（微小は false）', () => {
    expect(isVoiceActive(15, 5)).toBe(false) // 絶対下限未満
    expect(isVoiceActive(30, 25)).toBe(false) // margin 未満
    expect(isVoiceActive(60, 25)).toBe(true) // margin 超え
  })
})

describe('prepare/page.tsx: 発話確認＋recognition lifecycle＋fallback＋camera 再attach seam', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/prepare/page.tsx'), 'utf8')
  it('shouldPassMicTest を使用（音量のみの旧判定でない）', () => {
    expect(PAGE).toContain('shouldPassMicTest')
  })
  it('AudioContext catch の fail-open（旧「合格扱いにして先へ進める」）が撤去されている', () => {
    expect(PAGE).not.toContain('合格扱いにして先へ進めるようにする')
    expect(PAGE).toContain('fail-open 廃止')
  })
  it('SpeechRecognition(ja-JP) をマイクテストに使用', () => {
    expect(PAGE).toContain("'ja-JP'")
    expect(PAGE).toContain('webkitSpeechRecognition')
  })
  it('13. recognition の fatal error を監査し healthy=false → fallback に移行', () => {
    expect(PAGE).toContain('isFatalSpeechError')
    expect(PAGE).toContain('speechHealthyRef.current = false')
  })
  it('6/14. onend で稼働中・未合格なら安全に restart（上限あり・無限 loop 防止）', () => {
    expect(PAGE).toContain('recognition.onend')
    expect(PAGE).toContain('recognitionRestartsRef.current += 1')
    expect(PAGE).toContain('MAX_RESTARTS')
  })
  it('7. cleanup / unmount 後は restart しない（micTestActiveRef を落としてから停止・onend で参照）', () => {
    expect(PAGE).toContain('micTestActiveRef.current = false')
    expect(PAGE).toMatch(/onend[\s\S]{0,400}micTestActiveRef\.current/)
  })
  it('11. robust noise floor（computeNoiseFloor）を使用', () => {
    expect(PAGE).toContain('computeNoiseFloor')
  })
  it('camera 再attach seam: srcObject !== streamRef を条件に再接続する', () => {
    expect(PAGE).toContain('srcObject !== streamRef.current')
  })
})

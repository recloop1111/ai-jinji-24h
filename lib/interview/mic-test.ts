// 環境確認画面のマイクテスト判定（純ロジック・AudioContext/SpeechRecognition 非依存）。
//
// 正式仕様（誤判定防止）: 生活音/キーボード音/PCファン/無音では合格しない。
//   - 実際に発話したことを確認してから micTestPassed=true。
//   - SpeechRecognition 対応環境: live audio ＋ voice activity ＋「こんにちは/こんにちわ」認識（phraseMatched）。
//   - 非対応環境(fallback): live audio ＋ noise floor を明確に超える sustained voice activity（既定 800ms）。
//   - analyser/AudioContext 失敗を「合格」にしない（fail-open 廃止）。

export const MIC_FALLBACK_SUSTAINED_MS = 800 // 非対応環境で voice activity を継続確認する時間
export const MIC_NOISE_FLOOR_SAMPLE_MS = 400 // 開始直後に noise floor を計測する時間
export const MIC_VOICE_MARGIN = 12 // noise floor への上乗せ（avg level 0-255 スケール）
export const MIC_VOICE_MIN_LEVEL = 22 // 絶対下限（微小ノイズ/無音を弾く）

// 現在の平均レベル(0-255)が noise floor を十分超える＝発話らしい入力か。
export function isVoiceActive(level: number, noiseFloor: number): boolean {
  if (!Number.isFinite(level)) return false
  return level >= Math.max(MIC_VOICE_MIN_LEVEL, noiseFloor + MIC_VOICE_MARGIN)
}

// 認識結果に挨拶（こんにちは / こんにちわ）が含まれるか。空白を除去して部分一致。
export function isGreetingMatch(transcript: string): boolean {
  const t = (transcript ?? '').replace(/\s/g, '')
  return t.includes('こんにちは') || t.includes('こんにちわ')
}

// マイクテスト合格判定。fail-open しない（hasLiveAudio 無し/未発話は false）。
export function shouldPassMicTest(input: {
  hasLiveAudio: boolean
  speechSupported: boolean
  phraseMatched: boolean
  voiceDetected: boolean
  sustainedVoiceMs: number
  requiredSustainedMs?: number
}): boolean {
  if (!input.hasLiveAudio) return false
  if (input.speechSupported) {
    // 発話（voice）＋挨拶認識の両方を要求。認識だけ・音量だけでは合格しない。
    return input.voiceDetected === true && input.phraseMatched === true
  }
  // fallback: noise floor を超える voice activity が一定時間継続したときのみ。
  return input.voiceDetected === true && input.sustainedVoiceMs >= (input.requiredSustainedMs ?? MIC_FALLBACK_SUSTAINED_MS)
}

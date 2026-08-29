// 環境確認画面のマイクテスト判定（純ロジック・AudioContext/SpeechRecognition 非依存）。
//
// 目的: 「マイクが正常で、応募者本人の明確な発話が入力されていること」の確認。
//   ＝「こんにちは」という文字列の完全一致確認ではない（正確な文字起こしを合否条件にしない）。
//
// 誤判定防止（以前のバグを戻さない）: 生活音/キーボード音/PCファン/無音/挨拶以外の発話では合格しない。
//   UI は「『こんにちは』と話しかけてください」と明示 → recognition が使える環境では挨拶認識を必須にする。
//   - Primary（recognition 正常）: live audio ＋ voice activity ＋「こんにちは系」挨拶認識（greetingMatched）。
//     ※ 非空 transcript だけ（「テストです」等）では合格しない。sustained voice だけでも合格しない。
//   - Fallback（recognition が本当に使えない: API 非対応 / fatal error）: live audio ＋ noise floor を明確に
//     超える sustained voice のみで合格（文字列は確認できないため安全側の継続時間で判定）。
//   - analyser/AudioContext 失敗を「合格」にしない（fail-open 廃止）。

export const MIC_FALLBACK_SUSTAINED_MS = 1000 // fallback で voice activity を継続確認する時間（人の発話帯・安全側）
export const MIC_NOISE_FLOOR_SAMPLE_MS = 400 // 開始直後に noise floor を計測する時間
export const MIC_VOICE_MARGIN = 12 // noise floor への上乗せ（avg level 0-255 スケール）
export const MIC_VOICE_MIN_LEVEL = 22 // 絶対下限（微小ノイズ/無音を弾く）
export const MIC_NOISE_FLOOR_MAX = 35 // 汚染対策: floor をこれ以上に上げない（即発話でも高止まりで詰まない）

// 現在の平均レベル(0-255)が noise floor を十分超える＝発話らしい入力か。
export function isVoiceActive(level: number, noiseFloor: number): boolean {
  if (!Number.isFinite(level)) return false
  return level >= Math.max(MIC_VOICE_MIN_LEVEL, noiseFloor + MIC_VOICE_MARGIN)
}

// noise floor を robust に算出（median ＋ 上限 cap）。開始直後に応募者がすぐ「こんにちは」と話しても
//   その発話が floor を過大にして永久 fail しないよう、mean ではなく median を使い、さらに cap で頭打ちにする。
export function computeNoiseFloor(samples: number[]): number {
  const valid = samples.filter((s) => Number.isFinite(s) && s >= 0)
  if (valid.length === 0) return 0
  const sorted = [...valid].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return Math.min(median, MIC_NOISE_FLOOR_MAX)
}

// 認識結果に日本語の挨拶（こんにちは/こんにちわ/今日は）が含まれるか。表記揺れを normalize して部分一致。
//   ※ 合否は greeting exact match に依存しない（case をリッチにする補助情報）。
export function isGreetingMatch(transcript: string): boolean {
  const t = normalizeTranscript(transcript)
  return t.includes('こんにちは') || t.includes('こんにちわ') || t.includes('今日は')
}

// transcript の正規化（空白・句読点等を除去）。音声認識の表記揺れ吸収用。
export function normalizeTranscript(transcript: string): string {
  return (transcript ?? '').replace(/[\s。、．，！？!?.,・]/g, '')
}

// 非空の発話 transcript か（何らかの人間の音声が文字列として認識されたか）。
export function hasSpeechTranscript(transcript: string): boolean {
  return normalizeTranscript(transcript).length > 0
}

// SpeechRecognition の致命的エラー（recognition service を利用できない）。→ healthy=false にして安全に fallback。
//   no-speech / aborted / no-match 等は「再試行可能」＝致命的ではない（onend で安全に restart）。
export const SPEECH_FATAL_ERRORS = ['network', 'service-not-allowed', 'audio-capture', 'not-allowed'] as const
export function isFatalSpeechError(error: string): boolean {
  return (SPEECH_FATAL_ERRORS as readonly string[]).includes(error)
}

// マイクテスト合格判定。fail-open しない（hasLiveAudio 無しは false）。
//   speechRecognitionHealthy は「API が存在」ではなく「現在 recognition が正常動作している」こと。
//   healthy の間は sustained voice だけでは合格させない（挨拶認識必須）。unhealthy のときだけ fallback。
export function shouldPassMicTest(input: {
  hasLiveAudio: boolean
  speechRecognitionHealthy: boolean
  greetingMatched: boolean
  voiceDetected: boolean
  sustainedVoiceMs: number
  requiredSustainedMs?: number
}): boolean {
  if (!input.hasLiveAudio) return false
  if (input.speechRecognitionHealthy) {
    // recognition が使える環境: 挨拶（こんにちは系）認識 ＋ voice activity 必須。
    //   非空 transcript でも挨拶以外（「テストです」等）や sustained voice だけでは合格しない。
    return input.voiceDetected === true && input.greetingMatched === true
  }
  // fallback（recognition が本当に使えない）: noise floor を明確に超える sustained voice のみで合格。
  return (
    input.voiceDetected === true &&
    input.sustainedVoiceMs >= (input.requiredSustainedMs ?? MIC_FALLBACK_SUSTAINED_MS)
  )
}

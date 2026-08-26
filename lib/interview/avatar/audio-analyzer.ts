// PR: Realtime AI 音声のブラウザ内エネルギー解析（外部 API 0・原価 0）。
//   Realtime remote audio(MediaStream) → AudioContext + MediaStreamAudioSourceNode + AnalyserNode で
//   音量(RMS) を取得し、0..1 の mouth level へ正規化・平滑化する。samples は外部へ一切送らない。
//
// 分離:
//   - 純関数（computeRms / energyToMouthLevel / smoothLevel / mouthStateForLevel）= 単体テスト可能・本体ロジック。
//   - createRemoteAudioAnalyzer = ブラウザ API を触る薄い wrapper（feature-detect・失敗時 null・面接を壊さない）。
//     analyser は destination へ接続しない（<audio> 要素が再生を担う。二重再生や遅延増を起こさない）。

import { AVATAR_AUDIO, MOUTH_LEVEL_THRESHOLDS, type MouthState } from './avatar-config'

// 時間領域サンプル（-1..1 or 0..255 の Uint8）から RMS(0..1) を計算。Float32/Uint8 双方に対応。
export function computeRms(samples: Float32Array | Uint8Array | number[]): number {
  const n = samples.length
  if (!n) return 0
  let sumSq = 0
  const isByte = samples instanceof Uint8Array
  for (let i = 0; i < n; i++) {
    // Uint8(0..255・128 中心) → -1..1 へ。Float は既に -1..1。
    const v = isByte ? ((samples[i] as number) - 128) / 128 : (samples[i] as number)
    sumSq += v * v
  }
  return Math.sqrt(sumSq / n)
}

// RMS → mouth level(0..1)。ノイズ床未満は 0（口を開けない）。gain で正規化し 0..1 にクランプ。
export function energyToMouthLevel(
  rms: number,
  cfg: { noiseFloorRms: number; gain: number } = AVATAR_AUDIO,
): number {
  if (!Number.isFinite(rms) || rms <= cfg.noiseFloorRms) return 0
  const level = (rms - cfg.noiseFloorRms) * cfg.gain
  return Math.max(0, Math.min(1, level))
}

// 平滑化（フリッカー防止）: 立ち上がり速く・立ち下がり遅く。target>prev は attack、else release。
export function smoothLevel(
  prev: number,
  target: number,
  cfg: { attackCoef: number; releaseCoef: number } = AVATAR_AUDIO,
): number {
  const p = Number.isFinite(prev) ? prev : 0
  const t = Number.isFinite(target) ? target : 0
  const coef = t >= p ? cfg.attackCoef : cfg.releaseCoef
  const next = p + (t - p) * coef
  return Math.max(0, Math.min(1, next))
}

// 連続 level → 離散 mouth state（4 段階アセット用）。閾値は SoT。
export function mouthStateForLevel(level: number, th = MOUTH_LEVEL_THRESHOLDS): MouthState {
  if (!Number.isFinite(level) || level < th.small) return 'closed'
  if (level < th.medium) return 'small'
  if (level < th.large) return 'medium'
  return 'large'
}

// fail-safe 合成: AI が発話中でない / barge-in 中 / 無音 は必ず closed（口だけ動き続けない）。
export function resolveMouthLevel(input: {
  aiSpeaking: boolean
  bargeIn?: boolean
  rawLevel: number
}): number {
  if (!input.aiSpeaking || input.bargeIn) return 0
  return Math.max(0, Math.min(1, Number.isFinite(input.rawLevel) ? input.rawLevel : 0))
}

// ── ブラウザ wrapper（feature-detect・失敗時 null・destination へ繋がない）──────────────────────
export interface RemoteAudioAnalyzer {
  // 現在の生 mouth level(0..1)。平滑化前（呼び出し側で smoothLevel を適用）。
  sample(): number
  dispose(): void
}

type AudioCtor = typeof AudioContext

// stream から analyzer を生成。AudioContext 非対応/例外時は null（呼び出し側は静止 3 状態へ fallback）。
export function createRemoteAudioAnalyzer(
  stream: MediaStream,
  opts?: { audioContext?: AudioContext; fftSize?: number },
): RemoteAudioAnalyzer | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctor: AudioCtor | undefined =
      opts?.audioContext ? undefined : (window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext)
    const ctx = opts?.audioContext ?? (Ctor ? new Ctor() : null)
    if (!ctx) return null
    if (!stream || typeof stream.getAudioTracks !== 'function' || stream.getAudioTracks().length === 0) return null
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = opts?.fftSize ?? AVATAR_AUDIO.fftSize
    source.connect(analyser) // analyser は sink（destination へは繋がない＝再生は <audio> 側のみ）。
    const buf = new Uint8Array(analyser.fftSize)
    const ownsCtx = !opts?.audioContext
    return {
      sample() {
        try {
          analyser.getByteTimeDomainData(buf)
          return energyToMouthLevel(computeRms(buf))
        } catch {
          return 0
        }
      },
      dispose() {
        try {
          source.disconnect()
        } catch {
          /* noop */
        }
        if (ownsCtx) {
          try {
            void ctx.close()
          } catch {
            /* noop */
          }
        }
      },
    }
  } catch {
    return null // 面接を壊さない（HARD requirement）: 解析不能は静止 3 状態へ。
  }
}

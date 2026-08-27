// demo 企業限定「Synthetic Avatar Driver v2」の純ロジック（OpenAI/Realtime を一切使わない）。
//
// 【v2 の思想】v1 は mouthState を直接ランダム選択（110–240ms）で「パパパ」高速・機械的だった。
//   v2 は mouthState を直接選ばず、日本語発話に近い **synthetic speech energy envelope**（phrase/pause モデル）を生成し、
//   本番 actual と同じ pipeline（energy → smoothLevel(attack/release) → mouthStateForLevel）へ通す。
//   → demo と actual で mouth mapping/smoothing を共有し、demo を「実 Realtime 接続後に近い見た目」へ寄せる。
//
//   Production actual: real AI audio → energy(analyzer.sample) → smoothLevel → mouthState
//   Production demo  : synthetic energy envelope → 同じ smoothLevel → 同じ mouthState
//
// 方針: energy 自体を滑らかに変える（mouth を直接ランダム選択しない）。small/medium 中心・large は稀・pause で closed。
//   seed 可能な純関数＝test で決定的。

import type { MouthState } from '@/lib/interview/avatar/avatar-config'
import { AVATAR_SYNTHETIC } from '@/lib/interview/avatar/avatar-config'
import type { InterviewerVisualState } from '@/lib/interview/interviewer-identity'

// Synthetic Avatar Driver を起動してよいかの HARD guard（純関数・component とロジックを共有）。
//   すべて満たすときだけ true: overlay 有効 / demo（syntheticLipsync=true）/ speaking / remoteStream 無し。
//   → normal company（syntheticLipsync=false）・realtime（remoteStream あり）・非 speaking では必ず false。
export function shouldRunSyntheticLipsync(input: {
  overlayEnabled: boolean
  syntheticLipsync: boolean
  visualState: InterviewerVisualState
  hasRemoteStream: boolean
}): boolean {
  return (
    input.overlayEnabled &&
    input.syntheticLipsync &&
    input.visualState === 'speaking' &&
    !input.hasRemoteStream
  )
}

// テスト/決定的再生用の軽量 seedable PRNG（mulberry32）。0..1 を返す純関数を生成。
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

type Segment = {
  kind: 'phrase' | 'pause'
  startMs: number
  durMs: number
  peak: number // phrase の energy ピーク（pause は 0）
  sylPeriodMs: number // phrase の音節リズム
}

// synthetic speech envelope: 時刻(ms) → energy(0..1)。phrase（発話の波）と pause（closed）を交互に生成。
//   - phrase: sin の phrase 包絡（onset/offset が 0）× 音節リズム。energy は基本 small/medium 域、稀に large 域。
//   - pause: energy=0（short pause / sentence pause）＝口 closed。
//   seed(rng) 固定で完全に決定的。lazy に segment を生成して無限に続く（同じ pattern を永遠に反復しない）。
export function createSyntheticSpeechEnvelope(rng: () => number, cfg = AVATAR_SYNTHETIC) {
  let seg: Segment = rollPhrase(0)
  let prevWasPause = false

  function rollPhrase(startMs: number): Segment {
    const strong = rng() < cfg.strongPhraseProbability
    const peak = strong
      ? randRange(rng, cfg.strongPhrasePeakMin, cfg.strongPhrasePeakMax)
      : randRange(rng, cfg.phrasePeakMin, cfg.phrasePeakMax)
    return {
      kind: 'phrase',
      startMs,
      durMs: randRange(rng, cfg.phraseMinMs, cfg.phraseMaxMs),
      peak,
      sylPeriodMs: randRange(rng, cfg.syllablePeriodMinMs, cfg.syllablePeriodMaxMs),
    }
  }
  function rollPause(startMs: number): Segment {
    const sentenceEnd = rng() < cfg.sentenceEndProbability
    const durMs = sentenceEnd
      ? randRange(rng, cfg.sentencePauseMinMs, cfg.sentencePauseMaxMs)
      : randRange(rng, cfg.shortPauseMinMs, cfg.shortPauseMaxMs)
    return { kind: 'pause', startMs, durMs, peak: 0, sylPeriodMs: 0 }
  }

  function advance(tMs: number) {
    // t が現在 segment を超えたら次を生成（phrase↔pause 交互）。まとめて追いつく。
    while (tMs >= seg.startMs + seg.durMs) {
      const nextStart = seg.startMs + seg.durMs
      if (seg.kind === 'phrase') {
        seg = rollPause(nextStart)
        prevWasPause = true
      } else {
        seg = rollPhrase(nextStart)
        prevWasPause = false
      }
    }
  }

  return {
    // 現在の raw energy(0..1)。
    energyAt(tMs: number): number {
      advance(tMs)
      if (seg.kind === 'pause') return 0
      const local = tMs - seg.startMs
      const phase = Math.max(0, Math.min(1, local / seg.durMs))
      const phraseEnv = Math.sin(Math.PI * phase) // onset/offset で 0（語頭語尾で口が閉じる）
      const syl = 0.5 + 0.5 * Math.sin((2 * Math.PI * local) / seg.sylPeriodMs) // 0..1
      // energy = peak × phrase 包絡 ×（音節で 0.55–1.0 に変調）。→ 基本 small/medium、山で large。
      return Math.max(0, Math.min(1, seg.peak * phraseEnv * (0.55 + 0.45 * syl)))
    },
    // test/内省用: 現在が pause か。
    isPause(): boolean {
      return seg.kind === 'pause' || prevWasPause === undefined
    },
  }
}

// 可視 mouthState の最小保持ゲート（境界チャタリング防止）。前回変更から visibleMinHoldMs 未満なら維持。
//   envelope が緩やかなので通常は不要だが、閾値付近の往復を抑える保険。純関数（state は呼び出し側 ref）。
export function holdMouthState(
  prev: MouthState,
  next: MouthState,
  lastChangeMs: number,
  nowMs: number,
  minHoldMs = AVATAR_SYNTHETIC.visibleMinHoldMs,
): MouthState {
  if (next === prev) return prev
  if (nowMs - lastChangeMs < minHoldMs) return prev // まだ保持
  return next
}

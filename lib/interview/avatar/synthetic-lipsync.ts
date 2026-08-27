// demo 企業限定「Synthetic Avatar Driver」の純ロジック（OpenAI/Realtime を一切使わない）。
//
// 目的: Production の demo 応募者フロー（remoteStream=null＝実 audio 無し）でも、AI が質問を話している相当の状態で
//   Lower-Face の口 overlay が「人が喋っているように」疑似的に動く様子を Human が目視 QA できるようにする。
//   ※ これは **UI/Avatar QA 用の mock 駆動**であり、actual interview behavior ではない（音声解析ではない）。
//
// 方針:
//   - renderer は本番と共通（neutral base + lower-face overlay）。本モジュールは mouthState を疑似供給するだけ。
//   - 機械的な small→medium→large の固定反復にしない（多少のランダム性）。ただし seed 可能な pure logic＝test で決定的。
//   - 実装値（遅延）は AVATAR_SYNTHETIC（avatar-config）に集約し、既存 smoothing/QA と整合。

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

// 現在の口の開きから「次に取り得る口の開き」候補（重み＝配列内の出現数）。
//   発話中は small/medium/large を主体に、時々 closed（単語の切れ目）を挟む＝自然な上下動。固定周期の反復を避ける。
const SYNTHETIC_TRANSITIONS: Record<MouthState, readonly MouthState[]> = {
  closed: ['small', 'small', 'medium'], // 口を開き始める（閉じっぱなしにしない）
  small: ['medium', 'medium', 'large', 'small', 'closed'],
  medium: ['large', 'small', 'medium', 'large', 'small'],
  large: ['medium', 'small', 'medium'], // 開いたら戻る（開けっ放しにしない）
} as const

// 次の口の開き（決定的・rng に依存）。prev から候補配列を rng で 1 つ選ぶ。
export function nextSyntheticMouthState(prev: MouthState, rng: () => number): MouthState {
  const candidates = SYNTHETIC_TRANSITIONS[prev] ?? SYNTHETIC_TRANSITIONS.closed
  const idx = Math.min(candidates.length - 1, Math.max(0, Math.floor(rng() * candidates.length)))
  return candidates[idx]
}

// 次の口の変化までの遅延（ms）。高速フリッカーにせず、人が喋る程度の自然な幅（既定 ~110–240ms）。
export function nextSyntheticDelayMs(rng: () => number): number {
  const { minDelayMs, maxDelayMs } = AVATAR_SYNTHETIC
  return Math.round(minDelayMs + rng() * (maxDelayMs - minDelayMs))
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

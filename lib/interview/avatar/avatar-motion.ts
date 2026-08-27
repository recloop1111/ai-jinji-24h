// PR: Avatar モーション制御の純ロジック（blink/nod のスケジュール決定・DOM/時刻に依存しない）。
//   自然さのため「固定周期にしない」＝RNG を注入して次イベントまでの遅延を決める（テスト可能）。
//   実際の setTimeout/rAF/CSS 適用は component 側（本ファイルは決定ロジックのみ）。

import { AVATAR_BLINK, AVATAR_NOD } from './avatar-config'

export type Rng = () => number // 0..1（テストは決定的な値を注入）

// 次の瞬きまでの遅延(ms)。min..max のランダム（機械的でない）。
export function nextBlinkDelayMs(rng: Rng, cfg = AVATAR_BLINK): number {
  const r = clamp01(rng())
  return Math.round(cfg.minIntervalMs + r * (cfg.maxIntervalMs - cfg.minIntervalMs))
}

// 稀に二回連続の瞬き（自然さ）。
export function isDoubleBlink(rng: Rng, cfg = AVATAR_BLINK): boolean {
  return clamp01(rng()) < cfg.doubleBlinkProbability
}

// 次の頷き判定までの遅延(ms)。listening のみ呼ぶ想定。
export function nextNodDelayMs(rng: Rng, cfg = AVATAR_NOD): number {
  const r = clamp01(rng())
  return Math.round(cfg.minIntervalMs + r * (cfg.maxIntervalMs - cfg.minIntervalMs))
}

// 間隔到達時に実際に頷くか（確率・延々頷かない）。
export function shouldNodNow(rng: Rng, cfg = AVATAR_NOD): boolean {
  return clamp01(rng()) < cfg.nodProbability
}

// blink/nod を許可する状態か（fail-safe）。
//   - 瞬きは speaking/listening/neutral で可（連続しすぎない）。ending/未接続では止める。
//   - 頷きは listening のときだけ。
export type AvatarVisualState = 'neutral' | 'speaking' | 'listening'
export function blinkAllowed(state: AvatarVisualState, reducedMotion: boolean): boolean {
  return !reducedMotion
}
export function nodAllowed(state: AvatarVisualState, reducedMotion: boolean): boolean {
  return !reducedMotion && state === 'listening'
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0
}

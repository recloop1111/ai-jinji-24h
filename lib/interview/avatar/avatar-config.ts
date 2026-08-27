// PR: Lightweight Realtime Avatar の設定 SoT（magic number を page/component に散在させない）。
//   すべてブラウザ内処理・外部 API 0・追加従量原価 0 を前提にした軽量パラメータ。
//   実 audio 品質・体感の最終調整は R1（実接続）で行う。ここは決定論的な既定値の唯一の入口。

// ── full-frame lipsync のゲート（synthetic visual QA の判定を反映・既定 OFF）──────────────────────────
//   採用 5 枚は independently-generated で、フレーム間で頭部/髪/視線/表情が口より大きくドリフトする
//   （QA: 可視顔域で 非口(額/目/髪)≈口帯の約3倍変化）。full-frame swap すると「口」より「顔全体がモーフ」して
//   見えるため、full-frame 方式は既定 OFF にする（speaking も neutral 静止＝顔が安定）。blink/breathing/nod は維持。
//   自然な口パクには「同一頭部・口のみ差分の登録済みアセット」または「口領域だけの overlay+alignment」が必要（別対応）。
//   ※ audio-analyzer / mouthState ロジックは温存し、本フラグを true にすれば full-frame 動作へ戻せる（実験用）。
export const AVATAR_FULLFRAME_LIPSYNC_ENABLED = false

// ── overlay lipsync のゲート（採用方式・既定 ON・追加原価 0）──────────────────────────────────────
//   full-frame swap（顔全体差替）ではなく「neutral 固定 base ＋ 口領域だけの透過 overlay」を重ねる方式。
//   base は常に neutral（目/髪/顔/肩/背景は不動＝顔全体モーフが起きない）。speaking かつ mouthState=small/medium/large
//   のときだけ、offline で neutral へ登録済みの口 overlay（楕円 feather・唇/開口のみ）を絶対座標で上に重ねる。
//   synthetic visual QA（顔クロップ比較）で「目/髪/輪郭は neutral と同一・口だけ自然に変化・矩形の継ぎ目なし」を確認済み。
//   audio-analyzer / mouthState / smoothing / fail-safe は full-frame と共通ロジックを再利用（overlay 描画に写像するだけ）。
//   OFF にすると speaking も neutral 静止（顔安定）へ退避＝アバター障害時の HARD fallback と同じ絵。
export const AVATAR_OVERLAY_LIPSYNC_ENABLED = true

// ── 音声→口の開き（mouth level）─────────────────────────────────────────────────────────────
export const AVATAR_AUDIO = {
  // AnalyserNode 設定（軽量）。fftSize は小さめ（負荷/遅延を抑える）。
  fftSize: 512,
  // ノイズ床: この RMS 未満は無音扱い（口を開けない）。マイク/回線ノイズで口が振動しないように。
  noiseFloorRms: 0.015,
  // ゲイン: RMS→0..1 正規化の感度。small voice でも反応しつつ過大にならない値。
  gain: 6.0,
  // 平滑化（フリッカー防止）: 立ち上がり(attack)は速め、立ち下がり(release)は遅め＝口パクが自然。
  //   level += (target - level) * coef。coef は 0..1（1 で即時）。dt 依存にせず frame ベースの軽量近似。
  attackCoef: 0.55, // 開くのは速い
  releaseCoef: 0.18, // 閉じるのはゆっくり
  // 最小保持: 一度開いたら最低これだけ保持してから閉じ始める（open/closed 高速往復の抑制）。
  minHoldMs: 90,
  // サンプリング間隔（ms）。rAF ベースだが処理間引きの目安（負荷/電池対策）。
  sampleIntervalMs: 50, // ~20fps で十分（口パクに 60fps は不要）
} as const

// 口の開き（連続値 0..1）→ 離散 mouth state（アセットが 4 段階のときの写像）。閾値は SoT に集約。
export const MOUTH_LEVEL_THRESHOLDS = {
  small: 0.12, // これ未満は closed
  medium: 0.4,
  large: 0.7,
} as const
export type MouthState = 'closed' | 'small' | 'medium' | 'large'

// ── 瞬き（blink）────────────────────────────────────────────────────────────────────────────
export const AVATAR_BLINK = {
  minIntervalMs: 2600, // 次の瞬きまでの最小
  maxIntervalMs: 6200, // 最大（ランダム幅で機械的にしない）
  blinkDurationMs: 130, // 閉じている時間（短い）
  doubleBlinkProbability: 0.12, // 稀に二回連続（自然さ）
} as const

// ── 頷き（nod・listening のみ）──────────────────────────────────────────────────────────────
export const AVATAR_NOD = {
  minIntervalMs: 5000, // 頷きの最小間隔（毎回・機械的にしない）
  maxIntervalMs: 12000,
  nodProbability: 0.6, // 間隔到達時に実際に頷く確率（延々頷かない）
  nodDurationMs: 700, // 1 回の頷きの長さ（小さくゆっくり）
} as const

// ── 呼吸/微動（breathing・全状態・CSS transform のみ）──────────────────────────────────────────
export const AVATAR_BREATHING = {
  periodMs: 4600, // ゆっくり
  scaleAmplitude: 0.012, // ごく僅か（酔わない・顔が大きく動かない）
  translateYpx: 1.2, // ごく僅かな上下
} as const

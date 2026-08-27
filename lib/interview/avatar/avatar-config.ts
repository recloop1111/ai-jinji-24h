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

// ── overlay 方式の種類（QA 比較用の feature flag・Human QA 後に正式確定）─────────────────────────────
//   'lowerface' = neutral 固定 base ＋「下顔面（人中〜顎・口角外側少し）」の color-matched overlay（採用候補）。
//     口だけでなく顎/口角/下頬の自然な動きを取り込み、各 mouth source の肌色差を Lab 統計で neutral へ補正する
//     （synthetic 定量 QA: ROI 外の顔=画素差 0 / lower-face skin ΔE≈1.5＝知覚困難 / 口 region は state ごとに明確変化）。
//   'mouth' = 従来の「口領域だけ」の極小 overlay（より単純だが顎/口角が固定＝腹話術的になりやすい・肌色差が残る）。
//   AVATAR_OVERLAY_LIPSYNC_ENABLED を master ON/OFF、本 mode を「どちらの overlay を描くか」に用いる。
//   いきなり lowerface へ固定せず、両方式を切替えて Human QA で比較できる構造を維持する（正式採用は QA 後）。
export type AvatarLipsyncMode = 'lowerface' | 'mouth'
export const AVATAR_LIPSYNC_MODE: AvatarLipsyncMode = 'lowerface'

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

// ── Synthetic Avatar Driver v2（demo 企業限定・音声なし・UI/Avatar QA 用）───────────────────────────────
//   【v2 の要点】v1 は mouthState を 110–240ms で直接ランダム選択＝「パパパ」高速で機械的だった。
//   v2 は mouthState を直接選ばず、日本語発話に近い **synthetic speech energy envelope（phrase/pause）** を生成し、
//   本番 actual と同じ pipeline（energy → smoothLevel(attack/release) → mouthStateForLevel）へ通す。
//   → demo と actual で mouth mapping/smoothing を共有し、demo を actual 挙動へ近づける。
//   ロジック = lib/interview/avatar/synthetic-lipsync.ts（seed 可能な純関数＝test で決定的）。
export const AVATAR_SYNTHETIC = {
  // envelope のサンプリング間隔（本番の AVATAR_AUDIO.sampleIntervalMs と揃える。~20fps）。
  sampleIntervalMs: 50,
  // phrase（短い発話の波）: 1–4 秒程度・ランダム幅。
  phraseMinMs: 1000,
  phraseMaxMs: 4000,
  // short pause（語間・句の切れ目）: energy=0＝口 closed。
  shortPauseMinMs: 80,
  shortPauseMaxMs: 300,
  // sentence pause（文の区切り）: より長い closed。
  sentencePauseMinMs: 350,
  sentencePauseMaxMs: 900,
  // 文末（sentence pause）へ至る確率（それ以外は short pause）。
  sentenceEndProbability: 0.35,
  // syllable（音節）の口の開閉リズム（phrase 内の小さな上下）。人が喋る程度。
  syllablePeriodMinMs: 150,
  syllablePeriodMaxMs: 260,
  // phrase の energy ピーク: 基本は small/medium 中心（0.3–0.5）。強い発音のときだけ large 域（>0.7）。
  phrasePeakMin: 0.32,
  phrasePeakMax: 0.5,
  strongPhraseProbability: 0.18, // 稀に強い phrase（large を出す）
  strongPhrasePeakMin: 0.72,
  strongPhrasePeakMax: 0.92,
  // 可視 mouthState の最小保持（境界チャタリング防止・envelope が緩やかなので保険）。
  visibleMinHoldMs: 160,
} as const

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
//   ※ v3: 外枠の円は動かさず、内側 CharacterStage(.iv-stage) だけに適用する。写実人物で「拡大縮小」に見えない最小値へ。
//   実 CSS の値は InterviewerAvatar の <style>（@keyframes iv-stage-breathe）に集約（scale ≤0.4%・上下 ≤0.8px・回転なし）。
//   本定数は設計意図の記録（現状 JS からは参照しない）。
export const AVATAR_BREATHING = {
  periodMs: 4800, // ゆっくり
  scaleAmplitude: 0.004, // ごく僅か（写実人物で拡大縮小に見えない最小値）
  translateYpx: 0.8, // ごく僅かな上下
} as const

// ── ごく僅かな頭の微動（speaking の phrase 境界で稀に・落ち着いた面接官）──────────────────────────────
//   毎 phrase ではなく稀に・一定周期にしない。breathing と重なってフワフワしない範囲（very subtle）。
//   ※ v3: 回転はしない（写真全体を傾けない）。実 transform は CSS(@keyframes iv-stage-head)＝translateY≤1.2px＋微 scale・回転なし。
export const AVATAR_HEAD = {
  minIntervalMs: 3500, // 次の頭微動までの最小
  maxIntervalMs: 9000, // 最大（ランダム幅）
  probability: 0.5, // 間隔到達時に実際に動かす確率（毎回やらない）
  durationMs: 800, // 1 回の長さ（500–1000ms 程度・CSS animation と一致）
} as const

// 環境確認（カメラ映像内の顔フレーミング + 明るさ）の純ロジック。DOM/カメラ/モデル非依存。
//
// プライバシー: ここで扱うのは「顔がフレーム内に適切に映っているか」の判定と bounding box の比率のみ。
//   本人特定/顔認証/embedding/属性(年齢・性別・人種・感情)推定は一切行わない。顔画像/frame/box を保存・送信しない。

export type BrightnessStatus = 'checking' | 'ok' | 'dark'

// 顔フレーミングの安定判定: 「適正に映っている(framing OK)」状態が約1秒連続 → verified。
//   debounce で一瞬 framing NG になっても即戻さない。1.5〜2.5秒程度 NG が続いたら未確認へ戻す。
export const FACE_VERIFY_SUSTAINED_MS = 1000 // framing OK がこの時間連続したら verified
export const FACE_LOSS_DEBOUNCE_MS = 2000 // verified 後、framing NG がこの時間連続 → 未確認へ戻す（1.5〜2.5s 帯）

export interface FaceStabilityState {
  verified: boolean
  presentSinceMs: number | null // 連続 framing OK の開始時刻
  absentSinceMs: number | null // 連続 framing NG の開始時刻
}
export function initFaceStability(): FaceStabilityState {
  return { verified: false, presentSinceMs: null, absentSinceMs: null }
}
// 1 フレームの判定で状態遷移（純関数）。faceDetected は「当該時刻に顔が適正に映っていたか(framing OK)」。
export function updateFaceStability(
  state: FaceStabilityState,
  input: { faceDetected: boolean; nowMs: number; sustainedMs?: number; lossDebounceMs?: number },
): FaceStabilityState {
  const sustained = input.sustainedMs ?? FACE_VERIFY_SUSTAINED_MS
  const loss = input.lossDebounceMs ?? FACE_LOSS_DEBOUNCE_MS
  if (input.faceDetected) {
    const presentSince = state.presentSinceMs ?? input.nowMs
    const verified = state.verified || input.nowMs - presentSince >= sustained
    return { verified, presentSinceMs: presentSince, absentSinceMs: null }
  }
  const absentSince = state.absentSinceMs ?? input.nowMs
  // 一瞬の NG（debounce 内）では verified を維持（UI ちらつき防止）。長時間 NG で false へ戻す。
  const verified = state.verified && input.nowMs - absentSince < loss
  return { verified, presentSinceMs: null, absentSinceMs: absentSince }
}

// 明るさ分類（平均輝度 0-255）。dark は「警告のみ」で blocking しない。
export const BRIGHTNESS_DARK_THRESHOLD = 55
export function classifyBrightness(luminance: number): BrightnessStatus {
  if (!Number.isFinite(luminance) || luminance < 0) return 'checking'
  return luminance < BRIGHTNESS_DARK_THRESHOLD ? 'dark' : 'ok'
}

// ─────────────────────────────────────────────────────────────────────────────
// 顔フレーミング判定（presence だけでなく「顔全体が面接に適した状態で映っているか」）
//   BlazeFace / MediaPipe FaceDetector の bounding box を normalized coordinate（0-1 比率）化して判定する。
//   すべて調整可能な pure constants。判定は純関数（実カメラ/モデル非依存でテスト可能）。
// ─────────────────────────────────────────────────────────────────────────────
export type FaceFraming =
  | 'none' // 顔が検出されていない
  | 'cut' // 顔 bounding box が画面端で切れている（safe zone にはみ出し/接触）
  | 'too_far' // 顔が小さすぎる（遠すぎる）
  | 'too_close' // 顔が大きすぎる（近すぎる）
  | 'off_center' // 顔中心が画面の極端な端に寄っている
  | 'ok' // 適正

// bounding box の各比率（0-1）。x/y は frame 左上原点。min/max は端、center は中心。
export interface FaceBox {
  xMinRatio: number
  yMinRatio: number
  xMaxRatio: number
  yMaxRatio: number
  widthRatio: number
  heightRatio: number
  centerXRatio: number
  centerYRatio: number
}

// safe zone: box が frame 端から最低このぶん内側に無ければ「切れている」とみなす（3〜5% 帯）。
export const FACE_SAFE_MARGIN = 0.04
// 顔サイズ（frame 幅比）: 実用範囲。厳しすぎない初期値（BlazeFace の box 特性に合わせ調整可）。
export const FACE_MIN_WIDTH_RATIO = 0.15 // これ未満 → 遠すぎる
export const FACE_MAX_WIDTH_RATIO = 0.6 // これ超 → 近すぎる
// 顔中心の許容範囲（完全中央固定は不要・多少のズレは許容。極端な端のみ NG）。
export const FACE_CENTER_X_MIN = 0.25
export const FACE_CENTER_X_MAX = 0.75
export const FACE_CENTER_Y_MIN = 0.22
export const FACE_CENTER_Y_MAX = 0.8

// 顔フレーミングの分類（純関数）。box が無ければ 'none'。優先: 端切れ → サイズ → 位置。
export function classifyFaceFraming(box: FaceBox | null | undefined): FaceFraming {
  if (!box) return 'none'
  // 端で切れている（safe zone に接触・はみ出し。負値/1超も含む）。
  if (
    box.xMinRatio < FACE_SAFE_MARGIN ||
    box.yMinRatio < FACE_SAFE_MARGIN ||
    box.xMaxRatio > 1 - FACE_SAFE_MARGIN ||
    box.yMaxRatio > 1 - FACE_SAFE_MARGIN
  ) {
    return 'cut'
  }
  // サイズ
  if (box.widthRatio < FACE_MIN_WIDTH_RATIO) return 'too_far'
  if (box.widthRatio > FACE_MAX_WIDTH_RATIO) return 'too_close'
  // 位置（中心が極端な端）
  if (
    box.centerXRatio < FACE_CENTER_X_MIN ||
    box.centerXRatio > FACE_CENTER_X_MAX ||
    box.centerYRatio < FACE_CENTER_Y_MIN ||
    box.centerYRatio > FACE_CENTER_Y_MAX
  ) {
    return 'off_center'
  }
  return 'ok'
}

// 「顔全体が適正に映っている」か（verified の連続判定に渡す boolean）。
export function isFaceFramingOk(box: FaceBox | null | undefined): boolean {
  return classifyFaceFraming(box) === 'ok'
}

// フレーミング状態 → ユーザー向け案内（warning）。'ok'/'none' は null。
export function faceFramingMessage(f: FaceFraming): string | null {
  switch (f) {
    case 'cut':
      return '顔全体を映してください'
    case 'too_far':
      return 'カメラにもう少し近づいてください'
    case 'too_close':
      return 'カメラから少し離れてください'
    case 'off_center':
      return '顔が中央付近に映るよう調整してください'
    default:
      return null
  }
}

// 環境確認の進行条件: カメラ必須・マイク必須・発話確認必須・顔フレーミング確認必須。明るさは含めない（警告のみ）。
export function environmentCanProceed(input: {
  micStatus: 'loading' | 'ok' | 'error'
  cameraStatus: 'loading' | 'ok' | 'error'
  micTestPassed: boolean
  faceVerified: boolean
}): boolean {
  return (
    input.micStatus === 'ok' &&
    input.cameraStatus === 'ok' &&
    input.micTestPassed === true &&
    input.faceVerified === true
  )
}

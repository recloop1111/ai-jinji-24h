// 環境確認（カメラ映像内の顔存在 + 明るさ）の純ロジック。DOM/カメラ/モデル非依存。
//
// プライバシー: ここで扱うのは「顔がフレーム内に存在するか（present: boolean）」と bounding box の比率のみ。
//   本人特定/顔認証/embedding/属性(年齢・性別・人種・感情)推定は一切行わない。顔画像/frame/box を保存・送信しない。

export type FaceStatus = 'checking' | 'ok' | 'none' | 'error'
export type BrightnessStatus = 'checking' | 'ok' | 'dark'

// 顔検出の安定判定: 約1秒連続で検出 → verified。debounce で一瞬の消失では戻さない。長時間消失で未確認へ。
export const FACE_VERIFY_SUSTAINED_MS = 1000 // 連続検出でこの時間を超えたら verified
export const FACE_LOSS_DEBOUNCE_MS = 2500 // verified 後、連続でこの時間 顔無し → 未確認へ戻す

export interface FaceStabilityState {
  verified: boolean
  presentSinceMs: number | null // 連続検出の開始時刻
  absentSinceMs: number | null // 連続非検出の開始時刻
}
export function initFaceStability(): FaceStabilityState {
  return { verified: false, presentSinceMs: null, absentSinceMs: null }
}
// 1 フレームの検出結果で状態遷移（純関数）。faceDetected は当該時刻に顔が見えたか。
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
  // 一瞬の消失（debounce 内）では verified を維持。長時間消失で false へ戻す。
  const verified = state.verified && input.nowMs - absentSince < loss
  return { verified, presentSinceMs: null, absentSinceMs: absentSince }
}

// 明るさ分類（平均輝度 0-255）。dark は「警告のみ」で blocking しない。
export const BRIGHTNESS_DARK_THRESHOLD = 55
export function classifyBrightness(luminance: number): BrightnessStatus {
  if (!Number.isFinite(luminance) || luminance < 0) return 'checking'
  return luminance < BRIGHTNESS_DARK_THRESHOLD ? 'dark' : 'ok'
}

// 顔サイズ/位置の軽いガイダンス（blocking しない・warning のみ）。box は 0-1 比率。null=問題なし。
export function faceSizePositionGuidance(input: {
  widthRatio: number
  centerXRatio: number
  centerYRatio: number
}): string | null {
  if (input.widthRatio > 0 && input.widthRatio < 0.12) return 'カメラにもう少し近づいてください'
  if (
    input.centerXRatio < 0.2 ||
    input.centerXRatio > 0.8 ||
    input.centerYRatio < 0.15 ||
    input.centerYRatio > 0.85
  ) {
    return '顔全体が映る位置に調整してください'
  }
  return null
}

// 環境確認の進行条件: カメラ必須・マイク必須・発話確認必須・顔検出必須。明るさは含めない（警告のみ）。
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

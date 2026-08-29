// 完全ブラウザ内の「顔の存在＋フレーミング」検出（本人特定/顔認証/embedding/属性推定なし）。
//   @mediapipe/tasks-vision を lazy import（prepare 画面でだけ読み込む）。WASM/モデルは self-host の
//   ローカル静的アセット（/mediapipe/**）から取得＝カメラフレームは一切外部送信しない・追加API課金 0。
//   返すのは present:boolean と bounding box の比率のみ（画像/embedding は返さない・保存しない）。

import type { FaceBox } from './environment-check'

export interface FacePresenceResult {
  present: boolean
  box?: FaceBox
}

export interface FacePresenceDetector {
  detect(video: HTMLVideoElement, tsMs: number): FacePresenceResult
  close(): void
}

// self-host パス（public/mediapipe 以下）。CDN へは行かない。
const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/blaze_face_short_range.tflite'

// 失敗時は throw（呼び出し側は honest error＋retry。faceVerified への fail-open はしない）。
export async function createFacePresenceDetector(): Promise<FacePresenceDetector> {
  const vision = await import('@mediapipe/tasks-vision')
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH)
  const detector = await vision.FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATH },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.5,
  })
  return {
    detect(video: HTMLVideoElement, tsMs: number): FacePresenceResult {
      const w = video.videoWidth || 0
      const h = video.videoHeight || 0
      if (!w || !h) return { present: false }
      const res = detector.detectForVideo(video, tsMs)
      const d = res.detections?.[0]
      const bb = d?.boundingBox
      if (!bb) return { present: (res.detections?.length ?? 0) > 0 }
      // normalized 比率（端切れ判定のため min/max/height も算出。負値/1超もそのまま返す＝はみ出しを検出可能に）。
      const widthRatio = bb.width / w
      const heightRatio = bb.height / h
      const xMinRatio = bb.originX / w
      const yMinRatio = bb.originY / h
      return {
        present: true,
        box: {
          xMinRatio,
          yMinRatio,
          xMaxRatio: xMinRatio + widthRatio,
          yMaxRatio: yMinRatio + heightRatio,
          widthRatio,
          heightRatio,
          centerXRatio: xMinRatio + widthRatio / 2,
          centerYRatio: yMinRatio + heightRatio / 2,
        },
      }
    },
    close() {
      try {
        detector.close()
      } catch {
        /* noop */
      }
    },
  }
}

// 環境確認（カメラ・マイクの確認）画面の「面接練習へ進む」ゲート（純ロジック・DOM/メディア非依存）。
//
// 正式仕様: 面接はカメラ・マイクともに必須。次へ進めるのは
//   micStatus === 'ok' AND cameraStatus === 'ok' AND micTestPassed === true をすべて満たすときだけ。
//   - マイクだけ正常でも進めない（カメラ必須）。
//   - カメラだけ正常でも進めない（マイクテスト必須）。
//   - video+audio 取得失敗時に audio-only fallback で「進行」しない（cameraStatus!=='ok' なら false）。

export type MediaStatus = 'loading' | 'ok' | 'error'

export function canProceedToInterview(input: {
  micStatus: MediaStatus
  cameraStatus: MediaStatus
  micTestPassed: boolean
}): boolean {
  return input.micStatus === 'ok' && input.cameraStatus === 'ok' && input.micTestPassed === true
}

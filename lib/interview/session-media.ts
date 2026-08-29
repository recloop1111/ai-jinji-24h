// 本番セッションのメディア要件（純ロジック）。正式仕様: カメラ・マイクともに必須。
//   live audio track AND live video track が揃って初めて面接を開始・継続できる。
//   カメラ取得失敗/切断時に「カメラ無しで継続」しない（honest blocking/reconnect を出す）。

export function isSessionMediaOk(input: { hasAudio: boolean; hasVideo: boolean }): boolean {
  return input.hasAudio === true && input.hasVideo === true
}

export type SessionMediaBlock = 'ok' | 'no_mic' | 'no_camera'
export function sessionMediaBlockReason(input: { hasAudio: boolean; hasVideo: boolean }): SessionMediaBlock {
  if (!input.hasAudio) return 'no_mic'
  if (!input.hasVideo) return 'no_camera'
  return 'ok'
}

// Phase I-5: カメラ/マイクのメディア制御ロジック（純ヘルパ＝単体テスト可能）。UI/React 非依存。
// getUserMedia は標準API中心に扱い、ブラウザ差（Chrome/Safari/Firefox/Edge）を吸収して応募者向け文言へ変換する。
// 方針: マイク=必須 / カメラ=任意。生の DOMException.message は表示しない。

export type MediaErrorKind =
  | 'denied' // 権限拒否（NotAllowedError / SecurityError）
  | 'notFound' // デバイス無し（NotFoundError / OverconstrainedError）
  | 'busy' // 使用中/読み取り不可（NotReadableError / AbortError＝別アプリ占有等）
  | 'unsupported' // getUserMedia 非対応 / 非セキュアコンテキスト
  | 'unknown'

export type MediaDeviceTarget = 'mic' | 'camera' | 'both'

// DOMException 等の name をブラウザ差を吸収して分類する。
export function classifyMediaError(err: unknown): MediaErrorKind {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError': // 旧 Chrome
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError': // 旧 Chrome
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'notFound'
    case 'NotReadableError':
    case 'TrackStartError': // 旧 Chrome（デバイス占有）
    case 'AbortError':
      return 'busy'
    case 'TypeError': // getUserMedia 呼び出し不可（非対応/非セキュア）
      return 'unsupported'
    default:
      return 'unknown'
  }
}

// 分類＋対象デバイスから応募者向けメッセージへ。色/生messageに依存しない明確な文言。
export function mediaErrorMessage(kind: MediaErrorKind, target: MediaDeviceTarget): string {
  const label = target === 'mic' ? 'マイク' : target === 'camera' ? 'カメラ' : 'カメラ・マイク'
  switch (kind) {
    case 'denied':
      return `${label}の使用が許可されていません。ブラウザ/端末の設定で許可してから、もう一度お試しください。`
    case 'notFound':
      return `${label}が見つかりません。接続を確認してから、もう一度お試しください。`
    case 'busy':
      return `${label}を他のアプリ（会議アプリ等）が使用中の可能性があります。他のアプリを閉じてから、もう一度お試しください。`
    case 'unsupported':
      return `お使いのブラウザでは${label}を利用できません。別のブラウザ（最新の Chrome / Safari など）でお試しください。`
    default:
      return `${label}を利用できませんでした。しばらくしてから、もう一度お試しください。`
  }
}

// getUserMedia が使えるか（非対応/非セキュアコンテキストの早期判定）。
export function isGetUserMediaSupported(nav?: Pick<Navigator, 'mediaDevices'> | undefined): boolean {
  const n = nav ?? (typeof navigator !== 'undefined' ? navigator : undefined)
  return !!n && !!n.mediaDevices && typeof n.mediaDevices.getUserMedia === 'function'
}

// MediaStream を安全に停止（null/二重停止でも crash しない）。
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* noop */
    }
  }
}

// 指定種別（audio/video）のトラックの enabled を一括設定（ミュート/カメラOFF）。
// track.enabled=false は「送出はするが無音/黒」＝将来 Realtime へ送る audio track とも矛盾しない
//（ミュート中は無音が OpenAI へ送られる）。stream を取り直さないのでトラック同一性を保つ。
export function setTracksEnabled(
  stream: MediaStream | null | undefined,
  kind: 'audio' | 'video',
  enabled: boolean,
): void {
  if (!stream) return
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()
  for (const t of tracks) t.enabled = enabled
}

// 指定種別の「生きている」トラックがあるか（切断＝ended を除外）。再取得要否の判定に使う。
export function hasLiveTrack(stream: MediaStream | null | undefined, kind: 'audio' | 'video'): boolean {
  if (!stream) return false
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()
  return tracks.some((t) => t.readyState === 'live')
}

// 非同期に取得（getUserMedia）したストリームの「保存 or 破棄」判定。
// mounted=false（取得完了前にアンマウント/破棄）なら stop して null を返す＝保存しない（カメラ/マイクを残さない）。
// mounted=true ならそのまま返す（呼び出し側が streamRef へ保存）。stopStream は null/二重安全。
export function commitOrStopStream(
  stream: MediaStream | null | undefined,
  mounted: boolean,
): MediaStream | null {
  if (!mounted) {
    stopStream(stream)
    return null
  }
  return stream ?? null
}

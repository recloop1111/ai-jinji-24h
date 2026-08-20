import { describe, it, expect, vi } from 'vitest'
import {
  classifyMediaError,
  mediaErrorMessage,
  isGetUserMediaSupported,
  stopStream,
  setTracksEnabled,
  hasLiveTrack,
} from './media'

// Phase I-5: メディア制御ロジック（ブラウザ差吸収・安全なトラック操作）。
const domErr = (name: string) => ({ name })

describe('classifyMediaError (ブラウザ差吸収)', () => {
  it('権限拒否 → denied（各ブラウザの name）', () => {
    for (const n of ['NotAllowedError', 'SecurityError', 'PermissionDeniedError']) {
      expect(classifyMediaError(domErr(n))).toBe('denied')
    }
  })
  it('デバイス無し → notFound', () => {
    for (const n of ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError', 'ConstraintNotSatisfiedError']) {
      expect(classifyMediaError(domErr(n))).toBe('notFound')
    }
  })
  it('占有/読み取り不可 → busy（別アプリ・Zoom等）', () => {
    for (const n of ['NotReadableError', 'TrackStartError', 'AbortError']) {
      expect(classifyMediaError(domErr(n))).toBe('busy')
    }
  })
  it('非対応/非セキュア（TypeError）→ unsupported', () => {
    expect(classifyMediaError(domErr('TypeError'))).toBe('unsupported')
  })
  it('不明/未知 → unknown（生 error に依存しない）', () => {
    expect(classifyMediaError(domErr('WeirdError'))).toBe('unknown')
    expect(classifyMediaError(null)).toBe('unknown')
    expect(classifyMediaError('boom')).toBe('unknown')
    expect(classifyMediaError(new Error('x'))).toBe('unknown')
  })
})

describe('mediaErrorMessage (応募者向け・生message非表示)', () => {
  it('対象デバイスの語を含む', () => {
    expect(mediaErrorMessage('denied', 'mic')).toContain('マイク')
    expect(mediaErrorMessage('denied', 'camera')).toContain('カメラ')
    expect(mediaErrorMessage('notFound', 'both')).toContain('カメラ・マイク')
  })
  it('kind ごとに異なる文言（詰まらせない案内）', () => {
    const msgs = new Set([
      mediaErrorMessage('denied', 'mic'),
      mediaErrorMessage('notFound', 'mic'),
      mediaErrorMessage('busy', 'mic'),
      mediaErrorMessage('unsupported', 'mic'),
      mediaErrorMessage('unknown', 'mic'),
    ])
    expect(msgs.size).toBe(5)
  })
})

describe('isGetUserMediaSupported', () => {
  it('mediaDevices.getUserMedia があれば true', () => {
    expect(isGetUserMediaSupported({ mediaDevices: { getUserMedia: () => {} } } as unknown as Navigator)).toBe(true)
  })
  it('無ければ false（非対応/非セキュア）', () => {
    expect(isGetUserMediaSupported({} as Navigator)).toBe(false)
    expect(isGetUserMediaSupported({ mediaDevices: {} } as unknown as Navigator)).toBe(false)
  })
})

// --- MediaStream/track のモック ---
function fakeTrack(kind: 'audio' | 'video', readyState: 'live' | 'ended' = 'live') {
  return { kind, readyState, enabled: true, stop: vi.fn() }
}
function fakeStream(tracks: ReturnType<typeof fakeTrack>[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  } as unknown as MediaStream
}

describe('stopStream (安全停止)', () => {
  it('全 track を stop（null/二重でも crash しない）', () => {
    const a = fakeTrack('audio')
    const v = fakeTrack('video')
    stopStream(fakeStream([a, v]))
    expect(a.stop).toHaveBeenCalledTimes(1)
    expect(v.stop).toHaveBeenCalledTimes(1)
    expect(() => stopStream(null)).not.toThrow()
    expect(() => stopStream(undefined)).not.toThrow()
  })
  it('stop が例外を投げても握りつぶす', () => {
    const t = { kind: 'audio', readyState: 'live', enabled: true, stop: () => { throw new Error('x') } }
    expect(() => stopStream(fakeStream([t as unknown as ReturnType<typeof fakeTrack>]))).not.toThrow()
  })
})

describe('setTracksEnabled (ミュート/カメラOFF・stream 取り直さない)', () => {
  it('audio のみ enabled を変更', () => {
    const a = fakeTrack('audio')
    const v = fakeTrack('video')
    const s = fakeStream([a, v])
    setTracksEnabled(s, 'audio', false)
    expect(a.enabled).toBe(false)
    expect(v.enabled).toBe(true)
    setTracksEnabled(s, 'video', false)
    expect(v.enabled).toBe(false)
  })
  it('null でも crash しない', () => {
    expect(() => setTracksEnabled(null, 'audio', false)).not.toThrow()
  })
})

describe('hasLiveTrack (切断検知/再取得要否)', () => {
  it('live トラックがあれば true', () => {
    expect(hasLiveTrack(fakeStream([fakeTrack('audio', 'live')]), 'audio')).toBe(true)
  })
  it('ended のみ / 無し → false', () => {
    expect(hasLiveTrack(fakeStream([fakeTrack('video', 'ended')]), 'video')).toBe(false)
    expect(hasLiveTrack(fakeStream([fakeTrack('audio', 'live')]), 'video')).toBe(false)
    expect(hasLiveTrack(null, 'audio')).toBe(false)
  })
})

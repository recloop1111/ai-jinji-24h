import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDisconnectController } from './realtime-client'

// PR-2 実装P2（Codex）: 一時的な WebRTC 'disconnected' で面接を確定終了しないための grace 制御。
// - 'failed' / 'closed'（終端）→ 即 onDisconnect
// - 'disconnected'（復旧可能）→ 8s grace。猶予内に 'connected' なら継続、超過で onDisconnect
// - onDisconnect は多重発火しない。close()/teardown（=clear）で grace timer を必ず解除
const GRACE = 8000

describe('createDisconnectController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // 1. disconnected → 8秒以内に connected へ復旧 → onDisconnect 非発火
  it('disconnected → grace 内に connected 復旧 → onDisconnect を呼ばない', () => {
    const onDisconnect = vi.fn()
    let state: RTCPeerConnectionState = 'connected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    state = 'disconnected'
    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(GRACE - 1) // まだ猶予内
    state = 'connected'
    ctl.handleStateChange('connected') // 復旧 → grace 解除

    vi.advanceTimersByTime(GRACE) // 元の timer が生きていれば発火してしまう
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  // 2. disconnected → grace 満了 → onDisconnect 1回だけ発火
  it('disconnected → grace 満了（復旧せず）→ onDisconnect を1回だけ発火', () => {
    const onDisconnect = vi.fn()
    const state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    ctl.handleStateChange('disconnected')
    expect(onDisconnect).not.toHaveBeenCalled() // まだ猶予中
    vi.advanceTimersByTime(GRACE)

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 3. failed → grace を待たず即 onDisconnect
  it('failed → 即 onDisconnect（grace を待たない）', () => {
    const onDisconnect = vi.fn()
    const ctl = createDisconnectController(() => 'failed', onDisconnect, GRACE)

    ctl.handleStateChange('failed')

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 4. closed → grace を待たず即 onDisconnect
  it('closed → 即 onDisconnect（grace を待たない）', () => {
    const onDisconnect = vi.fn()
    const ctl = createDisconnectController(() => 'closed', onDisconnect, GRACE)

    ctl.handleStateChange('closed')

    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 5. disconnected 中に close()（=clear）→ timer 解除、後から onDisconnect 非発火
  it('disconnected 中に clear() → grace timer 解除・後から発火しない', () => {
    const onDisconnect = vi.fn()
    const state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    ctl.handleStateChange('disconnected')
    ctl.clear() // teardown / unmount 相当

    vi.advanceTimersByTime(GRACE * 2)
    expect(onDisconnect).not.toHaveBeenCalled()
  })

  // 6. disconnected が複数回来ても timer 重複作成・二重発火しない
  it('disconnected が連続到来しても onDisconnect は1回だけ（timer 重複なし）', () => {
    const onDisconnect = vi.fn()
    const state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(1000)
    ctl.handleStateChange('disconnected') // 重複イベント（新規 timer を作らない）
    vi.advanceTimersByTime(1000)
    ctl.handleStateChange('disconnected')

    // 最初の disconnected から GRACE 経過時点で1回だけ発火（重複 timer なら複数回になる）
    vi.advanceTimersByTime(GRACE - 2000)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GRACE)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })

  // 7. disconnected → connected → 再度 disconnected で新しい grace timer が正常動作
  it('disconnected → connected 復旧 → 再 disconnected → 新しい grace で発火', () => {
    const onDisconnect = vi.fn()
    let state: RTCPeerConnectionState = 'disconnected'
    const ctl = createDisconnectController(() => state, onDisconnect, GRACE)

    // 1回目: 復旧して発火しない
    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(GRACE - 1)
    state = 'connected'
    ctl.handleStateChange('connected')
    vi.advanceTimersByTime(GRACE)
    expect(onDisconnect).not.toHaveBeenCalled()

    // 2回目: 新しい grace が張られ、復旧しなければ発火
    state = 'disconnected'
    ctl.handleStateChange('disconnected')
    vi.advanceTimersByTime(GRACE - 1)
    expect(onDisconnect).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
  })
})

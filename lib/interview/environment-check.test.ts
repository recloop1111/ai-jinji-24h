import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  initFaceStability,
  updateFaceStability,
  classifyBrightness,
  faceSizePositionGuidance,
  environmentCanProceed,
  FACE_VERIFY_SUSTAINED_MS,
} from './environment-check'

// 顔検出安定 + 明るさ + 進行条件を pure logic で固定。実カメラ/モデル非依存。

function runFace(seq: { detected: boolean; t: number }[]) {
  let s = initFaceStability()
  for (const f of seq) s = updateFaceStability(s, { faceDetected: f.detected, nowMs: f.t })
  return s
}

describe('顔検出の安定判定', () => {
  it('2. 顔検出1回だけでは verified にならない', () => {
    const s = runFace([{ detected: true, t: 0 }])
    expect(s.verified).toBe(false)
  })
  it('3. 約1秒連続検出で verified=true', () => {
    const s = runFace([
      { detected: true, t: 0 },
      { detected: true, t: 500 },
      { detected: true, t: FACE_VERIFY_SUSTAINED_MS },
    ])
    expect(s.verified).toBe(true)
  })
  it('4. 一瞬の消失では即 false にならない（debounce）', () => {
    const s0 = runFace([
      { detected: true, t: 0 },
      { detected: true, t: 1000 },
    ])
    expect(s0.verified).toBe(true)
    const s1 = updateFaceStability(s0, { faceDetected: false, nowMs: 1300 }) // 300ms 消失
    expect(s1.verified).toBe(true)
  })
  it('5. 長時間 顔無しで verified=false へ戻る', () => {
    let s = runFace([
      { detected: true, t: 0 },
      { detected: true, t: 1000 },
    ])
    s = updateFaceStability(s, { faceDetected: false, nowMs: 1300 })
    s = updateFaceStability(s, { faceDetected: false, nowMs: 1300 + 3000 }) // debounce 超過
    expect(s.verified).toBe(false)
  })
})

describe('環境確認 進行条件（顔必須・明るさ非必須）', () => {
  const base = { micStatus: 'ok' as const, cameraStatus: 'ok' as const, micTestPassed: true, faceVerified: true }
  it('1. camera OK でも顔無し(faceVerified=false) → proceed 不可', () => {
    expect(environmentCanProceed({ ...base, faceVerified: false })).toBe(false)
  })
  it('6. camera 無し → 顔検出を合格扱いにしない', () => {
    expect(environmentCanProceed({ ...base, cameraStatus: 'error', faceVerified: true })).toBe(false)
  })
  it('7. mic ok + camera ok + micTestPassed + faceVerified → proceed 可能', () => {
    expect(environmentCanProceed(base)).toBe(true)
  })
  it('mic未合格や camera 未確立では不可', () => {
    expect(environmentCanProceed({ ...base, micTestPassed: false })).toBe(false)
    expect(environmentCanProceed({ ...base, micStatus: 'loading' })).toBe(false)
  })
})

describe('明るさ（警告のみ・blocking しない）', () => {
  it('9. dark 判定', () => {
    expect(classifyBrightness(20)).toBe('dark')
  })
  it('10. normal 判定', () => {
    expect(classifyBrightness(120)).toBe('ok')
  })
  it('8. brightness dark でも proceed 可能（進行条件に含めない）', () => {
    // environmentCanProceed は brightness を引数に取らない＝dark でも他条件を満たせば true。
    expect(environmentCanProceed({ micStatus: 'ok', cameraStatus: 'ok', micTestPassed: true, faceVerified: true })).toBe(true)
  })
})

describe('顔サイズ/位置ガイダンス（warning のみ）', () => {
  it('極端に小さい → 近づく案内', () => {
    expect(faceSizePositionGuidance({ widthRatio: 0.08, centerXRatio: 0.5, centerYRatio: 0.5 })).toContain('近づいて')
  })
  it('大きく画面外 → 位置調整案内', () => {
    expect(faceSizePositionGuidance({ widthRatio: 0.3, centerXRatio: 0.05, centerYRatio: 0.5 })).toContain('位置に調整')
  })
  it('中央・適切サイズ → null', () => {
    expect(faceSizePositionGuidance({ widthRatio: 0.3, centerXRatio: 0.5, centerYRatio: 0.5 })).toBeNull()
  })
})

describe('prepare/page.tsx: 顔検出/明るさ配線＋fail-open なし＋プライバシー', () => {
  const PAGE = readFileSync(join(process.cwd(), 'app/interview/[slug]/prepare/page.tsx'), 'utf8')
  it('11. detector load 失敗で faceVerified=true にしない（fail-open なし）', () => {
    // catch 節で setFaceVerified(true) をしない。
    expect(PAGE).not.toMatch(/catch[\s\S]{0,240}setFaceVerified\(true\)/)
    // 進行は environmentCanProceed（faceVerified 必須）
    expect(PAGE).toContain('environmentCanProceed')
  })
  it('12. 顔画像/frame/box を network/storage へ保存・送信しない（toDataURL/toBlob+fetch/POST が無い）', () => {
    expect(PAGE).not.toContain('toDataURL')
    expect(PAGE).not.toContain('toBlob')
    // canvas を fetch/POST で送るコードが無い
    expect(PAGE).not.toMatch(/fetch\([^)]*(canvas|frame|face|image)/i)
  })
  it('顔検出は environment-check の updateFaceStability を使用', () => {
    expect(PAGE).toContain('updateFaceStability')
    expect(PAGE).toContain('classifyBrightness')
  })
})

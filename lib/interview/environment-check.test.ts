import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  initFaceStability,
  updateFaceStability,
  classifyBrightness,
  classifyFaceFraming,
  isFaceFramingOk,
  faceFramingMessage,
  environmentCanProceed,
  FACE_VERIFY_SUSTAINED_MS,
  type FaceBox,
} from './environment-check'

// 顔フレーミング（存在＋全体が適正に映っているか）＋安定 + 明るさ + 進行条件を pure logic で固定。実カメラ/モデル非依存。

// 中心・適正サイズ・端に余裕のある「良い」box。各テストで一部だけ崩す。
function box(overrides: Partial<FaceBox> = {}): FaceBox {
  const base: FaceBox = {
    xMinRatio: 0.35,
    yMinRatio: 0.28,
    xMaxRatio: 0.65,
    yMaxRatio: 0.72,
    widthRatio: 0.3,
    heightRatio: 0.44,
    centerXRatio: 0.5,
    centerYRatio: 0.5,
  }
  return { ...base, ...overrides }
}

// framing OK/NG の連続列から安定状態を作る。
function runFraming(seq: { ok: boolean; t: number }[]) {
  let s = initFaceStability()
  for (const f of seq) s = updateFaceStability(s, { faceDetected: f.ok, nowMs: f.t })
  return s
}

describe('顔フレーミング分類（存在だけでなく「全体が適正に映っている」か）', () => {
  it('適正な box → ok', () => {
    expect(classifyFaceFraming(box())).toBe('ok')
    expect(isFaceFramingOk(box())).toBe(true)
  })
  it('1. 下端で切れている（yMax がフレーム下端へはみ出し）→ ok にしない（cut）', () => {
    expect(classifyFaceFraming(box({ yMaxRatio: 1.05, centerYRatio: 0.8 }))).toBe('cut')
    expect(isFaceFramingOk(box({ yMaxRatio: 1.05, centerYRatio: 0.8 }))).toBe(false)
  })
  it('2. 上端で切れている（yMin < safe margin）→ cut', () => {
    expect(classifyFaceFraming(box({ yMinRatio: 0.01, centerYRatio: 0.25 }))).toBe('cut')
  })
  it('3. 左右端で切れている → cut', () => {
    expect(classifyFaceFraming(box({ xMinRatio: 0.01 }))).toBe('cut') // 左
    expect(classifyFaceFraming(box({ xMaxRatio: 0.99 }))).toBe('cut') // 右
  })
  it('4. 顔が極端に小さい（遠すぎる）→ too_far', () => {
    expect(classifyFaceFraming(box({ widthRatio: 0.1, xMinRatio: 0.45, xMaxRatio: 0.55 }))).toBe('too_far')
  })
  it('5. 顔が極端に大きい（近すぎる）→ too_close', () => {
    // 端は safe zone 内に収めつつ幅だけ過大 → サイズ超過で弾く。
    expect(
      classifyFaceFraming(box({ widthRatio: 0.7, xMinRatio: 0.14, xMaxRatio: 0.85, yMinRatio: 0.2, yMaxRatio: 0.75 })),
    ).toBe('too_close')
  })
  it('中心が極端な端 → off_center', () => {
    expect(classifyFaceFraming(box({ centerXRatio: 0.85 }))).toBe('off_center')
  })
  it('box 無し → none', () => {
    expect(classifyFaceFraming(null)).toBe('none')
    expect(classifyFaceFraming(undefined)).toBe('none')
    expect(isFaceFramingOk(undefined)).toBe(false)
  })
  it('10. Human QA 相当（顔下半分が frame 外・下端はみ出し）→ ok にしない → proceed 不可', () => {
    const qa = box({ yMaxRatio: 1.25, heightRatio: 0.7, centerYRatio: 0.9 })
    expect(classifyFaceFraming(qa)).toBe('cut')
    expect(isFaceFramingOk(qa)).toBe(false)
    // framing NG のままなので faceVerified は立たない → 進行不可。
    expect(environmentCanProceed({ micStatus: 'ok', cameraStatus: 'ok', micTestPassed: true, faceVerified: false })).toBe(false)
  })
})

describe('フレーミング案内メッセージ', () => {
  it('各 NG に対応した warning・ok/none は null', () => {
    expect(faceFramingMessage('cut')).toContain('顔全体')
    expect(faceFramingMessage('too_far')).toContain('近づいて')
    expect(faceFramingMessage('too_close')).toContain('離れて')
    expect(faceFramingMessage('off_center')).toContain('中央')
    expect(faceFramingMessage('ok')).toBeNull()
    expect(faceFramingMessage('none')).toBeNull()
  })
})

describe('顔フレーミングの安定判定（framing OK が約1秒安定・hysteresis）', () => {
  it('framing OK 1回だけでは verified にならない', () => {
    expect(runFraming([{ ok: true, t: 0 }]).verified).toBe(false)
  })
  it('6. 適正 framing が約1秒安定 → verified=true', () => {
    const s = runFraming([
      { ok: true, t: 0 },
      { ok: true, t: 500 },
      { ok: true, t: FACE_VERIFY_SUSTAINED_MS },
    ])
    expect(s.verified).toBe(true)
  })
  it('7. framing NG が一瞬 → 即 false にならない（debounce）', () => {
    const s0 = runFraming([
      { ok: true, t: 0 },
      { ok: true, t: 1000 },
    ])
    expect(s0.verified).toBe(true)
    const s1 = updateFaceStability(s0, { faceDetected: false, nowMs: 1300 }) // 300ms NG
    expect(s1.verified).toBe(true)
  })
  it('8. framing NG が一定時間継続 → verified=false へ戻る', () => {
    let s = runFraming([
      { ok: true, t: 0 },
      { ok: true, t: 1000 },
    ])
    s = updateFaceStability(s, { faceDetected: false, nowMs: 1300 })
    s = updateFaceStability(s, { faceDetected: false, nowMs: 1300 + 2500 }) // debounce 超過
    expect(s.verified).toBe(false)
  })
})

describe('環境確認 進行条件（顔必須・明るさ非必須）', () => {
  const base = { micStatus: 'ok' as const, cameraStatus: 'ok' as const, micTestPassed: true, faceVerified: true }
  it('camera OK でも顔未確認(faceVerified=false) → proceed 不可', () => {
    expect(environmentCanProceed({ ...base, faceVerified: false })).toBe(false)
  })
  it('camera 無し → 顔を合格扱いにしない', () => {
    expect(environmentCanProceed({ ...base, cameraStatus: 'error', faceVerified: true })).toBe(false)
  })
  it('mic ok + camera ok + micTestPassed + faceVerified → proceed 可能', () => {
    expect(environmentCanProceed(base)).toBe(true)
  })
  it('mic未合格や camera 未確立では不可', () => {
    expect(environmentCanProceed({ ...base, micTestPassed: false })).toBe(false)
    expect(environmentCanProceed({ ...base, micStatus: 'loading' })).toBe(false)
  })
})

describe('明るさ（警告のみ・blocking しない）', () => {
  it('dark 判定', () => {
    expect(classifyBrightness(20)).toBe('dark')
  })
  it('normal 判定', () => {
    expect(classifyBrightness(120)).toBe('ok')
  })
  it('9. brightness dark でも framing/mic/camera OK なら proceed 可能（進行条件に含めない）', () => {
    // environmentCanProceed は brightness を引数に取らない＝dark でも他条件を満たせば true。
    expect(environmentCanProceed({ micStatus: 'ok', cameraStatus: 'ok', micTestPassed: true, faceVerified: true })).toBe(true)
  })
})

describe('prepare/page.tsx: 顔フレーミング/明るさ配線＋fail-open なし＋プライバシー', () => {
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
  it('顔確認は framing 分類（classifyFaceFraming）＋安定（updateFaceStability）＋明るさ（classifyBrightness）を使用', () => {
    expect(PAGE).toContain('classifyFaceFraming')
    expect(PAGE).toContain('updateFaceStability')
    expect(PAGE).toContain('classifyBrightness')
  })
})

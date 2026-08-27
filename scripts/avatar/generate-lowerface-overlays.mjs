// Lower-Face overlay 生成（offline・生成 AI 不使用）— mouth-only overlay の改善版（採用候補）。
//
// 目的: 「口領域だけ」ではなく「発話で実際に動く下顔面（人中〜顎・口角外側少し・下頬最小限）」を neutral 固定 base へ
//   重ねる。口だけでなく顎/口角/下頬の自然な動きを取り込みつつ、各 mouth source の下顔面**肌色差**を neutral へ
//   color-match して「overlay ON/OFF で肌色が変わったと感じない」状態にする（唇/歯/口腔＝mouth semantic は保持）。
//
// 方針（すべて sharp による決定論的処理・生成 AI / 画像合成 AI は不使用）:
//   1. registration: 各 mouth frame を neutral へ並進登録（ROI 外周ring・口除外で SSD 最小化）。過剰な face warp はしない。
//   2. color matching: ROI 内 skin（口を除外）で neutral と source の per-channel mean/std を取り、
//      corr = (src-tmean)*gain + nmean（gain=clip(nstd/tstd,0.7,1.4)）で source-skin を neutral-skin へ寄せる。
//   3. mouth preservation: 口 semantic 楕円内は color 補正を 0（source 保持）＝歯/口腔の暗部/唇色を潰さない。skin だけ補正。
//   4. mask: Lower-Face ROI に organic 楕円 feather（hard rectangle 禁止）。境界（頬/顎/人中）が見えないよう最低限の feather。
//
// 入力（gitignore 済の元 PNG・配信不要）: public/images/interviewer/lipsync-source/
//   ai-interviewer-neutralのコピー.png（基準）/ ai-interviewer-mouth-{small,medium,large}.png
// 出力（tracked・配信）: public/images/interviewer/ai-interviewer-lowerface-{small,medium,large}-overlay.webp
//
// 実行: node scripts/avatar/generate-lowerface-overlays.mjs
//   ※ 元 PNG が無い環境では実行不要（生成済 webp をコミット済み）。再生成時のみ lipsync-source を用意して実行。

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(ROOT, 'package.json'))
const sharp = require('sharp')

const SRC = path.join(ROOT, 'public/images/interviewer/lipsync-source/')
const OUT = path.join(ROOT, 'public/images/interviewer/')
const neutralFile = 'ai-interviewer-neutralのコピー.png'
const frames = {
  small: 'ai-interviewer-mouth-small.png',
  medium: 'ai-interviewer-mouth-medium.png',
  large: 'ai-interviewer-mouth-large.png',
}

// ROI = Lower-Face（人中〜顎・口角外側少し）。MOUTH = 口 semantic（唇/歯/口腔＝color 補正の対象外・source 保持）。
const ROI = { x: 0.5, y: 0.415, rx: 0.135, ry: 0.09 }
const MOUTH = { x: 0.5, y: 0.38, rx: 0.09, ry: 0.05 }

async function rgb(p) {
  const { data, info } = await sharp(SRC + p).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, info }
}

async function main() {
  const N = await rgb(neutralFile)
  const W = N.info.width
  const H = N.info.height
  const cx = ROI.x * W
  const cy = ROI.y * H
  const rx = ROI.rx * W
  const ry = ROI.ry * H
  const mcx = MOUTH.x * W
  const mcy = MOUTH.y * H
  const mrx = MOUTH.rx * W
  const mry = MOUTH.ry * H

  const roiR = (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry)
  const mouthR = (x, y) => Math.hypot((x - mcx) / mrx, (y - mcy) / mry)
  // ROI overlay alpha: r<=0.72 不透明, 0.72-1.0 feather（境界を見せない最低限）。
  const roiAlpha = (x, y) => {
    const r = roiR(x, y)
    if (r >= 1) return 0
    if (r <= 0.72) return 255
    return Math.round(255 * (1 - (r - 0.72) / 0.28))
  }
  // skin 補正マスク: 口 core(<=0.85)=0（source保持）, >=1.15=1（skin全補正）, 間 feather。
  const skinCorrect = (x, y) => {
    const r = mouthR(x, y)
    if (r <= 0.85) return 0
    if (r >= 1.15) return 1
    return (r - 0.85) / 0.3
  }

  // registration（translation・ROI 内かつ口周辺を除いた skin で SSD 最小化）。
  function ssd(T, dx, dy) {
    let s = 0
    let n = 0
    const y0 = Math.floor((ROI.y - 0.11) * H)
    const y1 = Math.floor((ROI.y + 0.11) * H)
    const x0 = Math.floor((ROI.x - 0.17) * W)
    const x1 = Math.floor((ROI.x + 0.17) * W)
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        if (roiR(x, y) > 1) continue
        if (mouthR(x, y) < 1.1) continue
        const sx = x + dx
        const sy = y + dy
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue
        const i = (y * W + x) * 3
        const j = (sy * W + sx) * 3
        for (let c = 0; c < 3; c++) {
          const d = N.data[i + c] - T.data[j + c]
          s += d * d
        }
        n++
      }
    }
    return s / n
  }
  function best(T) {
    let b = { dx: 0, dy: 0, e: Infinity }
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const e = ssd(T, dx, dy)
        if (e < b.e) b = { dx, dy, e }
      }
    }
    return b
  }

  // skin 統計（ROI 内 & 口除外）: per-channel mean/std。
  function skinStats(A, shift) {
    const sum = [0, 0, 0]
    const sq = [0, 0, 0]
    let n = 0
    const y0 = Math.floor((ROI.y - 0.11) * H)
    const y1 = Math.floor((ROI.y + 0.11) * H)
    const x0 = Math.floor((ROI.x - 0.17) * W)
    const x1 = Math.floor((ROI.x + 0.17) * W)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (roiR(x, y) > 0.95) continue
        if (mouthR(x, y) < 1.2) continue
        const sx = x + (shift ? shift.dx : 0)
        const sy = y + (shift ? shift.dy : 0)
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue
        const j = (sy * W + sx) * 3
        for (let c = 0; c < 3; c++) {
          const v = A.data[j + c]
          sum[c] += v
          sq[c] += v * v
        }
        n++
      }
    }
    const mean = sum.map((s) => s / n)
    const std = sq.map((s, c) => Math.sqrt(Math.max(1, s / n - mean[c] * mean[c])))
    return { mean, std }
  }

  for (const [name, file] of Object.entries(frames)) {
    const T = await rgb(file)
    const { dx, dy, e } = best(T)
    const ns = skinStats(N, null)
    const ts = skinStats(T, { dx, dy })
    const gain = ts.std.map((s, c) => Math.min(1.4, Math.max(0.7, ns.std[c] / s)))
    const out = Buffer.alloc(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        const a = roiAlpha(x, y)
        if (a === 0) {
          out[o + 3] = 0
          continue
        }
        const sx = x + dx
        const sy = y + dy
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) {
          out[o + 3] = 0
          continue
        }
        const j = (sy * W + sx) * 3
        const sc = skinCorrect(x, y)
        for (let c = 0; c < 3; c++) {
          const v = T.data[j + c]
          const corr = (v - ts.mean[c]) * gain[c] + ns.mean[c]
          out[o + c] = Math.max(0, Math.min(255, v * (1 - sc) + corr * sc))
        }
        out[o + 3] = a
      }
    }
    const nm = `ai-interviewer-lowerface-${name}-overlay.webp`
    await sharp(out, { raw: { width: W, height: H, channels: 4 } })
      .webp({ quality: 90, alphaQuality: 92 })
      .toFile(OUT + nm)
    console.log(`${nm}: shift(${dx},${dy}) SSD=${e.toFixed(0)} gain[${gain.map((g) => g.toFixed(2)).join(',')}]`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

// eyes-closed overlay 生成（offline・生成 AI 不使用）— Natural Motion v2 の独立 Eye Layer 用。
//
// 目的: neutral（目開き）base の上に「目だけ閉じた差分」を透過 overlay として重ねられるようにする。
//   これで speaking 中に mouth=open と eyes=closed を同時成立させ、「口だけ動いて目が固定」の不自然さを解消する。
//
// 方針（sharp のみ・決定論的・生成 AI 不使用）:
//   - 目領域は neutral vs blink の diff 重心で実測（x≈0.486 / y≈0.258）。両目を覆う横長楕円 feather。
//   - blink フレーム（目閉じ）の当該領域を neutral へ並進登録（目周りの ring で SSD 最小化）し、楕円 feather で切り出す。
//   - 眉/髪/鼻には掛けない（楕円を目の高さに限定）。透過 full-canvas 1024×1536。
//
// 入力（gitignore 済 PNG）: lipsync-source/ai-interviewer-neutralのコピー.png・ai-interviewer-blink.png
// 出力（tracked）: public/images/interviewer/ai-interviewer-eyes-closed-overlay.webp
// 実行: node scripts/avatar/generate-eyes-overlay.mjs

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(ROOT, 'package.json'))
const sharp = require('sharp')

const SRC = path.join(ROOT, 'public/images/interviewer/lipsync-source/')
const OUT = path.join(ROOT, 'public/images/interviewer/')
const neutralFile = 'ai-interviewer-neutralのコピー.png'
const blinkFile = 'ai-interviewer-blink.png'

// 両目を覆う横長楕円（眉/髪/鼻に掛けない高さに限定）。
const EYES = { x: 0.5, y: 0.262, rx: 0.2, ry: 0.05 }

async function rgb(p) {
  const { data, info } = await sharp(SRC + p).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, info }
}

async function main() {
  const N = await rgb(neutralFile)
  const T = await rgb(blinkFile)
  const W = N.info.width
  const H = N.info.height
  const cx = EYES.x * W
  const cy = EYES.y * H
  const rx = EYES.rx * W
  const ry = EYES.ry * H
  const eR = (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry)
  // overlay alpha: r<=0.7 不透明, 0.7-1.0 feather。
  const alpha = (x, y) => {
    const r = eR(x, y)
    if (r >= 1) return 0
    if (r <= 0.7) return 255
    return Math.round(255 * (1 - (r - 0.7) / 0.3))
  }

  // registration（translation・目楕円の外周 ring で SSD 最小化＝目そのものは除外）。
  function ssd(dx, dy) {
    let s = 0
    let n = 0
    const y0 = Math.floor((EYES.y - 0.07) * H)
    const y1 = Math.floor((EYES.y + 0.07) * H)
    const x0 = Math.floor((EYES.x - 0.24) * W)
    const x1 = Math.floor((EYES.x + 0.24) * W)
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const r = eR(x, y)
        if (r > 1 || r < 0.9) continue // ring のみ
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
  let best = { dx: 0, dy: 0, e: Infinity }
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const e = ssd(dx, dy)
      if (e < best.e) best = { dx, dy, e }
    }
  }

  const out = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      const a = alpha(x, y)
      if (a === 0) {
        out[o + 3] = 0
        continue
      }
      const sx = x + best.dx
      const sy = y + best.dy
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) {
        out[o + 3] = 0
        continue
      }
      const j = (sy * W + sx) * 3
      out[o] = T.data[j]
      out[o + 1] = T.data[j + 1]
      out[o + 2] = T.data[j + 2]
      out[o + 3] = a
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 92 })
    .toFile(OUT + 'ai-interviewer-eyes-closed-overlay.webp')
  console.log(`ai-interviewer-eyes-closed-overlay.webp: shift(${best.dx},${best.dy}) SSD=${best.e.toFixed(0)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

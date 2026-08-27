// 口 overlay 生成（offline・生成 AI 不使用）— Lightweight Realtime Avatar の採用方式（方式B）。
//
// 目的: 方式A の mouth フレーム（別個生成で頭部/髪/視線が口より大きくドリフト＝full-frame swap は判定 C）から、
//   「口領域だけ」を neutral へ並進登録し、楕円 feather マスクで切り出して**透過 overlay 3 枚**を作る。
//   これを neutral 固定 base に重ねる＝目/髪/顔/肩/背景は不動のまま口だけ動く（顔全体モーフを出さない）。
//
// 方針:
//   - 生成 AI / 画像合成 AI は一切使わない。sharp（Node 画像処理）による決定論的な並進登録＋楕円 feather のみ。
//   - 口中心は「neutral vs mouth-large の顔クロップ diff 重心」で実測（x0.50 / y0.38）。矩形の継ぎ目を出さないため
//     ハードエッジではなく楕円 feather（r≤0.68 で不透明、0.68–1.0 で線形フェード）。唇/開口のみに限定（目/鼻/顎/髪は含めない）。
//   - 登録は口楕円の「外周リング」（口内部を除いた鼻下〜口角外側〜顎上）で SSD 最小化＝口の描画差だけを残す。
//
// 入力（gitignore 済の元 PNG・配信不要）: public/images/interviewer/lipsync-source/
//   ai-interviewer-neutralのコピー.png（neutral と同一 pose の基準）/ ai-interviewer-mouth-{small,medium,large}.png
// 出力（tracked・配信）: public/images/interviewer/ai-interviewer-mouth-{small,medium,large}-overlay.webp
//
// 実行: node scripts/avatar/generate-mouth-overlays.mjs
//   ※ 元 PNG が無い環境では実行不要（生成済 webp をコミット済み）。再生成が必要なときだけ lipsync-source を用意して実行する。

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

// 口楕円（顔クロップ diff 重心で実測）。唇+開口を覆い、cheek/鼻/顎/髪は広く含めない。
const MC_X = 0.5
const MC_Y = 0.38
const RX = 0.12
const RY = 0.078

async function rgb(p) {
  const { data, info } = await sharp(SRC + p).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, info }
}

async function main() {
  const N = await rgb(neutralFile)
  const W = N.info.width
  const H = N.info.height
  const cx = MC_X * W
  const cy = MC_Y * H
  const rx = RX * W
  const ry = RY * H

  // 登録: 口楕円の外周リング（口内部を除外）で SSD 最小化＝口の描画差だけ残す。
  function ssd(T, dx, dy) {
    let s = 0
    let n = 0
    const y0 = Math.floor((MC_Y - 0.1) * H)
    const y1 = Math.floor((MC_Y + 0.1) * H)
    const x0 = Math.floor((MC_X - 0.16) * W)
    const x1 = Math.floor((MC_X + 0.16) * W)
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const ex = (x - cx) / (rx * 0.9)
        const ey = (y - cy) / (ry * 0.9)
        if (ex * ex + ey * ey < 1) continue // 口内部は除外
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
    for (let dy = -12; dy <= 12; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        const e = ssd(T, dx, dy)
        if (e < b.e) b = { dx, dy, e }
      }
    }
    return b
  }
  function alpha(x, y) {
    const ex = (x - cx) / rx
    const ey = (y - cy) / ry
    const r = Math.sqrt(ex * ex + ey * ey)
    if (r >= 1) return 0
    if (r <= 0.68) return 255
    return Math.round(255 * (1 - (r - 0.68) / 0.32))
  }

  for (const [name, file] of Object.entries(frames)) {
    const T = await rgb(file)
    const { dx, dy, e } = best(T)
    const out = Buffer.alloc(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        const a = alpha(x, y)
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
        out[o] = T.data[j]
        out[o + 1] = T.data[j + 1]
        out[o + 2] = T.data[j + 2]
        out[o + 3] = a
      }
    }
    const nm = `ai-interviewer-mouth-${name}-overlay.webp`
    await sharp(out, { raw: { width: W, height: H, channels: 4 } })
      .webp({ quality: 88, alphaQuality: 92 })
      .toFile(OUT + nm)
    console.log(`${nm}: shift dx=${dx} dy=${dy} SSD=${e.toFixed(0)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

// 電話番号のマスク表示（純関数・server で応募者の phone_number を安全に伏せて返す）。
//   例: 09012345678 → 090-****-5678。先頭3桁と末尾4桁のみ残し、中間を伏せる。
//   plaintext 全体を client へ返さない（verify 画面は「送信先の目安」だけ表示する）ための整形。
//   桁数が想定外でも安全側（末尾4桁のみ表示・前段は伏せる）に倒す。

export function maskPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < 7) {
    // 短すぎる（不正/空）ときは全マスク（情報を出さない）。
    return digits.length > 0 ? '*'.repeat(digits.length) : ''
  }
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  return `${head}-****-${tail}`
}

// 全角数字（U+FF10〜U+FF19）を半角 ASCII 数字へ正規化する純関数。
// - client（応募フォーム / SMS認証入力）と server（SMS認証コード比較）双方から利用する。
// - 変換対象は「全角数字だけ」。ひらがな/漢字/英字/記号は一切変換しない（数字として通さない）。
// - 既存バリデーション（parseInt / 正規表現 /^\d$/ 等）を全角入力でも素通りさせるための前処理。
export function normalizeDigits(input: string | null | undefined): string {
  if (!input) return ''
  // FF10('０')〜FF19('９') を 0x30('0')〜0x39('9') へ（差分 0xFEE0）
  return input.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
}

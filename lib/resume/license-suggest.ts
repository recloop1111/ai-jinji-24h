// デジタル履歴書 v1 — 資格・免許名の autocomplete「入力補助」候補と絞り込み（pure・DB/HTTP 非依存）。
//   ※ この候補は入力補助であって「登録可能資格の allow-list」ではない。候補に無い名称も自由入力・保存できる
//     （validation authority にしない）。絞り込みは 2文字以上・最大件数で制御し、focus だけで大量表示しない。

// 既存の suggestion（削除せず再利用）。普通自動車は第一種/第二種を両方候補化。
export const LICENSE_SUGGESTIONS: readonly string[] = [
  '普通自動車第一種運転免許',
  '普通自動車第二種運転免許',
  'TOEIC',
  'TOEFL',
  '実用英語技能検定（英検）',
  '日商簿記検定2級',
  '日商簿記検定3級',
  '基本情報技術者試験',
  '応用情報技術者試験',
  'ファイナンシャル・プランニング技能士',
  '宅地建物取引士',
  'MOS（Microsoft Office Specialist）',
  '介護職員初任者研修',
  '登録販売者',
]

export interface LicenseSuggestOptions {
  minChars?: number // 既定 2：これ未満は候補を出さない（focus だけの大量表示を防ぐ）
  max?: number      // 既定 8：表示上限
}

// 入力文字列に一致する候補を返す。minChars 未満は空配列。大文字小文字を無視した部分一致。最大 max 件。
//   前方一致を優先（例「普通自動車」→ 第一種/第二種）し、その後に部分一致を追加。
export function filterLicenseSuggestions(
  query: string | null | undefined,
  suggestions: readonly string[] = LICENSE_SUGGESTIONS,
  opts: LicenseSuggestOptions = {},
): string[] {
  const minChars = opts.minChars ?? 2
  const max = opts.max ?? 8
  const q = (query ?? '').trim().toLowerCase()
  if (q.length < minChars) return []

  const prefix: string[] = []
  const contains: string[] = []
  for (const s of suggestions) {
    const l = s.toLowerCase()
    if (l.startsWith(q)) prefix.push(s)
    else if (l.includes(q)) contains.push(s)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of [...prefix, ...contains]) {
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

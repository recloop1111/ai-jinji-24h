/**
 * PostgREST フィルタ構文の特殊文字をサニタイズ
 * ilike で使用する検索文字列から危険な文字を除去する
 */
export function sanitizeSearchQuery(input: string): string {
  // PostgREST フィルタ構文で意味を持つ文字を除去
  // カンマ: フィルタ区切り、ピリオド: 演算子区切り、括弧: グループ化
  return input.replace(/[,.()"'\\]/g, '')
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** UUID形式のバリデーション */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value)
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD 形式の日付バリデーション */
export function isValidDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false
  const d = new Date(value)
  return !isNaN(d.getTime())
}

const VALID_RANKS = ['A', 'B', 'C', 'D', 'E'] as const

/** 評価ランク(A〜E)のバリデーション */
export function isValidRank(value: string): boolean {
  return (VALID_RANKS as readonly string[]).includes(value)
}

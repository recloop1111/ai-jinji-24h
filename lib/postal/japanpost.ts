// 日本郵便「郵便番号・デジタルアドレスAPI」用の純ロジック（HTTP 非依存・テスト可能）。
//   ※ 本ファイルは fetch を呼ばない。トークン取得/検索の HTTP は lib/postal/client.ts、route は app/api/postal/lookup。
//   ※ 応答の field マッピングは公式仕様に追従する“唯一の場所”。仕様差異はここだけ直す。
import { normalizePostalCode } from '@/lib/resume/normalize'

// 正規化済み住所（フォームの都道府県/市区町村/町域へ充填する形）。
export interface PostalAddress {
  postalCode: string
  prefecture: string
  city: string
  town: string
}

// route が返す統一結果。available=false でもフォームは手動入力を継続できる（応募をブロックしない）。
export type PostalLookupResult =
  | { available: true; results: PostalAddress[] }
  | { available: false; reason: 'unconfigured' | 'invalid_zip' | 'not_found' | 'upstream_error' }

// 入力 zip を 7桁半角に正規化（全角/ハイフン許容）。7桁化できなければ null。
export function normalizePostalParam(zip: string | null | undefined): string | null {
  return normalizePostalCode(zip)
}

// 日本郵便 検索 API のレスポンス JSON から PostalAddress[] を取り出す（tolerant parse）。
//   公式レスポンスは addresses 配列（pref_name / city_name / town_name 等）を持つ。
//   キー名の揺れ（snake/別名）に耐えるよう複数候補を見て拾う。数値/欠損は空文字に寄せる。
export function parseJapanPostSearchResponse(json: unknown): PostalAddress[] {
  if (!json || typeof json !== 'object') return []
  const obj = json as Record<string, unknown>
  // 配列の在り処: addresses / data / results のいずれか
  const rawList =
    (Array.isArray(obj.addresses) && obj.addresses) ||
    (Array.isArray(obj.data) && obj.data) ||
    (Array.isArray(obj.results) && obj.results) ||
    []
  const pick = (r: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      const v = r[k]
      if (typeof v === 'string' && v.trim() !== '') return v.trim()
    }
    return ''
  }
  const out: PostalAddress[] = []
  for (const item of rawList as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const postalCode = normalizePostalCode(pick(r, ['zip_code', 'zipcode', 'postal_code', 'zip', 'code'])) ?? ''
    const prefecture = pick(r, ['pref_name', 'prefecture', 'pref', 'pref_kanji'])
    const city = pick(r, ['city_name', 'city', 'city_kanji'])
    const town = pick(r, ['town_name', 'town', 'town_kanji', 'district'])
    // 都道府県が取れないレコードは住所として不完全なので除外
    if (prefecture === '' && city === '' && town === '') continue
    out.push({ postalCode, prefecture, city, town })
  }
  return out
}

// トークン応答から access token と有効期限(sec) を取り出す（tolerant）。token 本体はログに出さない前提で扱う。
export function parseJapanPostTokenResponse(json: unknown): { token: string; expiresIn: number } | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const token =
    (typeof o.token === 'string' && o.token) ||
    (typeof o.access_token === 'string' && o.access_token) ||
    ''
  if (!token) return null
  const rawExp = o.expires_in ?? o.expiresIn
  const expiresIn = typeof rawExp === 'number' && rawExp > 0 ? rawExp : 600
  return { token, expiresIn }
}

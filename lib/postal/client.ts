// 日本郵便「郵便番号・デジタルアドレスAPI」への実 HTTP アクセス（server 専用）。
//   - 認証情報は server env のみ（NEXT_PUBLIC 不可）。client は本 module を直接使わず /api/postal/lookup 経由。
//   - 認証情報未設定なら外部へ出ず honest な unconfigured を返す（500 にしない）。フォームは手動入力を継続できる。
//   - OAuth トークンは有効期限つきで server-side キャッシュ（Vercel serverless では instance 単位＝唯一の真実にはしない。
//     miss/期限切れで都度再取得する前提の最適化）。認証情報/トークンはログに出さない。
import {
  parseJapanPostSearchResponse,
  parseJapanPostTokenResponse,
  normalizePostalParam,
  type PostalLookupResult,
} from './japanpost'

const DEFAULT_BASE_URL = 'https://api.da.pf.japanpost.jp'
const REQUEST_TIMEOUT_MS = 5000
const TOKEN_EARLY_REFRESH_MS = 60_000 // 期限 60s 前には再取得

interface JapanPostConfig {
  clientId: string
  clientSecret: string
  baseUrl: string
}

// env から設定を読む。client_id / client_secret が無ければ null（＝未設定）。
function readConfig(): JapanPostConfig | null {
  const clientId = process.env.JAPANPOST_API_CLIENT_ID?.trim()
  const clientSecret = process.env.JAPANPOST_API_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  const baseUrl = (process.env.JAPANPOST_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  return { clientId, clientSecret, baseUrl }
}

// ── OAuth token cache（module-level・instance 単位） ─────────────────────────
let tokenCache: { token: string; expiresAt: number } | null = null

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// client_credentials でトークン取得（キャッシュ優先）。失敗時 null。token 値はログに出さない。
async function getAccessToken(cfg: JapanPostConfig): Promise<string | null> {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt - TOKEN_EARLY_REFRESH_MS > now) {
    return tokenCache.token
  }
  try {
    const res = await fetchWithTimeout(`${cfg.baseUrl}/api/v1/j/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }),
    })
    if (!res.ok) return null
    const parsed = parseJapanPostTokenResponse(await res.json().catch(() => null))
    if (!parsed) return null
    tokenCache = { token: parsed.token, expiresAt: now + parsed.expiresIn * 1000 }
    return parsed.token
  } catch {
    return null // ネットワーク/timeout/JSON いずれも upstream_error 扱い（認証情報はログに出さない）
  }
}

// 郵便番号 → 住所候補。認証情報未設定・不正 zip・見つからない・上流エラーを honest に区別して返す。
export async function lookupPostal(zip: string | null | undefined): Promise<PostalLookupResult> {
  const code = normalizePostalParam(zip)
  if (!code) return { available: false, reason: 'invalid_zip' }

  const cfg = readConfig()
  if (!cfg) return { available: false, reason: 'unconfigured' }

  const token = await getAccessToken(cfg)
  if (!token) return { available: false, reason: 'upstream_error' }

  try {
    const res = await fetchWithTimeout(
      `${cfg.baseUrl}/api/v1/searchcode/${encodeURIComponent(code)}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.status === 401 || res.status === 403) {
      tokenCache = null // トークン失効の可能性 → 破棄（次回再取得）
      return { available: false, reason: 'upstream_error' }
    }
    if (!res.ok) return { available: false, reason: 'upstream_error' }
    const results = parseJapanPostSearchResponse(await res.json().catch(() => null))
    if (results.length === 0) return { available: false, reason: 'not_found' }
    return { available: true, results }
  } catch {
    return { available: false, reason: 'upstream_error' }
  }
}

// テスト用: トークンキャッシュを初期化（本番コードからは呼ばない）。
export function __resetPostalTokenCacheForTest(): void {
  tokenCache = null
}

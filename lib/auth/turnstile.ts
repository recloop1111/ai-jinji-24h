// Cloudflare Turnstile サーバー検証（公開面接フローの応募者作成エンドポイント用）。
// - ログインは Supabase ネイティブ CAPTCHA だが、応募者作成は Supabase Auth 非経由のため
//   アプリ側で Siteverify する。秘密鍵 TURNSTILE_SECRET_KEY はサーバー専用（NEXT_PUBLIC 不可）。
// - 本番で secret 未設定なら fail closed（false）。dev は secret 未設定時のみ許容（ローカル利便）。
// - 通信タイムアウト/失敗は fail closed。token 長は 2048 上限。Cloudflare の詳細エラーは返さない。

type TurnstileVerifyResponse = {
  success: boolean
  action?: string
  'error-codes'?: string[]
}

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 5000
const MAX_TOKEN_LEN = 2048

export async function verifyTurnstileToken(
  token: string | null,
  expectedAction: string,
  remoteIp?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // 本番は fail closed。dev のみ未設定を許容（テストキー設定時は通常どおり検証される）。
    return process.env.NODE_ENV !== 'production'
  }

  if (!token || token.length === 0 || token.length > MAX_TOKEN_LEN) return false

  const formData = new FormData()
  formData.append('secret', secret)
  formData.append('response', token)
  if (remoteIp) formData.append('remoteip', remoteIp)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return false
    const json = (await res.json()) as TurnstileVerifyResponse
    // action は応答にあれば一致を要求（テストキーは action 空のため許容）。
    return json.success === true && (!json.action || json.action === expectedAction)
  } catch {
    return false // タイムアウト/通信障害 → fail closed
  } finally {
    clearTimeout(timer)
  }
}

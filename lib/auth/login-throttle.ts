// ログイン スロットル（サーバ専用）。
// - scope_key は env AUTH_LOGIN_THROTTLE_SECRET を鍵とした HMAC-SHA256(64hex)。生email/IP は DB に渡さない。
// - DB 側は SECURITY DEFINER 関数経由でのみ更新（service_role は EXECUTE のみ・直接 table 権限なし）。
// - 秘密鍵が本番で未設定なら null を返し、呼び出し側で fail closed する。
import { createHmac } from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export type PortalType = 'admin' | 'client'

// AUTH_LOGIN_THROTTLE_SECRET を返す。
// 未設定時は null を返し、呼び出し側で必ず 503 fail closed する（dev/本番とも）。
// 例外は自動テスト（NODE_ENV=test）のみ固定値を許可。予測可能な dev フォールバックは持たない。
export function getThrottleSecret(): string | null {
  const s = process.env.AUTH_LOGIN_THROTTLE_SECRET
  if (s && s.length > 0) return s
  if (process.env.NODE_ENV === 'test') return 'test-only-throttle-secret'
  return null
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// scope_key = HMAC-SHA256(secret, "<kind>:<portal>:<value>") の小文字16進64文字。
export function computeScopeKey(
  secret: string,
  kind: 'account' | 'ip',
  portal: PortalType,
  value: string,
): string {
  return createHmac('sha256', secret).update(`${kind}:${portal}:${value}`).digest('hex')
}

export type ThrottleCheckResult = {
  account_blocked: boolean
  ip_blocked: boolean
  blocked_until: string | null
}

// 認証前のブロック判定（副作用なし＝failure_count を変更しない）。判定不能時は null（呼び出し側で fail closed）。
// 旧 auth_throttle_reserve_attempt は新フローでは使わない（CAPTCHA 検証前に加算してしまうため）。
export async function throttleCheck(
  portal: PortalType,
  accountScopeKey: string,
  ipScopeKey: string,
): Promise<ThrottleCheckResult | null> {
  const service = createServiceRoleClient()
  const { data, error } = await service.rpc('auth_throttle_check', {
    p_portal: portal,
    p_account_scope_key: accountScopeKey,
    p_ip_scope_key: ipScopeKey,
  })
  if (error || !Array.isArray(data) || data.length === 0) return null
  return data[0] as ThrottleCheckResult
}

// CAPTCHA 成功後の認証失敗 / role mismatch 時のみ呼ぶ。account/IP を原子的に加算（blocked 中は延長しない）。
// 生email/IP は保存せず scope_key（HMAC）のみ。auth_user_id は account の本人特定用（任意）。
export async function recordFailure(
  portal: PortalType,
  accountScopeKey: string,
  ipScopeKey: string,
  authUserId: string | null,
): Promise<void> {
  const service = createServiceRoleClient()
  const { error } = await service.rpc('auth_throttle_record_failure', {
    p_portal: portal,
    p_account_scope_key: accountScopeKey,
    p_ip_scope_key: ipScopeKey,
    p_auth_user_id: authUserId,
  })
  if (error) throw new Error('auth_throttle_record_failure failed')
}

// 認証成功時に account 側のみリセット（IP はリセットしない）。失敗時は throw（呼び出し側で signOut + 503）。
export async function recordSuccess(portal: PortalType, accountScopeKey: string): Promise<void> {
  const service = createServiceRoleClient()
  const { error } = await service.rpc('auth_throttle_record_success', {
    p_portal: portal,
    p_account_scope_key: accountScopeKey,
  })
  if (error) throw new Error('auth_throttle_record_success failed')
}

// 実ログイン試行の監査ログ（login_attempts）。生email/IP はここに保存（RLS で遮断・service_role のみ）。
// パスワード・Turnstile token・HMAC秘密鍵は保存しない。
export async function recordLoginAttempt(params: {
  authUserId: string | null
  email: string
  ip: string
  portal: PortalType
  success: boolean
  failureReason: 'auth_failed' | 'role_mismatch' | 'rate_limited' | null
}): Promise<void> {
  const service = createServiceRoleClient()
  const { error } = await service.from('login_attempts').insert({
    auth_user_id: params.authUserId,
    email: params.email,
    ip_address: params.ip,
    user_type: params.portal,
    success: params.success,
    failure_reason: params.failureReason,
  })
  if (error) throw new Error('login_attempts insert failed')
}

// サーバー側ログイン処理（admin/client 共通）。
// 流れ: 入力検証 → scope_key 算出 → 認証前 reserve（service_role） → ブロック中は Auth を呼ばず 429 →
//        portal別 cookie バウンドの Supabase Auth で signInWithPassword → role/company 認可 →
//        成功時のみ account リセット。全結果を login_attempts に記録。
// 重要: 認証成功後に認可・recordSuccess・監査記録が失敗した場合は、該当 portal を signOut して
//        cookie を破棄し、cookie を残したままエラー応答しない。エラーは一般化（存在を漏らさない）。
//        全レスポンスに Cache-Control: no-store。パスワード/秘密鍵/captcha tokenはログ・レスポンスに出さない。
import { type NextRequest, type NextResponse } from 'next/server'
import { errorJson, successJson } from '@/lib/api/response'
import {
  createServiceRoleClient,
  createAdminServerClient,
  createClientServerClient,
} from '@/lib/supabase/server'
import { getClientIp } from './client-ip'
import {
  getThrottleSecret,
  computeScopeKey,
  normalizeEmail,
  reserveAttempt,
  recordSuccess,
  recordLoginAttempt,
  type PortalType,
} from './login-throttle'

const GENERIC_AUTH = 'メールアドレスまたはパスワードが正しくありません。'
const GENERIC_FORBIDDEN = 'このアカウントではこの画面にログインできません。'
const GENERIC_RATE = '試行回数が多すぎます。しばらく経ってから再度お試しください。'
const GENERIC_ERROR = 'ログイン処理に失敗しました。時間をおいて再度お試しください。'

function noStore<T extends NextResponse>(res: T): T {
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function processLogin(request: NextRequest, portal: PortalType) {
  const body = await request.json().catch(() => null)
  const email = body && typeof body.email === 'string' ? body.email : ''
  const password = body && typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return noStore(errorJson('UNAUTHORIZED', GENERIC_AUTH, 401))
  }

  const normEmail = normalizeEmail(email)
  const ip = getClientIp(request)

  // 秘密鍵未設定は fail closed（内部構成・秘密値は出さない）
  const secret = getThrottleSecret()
  if (!secret) {
    return noStore(errorJson('INTERNAL_ERROR', GENERIC_ERROR, 503))
  }
  const accKey = computeScopeKey(secret, 'account', portal, normEmail)
  const ipKey = computeScopeKey(secret, 'ip', portal, ip)

  const service = createServiceRoleClient()

  // 本人特定用 auth_user_id（portal 種別が一致する実在ユーザーのときのみ関連付け）
  let candidateUid: string | null = null
  try {
    const { data: prof } = await service
      .from('profiles')
      .select('id, role, company_id')
      .ilike('email', normEmail)
      .maybeSingle()
    if (prof) {
      if (portal === 'admin' && (prof.role === 'admin' || prof.role === 'super_admin')) {
        candidateUid = prof.id
      } else if (portal === 'client' && prof.company_id) {
        candidateUid = prof.id
      }
    }
  } catch {
    candidateUid = null // 関連付けは best-effort（認証判断には影響させない）
  }

  // 認証前の原子的予約（失敗時は fail closed）
  const reserve = await reserveAttempt({
    portal,
    accountScopeKey: accKey,
    ipScopeKey: ipKey,
    authUserId: candidateUid,
  })
  if (!reserve) {
    return noStore(errorJson('INTERNAL_ERROR', GENERIC_ERROR, 503))
  }
  if (!reserve.allowed) {
    // 監査記録は best-effort（cookie 未発行のため失敗しても 429 を返す）
    try {
      await recordLoginAttempt({
        authUserId: candidateUid, email: normEmail, ip, portal,
        success: false, failureReason: 'rate_limited',
      })
    } catch { /* best-effort */ }
    const retryAfter = reserve.blocked_until
      ? Math.max(1, Math.ceil((new Date(reserve.blocked_until).getTime() - Date.now()) / 1000))
      : 1800
    const res = noStore(errorJson('RATE_LIMITED', GENERIC_RATE, 429))
    res.headers.set('Retry-After', String(retryAfter))
    return res
  }

  // 認証（portal別 cookie バウンド。signInWithPassword が該当 portal の cookie を発行）
  const authClient = portal === 'admin'
    ? await createAdminServerClient()
    : await createClientServerClient()
  const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
    email: normEmail,
    password,
  })
  if (signInError || !authData?.user) {
    // 認証失敗 → cookie は発行されない。監査記録は best-effort。
    try {
      await recordLoginAttempt({
        authUserId: candidateUid, email: normEmail, ip, portal,
        success: false, failureReason: 'auth_failed',
      })
    } catch { /* best-effort */ }
    return noStore(errorJson('UNAUTHORIZED', GENERIC_AUTH, 401))
  }

  const user = authData.user

  // ここから先は cookie 発行済み。認可確認・記録が完了できない場合は必ず signOut して 503。
  let authorized = false
  try {
    const { data: profile, error: profErr } = await service
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .maybeSingle()
    if (profErr) throw new Error('profile lookup failed')
    authorized = portal === 'admin'
      ? !!profile && (profile.role === 'admin' || profile.role === 'super_admin')
      : !!profile && !!profile.company_id
  } catch {
    await safeSignOut(authClient)
    return noStore(errorJson('INTERNAL_ERROR', GENERIC_ERROR, 503))
  }

  if (!authorized) {
    // role/company 不一致 → 該当 portal の cookie だけを破棄（他 portal cookie は触らない）
    await safeSignOut(authClient)
    try {
      await recordLoginAttempt({
        authUserId: user.id, email: normEmail, ip, portal,
        success: false, failureReason: 'role_mismatch',
      })
    } catch { /* best-effort: cookie は既に破棄済み */ }
    return noStore(errorJson('FORBIDDEN', GENERIC_FORBIDDEN, 403))
  }

  // 成功: account のみリセット（IP は据え置き）＋ 成功を監査記録。
  // いずれか失敗で完了できない場合は cookie を残さず signOut + 503。
  try {
    await recordSuccess(portal, accKey)
    await recordLoginAttempt({
      authUserId: user.id, email: normEmail, ip, portal,
      success: true, failureReason: null,
    })
  } catch {
    await safeSignOut(authClient)
    return noStore(errorJson('INTERNAL_ERROR', GENERIC_ERROR, 503))
  }

  return noStore(successJson({ ok: true }))
}

// 該当 portal のセッションのみ破棄。signOut 自体の失敗は握りつぶす（応答方針を変えない）。
async function safeSignOut(
  authClient: Awaited<ReturnType<typeof createAdminServerClient>>,
): Promise<void> {
  try {
    await authClient.auth.signOut()
  } catch {
    /* best-effort */
  }
}

import { createAdminServerClient, createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { apiError } from './response'
import { type CompanyRole, isCompanyRole } from '@/lib/rbac/roles'

type AuthSuccess<T> = { data: T; error: null }
type AuthFailure = { data: null; error: ReturnType<typeof apiError> }
type AuthResult<T> = AuthSuccess<T> | AuthFailure

export type ClientUser = {
  userId: string
  companyId: string
  // 企業内 role の SoT = company_members.company_role（active membership のみ有効）。
  // 既存 destructuring（userId/companyId）は不変。companyRole を後方互換で追加。
  companyRole: CompanyRole
}

export type AdminUser = {
  userId: string
  role: string
}

/**
 * 企業ユーザー認証ヘルパー
 * cookie セッションで認証し、service role で profiles から company_id を取得する。
 * RLS に依存しないため、profiles の SELECT ポリシーに関係なく動作する。
 */
export async function getClientUser(): Promise<AuthResult<ClientUser>> {
  // client 専用セッション（client cookie）だけを読む。admin cookie はフォールバックしない。
  const supabase = await createClientServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { data: null, error: apiError('UNAUTHORIZED') }
  }

  const serviceClient = createServiceRoleClient()
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.company_id) {
    return { data: null, error: apiError('FORBIDDEN', '企業に紐づくアカウントが見つかりません') }
  }

  // 企業内 role は company_members から取得（control plane の identity lookup = service-role で参照。
  // resource data の service-role 化ではない）。有効なのは status='active' の membership のみ。
  // membership が無い / suspended / removed は client portal の有効ユーザーとして扱わない（fail closed。
  // 「membership が無ければ暫定 owner」等の fallback は作らない）。
  const { data: membership, error: membershipError } = await serviceClient
    .from('company_members')
    .select('company_id, company_role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (membershipError) {
    return { data: null, error: apiError('FORBIDDEN', '企業メンバー権限を確認できませんでした') }
  }
  if (!membership || membership.company_id !== profile.company_id || !isCompanyRole(membership.company_role)) {
    return { data: null, error: apiError('FORBIDDEN', '有効な企業メンバー権限がありません') }
  }

  return {
    data: { userId: user.id, companyId: profile.company_id, companyRole: membership.company_role },
    error: null,
  }
}

/**
 * 管理者ユーザー認証ヘルパー
 * cookie セッションで認証し、service role で profiles.role を確認する。
 * RLS に依存しないため、profiles の SELECT ポリシーに関係なく動作する。
 */
export async function getAdminUser(): Promise<AuthResult<AdminUser>> {
  // admin 専用セッション（admin cookie）だけを読む。client cookie はフォールバックしない。
  const supabase = await createAdminServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { data: null, error: apiError('UNAUTHORIZED') }
  }

  const serviceClient = createServiceRoleClient()
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { data: null, error: apiError('FORBIDDEN', '管理者権限がありません') }
  }

  const role = profile.role as string
  if (role !== 'admin' && role !== 'super_admin') {
    return { data: null, error: apiError('FORBIDDEN', '管理者権限がありません') }
  }

  return {
    data: { userId: user.id, role },
    error: null,
  }
}

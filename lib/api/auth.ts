import { createAdminServerClient, createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { apiError } from './response'

type AuthSuccess<T> = { data: T; error: null }
type AuthFailure = { data: null; error: ReturnType<typeof apiError> }
type AuthResult<T> = AuthSuccess<T> | AuthFailure

export type ClientUser = {
  userId: string
  companyId: string
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

  return {
    data: { userId: user.id, companyId: profile.company_id },
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

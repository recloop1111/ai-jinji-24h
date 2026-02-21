import { createClient } from '@/lib/supabase/server'
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
 * Supabase Auth のセッションから認証し、company_id を取得する。
 */
export async function getClientUser(): Promise<AuthResult<ClientUser>> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { data: null, error: apiError('UNAUTHORIZED') }
  }

  // auth_user_id → company_id のマッピングを取得
  const { data: company, error: companyError } = await supabase
    .from('company_users')
    .select('company_id')
    .eq('auth_user_id', user.id)
    .single()

  if (companyError || !company) {
    return { data: null, error: apiError('FORBIDDEN', '企業に紐づくアカウントが見つかりません') }
  }

  return {
    data: { userId: user.id, companyId: company.company_id },
    error: null,
  }
}

/**
 * 管理者ユーザー認証ヘルパー
 * Supabase Auth のセッションから認証し、admin_users テーブルで権限を確認する。
 */
export async function getAdminUser(): Promise<AuthResult<AdminUser>> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { data: null, error: apiError('UNAUTHORIZED') }
  }

  const { data: admin, error: adminError } = await supabase
    .from('admin_users')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (adminError || !admin) {
    return { data: null, error: apiError('FORBIDDEN', '管理者権限がありません') }
  }

  return {
    data: { userId: user.id, role: admin.role },
    error: null,
  }
}

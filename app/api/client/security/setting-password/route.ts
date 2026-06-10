import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'
import { hashSettingPassword, verifySettingPassword, isValidSettingPassword } from '@/lib/security/setting-password'

// 企業設定変更用パスワード（ログインPWとは別）の保存・検証基盤。
// 保存先: companies.company_setting_password_hash（自社のみ）。

async function fetchCompanyHash(companyId: string): Promise<{ hash: string | null; notFound: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()
  if (error || !data) return { hash: null, notFound: true }
  return { hash: data.company_setting_password_hash ?? null, notFound: false }
}

// 設定状況の確認
export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { hash, notFound } = await fetchCompanyHash(user.companyId)
    if (notFound) return apiError('NOT_FOUND', '企業情報が見つかりません')
    return successJson({ configured: !!hash })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

// 初期設定（未設定時のみ）
export async function POST(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const newPassword = body?.newPassword
    if (!isValidSettingPassword(newPassword)) {
      return apiError('VALIDATION_ERROR', '設定変更用パスワードは8文字以上で指定してください')
    }

    const { hash, notFound } = await fetchCompanyHash(user.companyId)
    if (notFound) return apiError('NOT_FOUND', '企業情報が見つかりません')
    if (hash) {
      return apiError('CONFLICT', '設定変更用パスワードは既に設定済みです。変更はPATCHを使用してください')
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('companies')
      .update({ company_setting_password_hash: hashSettingPassword(newPassword), updated_at: new Date().toISOString() })
      .eq('id', user.companyId)

    if (error) {
      return apiError('INTERNAL_ERROR', '設定変更用パスワードの保存に失敗しました')
    }
    return successJson({ configured: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

// 変更（現行パスワード確認後）
export async function PATCH(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const currentPassword = body?.currentPassword
    const newPassword = body?.newPassword
    if (!isValidSettingPassword(newPassword)) {
      return apiError('VALIDATION_ERROR', '新しい設定変更用パスワードは8文字以上で指定してください')
    }

    const { hash, notFound } = await fetchCompanyHash(user.companyId)
    if (notFound) return apiError('NOT_FOUND', '企業情報が見つかりません')
    if (!hash) {
      return apiError('FORBIDDEN', '設定変更用パスワードが未設定です')
    }
    if (typeof currentPassword !== 'string' || !verifySettingPassword(currentPassword, hash)) {
      return apiError('FORBIDDEN', '現在の設定変更用パスワードが正しくありません')
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('companies')
      .update({ company_setting_password_hash: hashSettingPassword(newPassword), updated_at: new Date().toISOString() })
      .eq('id', user.companyId)

    if (error) {
      return apiError('INTERNAL_ERROR', '設定変更用パスワードの更新に失敗しました')
    }
    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

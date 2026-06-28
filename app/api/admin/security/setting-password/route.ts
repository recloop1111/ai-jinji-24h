import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { hashSettingPassword, verifySettingPassword, isValidSettingPassword } from '@/lib/security/setting-password'

const ROW_ID = 'default'

// 運営管理設定変更用パスワード（ログインPWとは別）の保存・検証基盤。
// 保存先: admin_security_settings（単一行 id='default'）。service role でアクセス。

async function fetchHash(supabase: ReturnType<typeof createServiceRoleClient>): Promise<{ hash: string | null; tableMissing: boolean }> {
  const { data, error } = await supabase
    .from('admin_security_settings')
    .select('setting_password_hash')
    .eq('id', ROW_ID)
    .maybeSingle()
  if (error) {
    // テーブル未作成（migration未適用）等
    return { hash: null, tableMissing: true }
  }
  return { hash: data?.setting_password_hash ?? null, tableMissing: false }
}

// 設定状況の確認
export async function GET() {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const supabase = createServiceRoleClient()
    const { hash } = await fetchHash(supabase)
    return successJson({ configured: !!hash })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

// 初期設定（未設定時のみ）
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const newPassword = body?.newPassword
    if (!isValidSettingPassword(newPassword)) {
      return apiError('VALIDATION_ERROR', '設定変更用パスワードは8文字以上で指定してください')
    }

    const supabase = createServiceRoleClient()
    const { hash, tableMissing } = await fetchHash(supabase)
    if (tableMissing) {
      return apiError('INTERNAL_ERROR', '設定保存先が未作成です（migration未適用）')
    }
    if (hash) {
      return apiError('CONFLICT', '運営管理設定変更用パスワードは既に設定済みです。変更はPATCHを使用してください')
    }

    const { error } = await supabase
      .from('admin_security_settings')
      .upsert({ id: ROW_ID, setting_password_hash: hashSettingPassword(newPassword), updated_at: new Date().toISOString() })

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
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const currentPassword = body?.currentPassword
    const newPassword = body?.newPassword
    if (!isValidSettingPassword(newPassword)) {
      return apiError('VALIDATION_ERROR', '新しい設定変更用パスワードは8文字以上で指定してください')
    }

    const supabase = createServiceRoleClient()
    const { hash, tableMissing } = await fetchHash(supabase)
    if (tableMissing) {
      return apiError('INTERNAL_ERROR', '設定保存先が未作成です（migration未適用）')
    }
    if (!hash) {
      return apiError('FORBIDDEN', '運営管理設定変更用パスワードが未設定です')
    }
    if (typeof currentPassword !== 'string' || !verifySettingPassword(currentPassword, hash)) {
      return apiError('FORBIDDEN', '現在の設定変更用パスワードが正しくありません')
    }

    const { error } = await supabase
      .from('admin_security_settings')
      .update({ setting_password_hash: hashSettingPassword(newPassword), updated_at: new Date().toISOString() })
      .eq('id', ROW_ID)

    if (error) {
      return apiError('INTERNAL_ERROR', '設定変更用パスワードの更新に失敗しました')
    }
    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

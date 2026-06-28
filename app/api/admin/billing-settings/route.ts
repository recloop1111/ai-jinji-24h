import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'
import {
  BILLING_ISSUER_SETTINGS_FIELDS,
  sanitizeIssuerSettings,
  configFallbackIssuerSettings,
} from '@/lib/billing/issuer-settings'

// 請求書の発行者/振込先/支払案内文（billing_issuer_settings・単一行 id='default'）。
// 運営(admin/super_admin)のみ。client企業側には一切公開しない（テーブルは service_role 限定）。
// 読み書きは getAdminUser ＋ service-role 経由のみ（テーブルに anon/authenticated grant・policy 無し）。

const ROW_ID = 'default'

export async function GET() {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const supabase = createServiceRoleClient()

    const { data: settings, error } = await supabase
      .from('billing_issuer_settings')
      .select(`${BILLING_ISSUER_SETTINGS_FIELDS.join(', ')}, updated_by, updated_at`)
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error) return apiError('INTERNAL_ERROR', '請求書設定の取得に失敗しました')

    // 運営管理設定変更用パスワードの設定状況（PUT に必須のため UI で案内する）
    const { data: secRow } = await supabase
      .from('admin_security_settings')
      .select('setting_password_hash')
      .eq('id', ROW_ID)
      .maybeSingle()

    return successJson({
      settings: settings ?? null,
      // 未設定時に請求書PDFへ使われる既定値（lib/config/billing.ts）。UI の placeholder 用。
      fallback: configFallbackIssuerSettings(),
      settingPasswordConfigured: !!secRow?.setting_password_hash,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { data: admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    const supabase = createServiceRoleClient()

    // 口座情報を含む機微設定のため、保存時は「運営管理設定変更用パスワード」(ログインPWとは別) を必須にする。
    // adminSettingPassword を admin_security_settings.setting_password_hash と照合する。
    const { adminSettingPassword } = body as { adminSettingPassword?: string }
    if (typeof adminSettingPassword !== 'string' || adminSettingPassword.length === 0) {
      return apiError('VALIDATION_ERROR', '運営管理設定変更用パスワードが必要です')
    }
    const { data: secRow, error: secError } = await supabase
      .from('admin_security_settings')
      .select('setting_password_hash')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (secError) {
      return apiError('INTERNAL_ERROR', '設定保存先が未作成です（migration未適用）')
    }
    const settingHash = secRow?.setting_password_hash ?? null
    if (!settingHash) {
      return apiError('FORBIDDEN', '運営管理設定変更用パスワードが未設定です')
    }
    if (!verifySettingPassword(adminSettingPassword, settingHash)) {
      return apiError('FORBIDDEN', '運営管理設定変更用パスワードが正しくありません')
    }

    const fields = sanitizeIssuerSettings(body)
    const { error: upErr } = await supabase
      .from('billing_issuer_settings')
      .upsert(
        { id: ROW_ID, ...fields, updated_by: admin.userId, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      )
    if (upErr) return apiError('INTERNAL_ERROR', '請求書設定の保存に失敗しました')

    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

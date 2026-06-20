import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClientServerClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'

export async function POST(request: Request) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    const settingPassword = body?.settingPassword

    const supabase = await createClientServerClient()

    // 管理者設定用パスワード（ログインPWとは別）をサーバ側で検証
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('company_setting_password_hash')
      .eq('id', user.companyId)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }
    if (!company.company_setting_password_hash) {
      return apiError('FORBIDDEN', '管理者設定用パスワードが未設定です。運営担当者へお問い合わせください')
    }
    if (typeof settingPassword !== 'string' || !verifySettingPassword(settingPassword, company.company_setting_password_hash)) {
      return apiError('FORBIDDEN', '管理者設定用パスワードが正しくありません')
    }

    // 既に緊急停止申請中でないか確認（status は CHECK 制約上 'pending' を使用）
    const { data: existing } = await supabase
      .from('suspension_requests')
      .select('id')
      .eq('company_id', user.companyId)
      .eq('request_type', 'emergency')
      .eq('status', 'pending')
      .limit(1)
      .single()

    if (existing) {
      return apiError('CONFLICT', '既に緊急停止申請が進行中です')
    }

    const { error: insertError } = await supabase
      .from('suspension_requests')
      .insert({
        company_id: user.companyId,
        request_type: 'emergency',
        status: 'pending',
        reason,
      })

    if (insertError) {
      return apiError('INTERNAL_ERROR', '緊急停止申請の作成に失敗しました')
    }

    return successJson({
      requested: true,
      awaiting_approval: true,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

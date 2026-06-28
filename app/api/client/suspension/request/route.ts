import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'

export async function POST(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const type = body?.type ?? 'normal'
    const settingPassword = body?.settingPassword

    if (type !== 'normal') {
      return apiError('VALIDATION_ERROR', 'type は "normal" のみ指定可能です')
    }

    const supabase = await createClientServerClient()

    // 管理者設定用パスワード（ログインPWとは別）をサーバ側で検証。
    // company_setting_password_hash は authenticated から読ませない（phase2h 列ホワイトリスト前提）ため
    // hash の読み取りのみ service-role（RLS/列権限 bypass）で行う。
    const serviceClient = createServiceRoleClient()
    const { data: company, error: compError } = await serviceClient
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

    // 既に通常停止申請中でないか確認（request_type='temporary' かつ status='pending'）
    const { data: existing } = await supabase
      .from('suspension_requests')
      .select('id')
      .eq('company_id', user.companyId)
      .eq('request_type', 'temporary')
      .eq('status', 'pending')
      .limit(1)
      .single()

    if (existing) {
      return apiError('CONFLICT', '既に一時停止申請が進行中です')
    }

    const { data: req, error: insertError } = await supabase
      .from('suspension_requests')
      .insert({
        company_id: user.companyId,
        request_type: 'temporary',
        status: 'pending',
      })
      .select('created_at')
      .single()

    if (insertError || !req) {
      return apiError('INTERNAL_ERROR', '停止申請の作成に失敗しました')
    }

    // 予定停止日は created_at + 1ヶ月で導出（suspension_requests に専用カラムは無い）
    const requestedAt = req.created_at
    const scheduledStopAt = new Date(requestedAt)
    scheduledStopAt.setMonth(scheduledStopAt.getMonth() + 1)

    return successJson({
      requested: true,
      requested_at: requestedAt,
      scheduled_stop_at: scheduledStopAt.toISOString(),
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

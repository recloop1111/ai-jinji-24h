import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'

// 確定請求の支払ステータス変更（admin・service-role）。
// 入金済み化/取り消しは「運営管理設定変更用パスワード」必須（重要操作）。
// pending ↔ paid のみ許可。failed/refunded は初期リリースでは変更不可。
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ billing_record_id: string }> },
) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { billing_record_id } = await params
    if (!isValidUUID(billing_record_id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }
    const nextStatus = body.payment_status
    if (nextStatus !== 'paid' && nextStatus !== 'pending') {
      return apiError('VALIDATION_ERROR', 'payment_status は paid または pending のみ')
    }
    const settingPassword = typeof body.setting_password === 'string' ? body.setting_password : ''

    const supabase = createServiceRoleClient()

    // 運営管理設定変更用パスワード検証（admin_security_settings）
    const { data: secRow, error: secError } = await supabase
      .from('admin_security_settings')
      .select('setting_password_hash')
      .eq('id', 'default')
      .maybeSingle()
    if (secError) return apiError('INTERNAL_ERROR', '設定保存先が未作成です（migration未適用）')
    const settingHash = secRow?.setting_password_hash ?? null
    if (!settingHash) return apiError('FORBIDDEN', '運営管理設定変更用パスワードが未設定です')
    if (!settingPassword || !verifySettingPassword(settingPassword, settingHash)) {
      return apiError('FORBIDDEN', '運営管理設定変更用パスワードが正しくありません')
    }

    // 対象レコードの現在ステータス確認（failed/refunded は変更不可）
    const { data: record, error: recError } = await supabase
      .from('billing_records')
      .select('id, payment_status')
      .eq('id', billing_record_id)
      .single()
    if (recError || !record) return apiError('NOT_FOUND', '請求レコードが見つかりません')
    if (record.payment_status !== 'pending' && record.payment_status !== 'paid') {
      return apiError('FORBIDDEN', 'この請求は変更できません（pending/paid のみ）')
    }

    const updates =
      nextStatus === 'paid'
        ? { payment_status: 'paid', paid_at: new Date().toISOString() }
        : { payment_status: 'pending', paid_at: null }

    // pending/paid 以外を弾く二重ガード（failed/refunded を上書きしない）
    const { data: updated, error: updError } = await supabase
      .from('billing_records')
      .update(updates)
      .eq('id', billing_record_id)
      .in('payment_status', ['pending', 'paid'])
      .select('id, payment_status, paid_at')
      .single()
    if (updError || !updated) return apiError('INTERNAL_ERROR', '支払ステータスの更新に失敗しました')

    return successJson({
      id: updated.id,
      payment_status: updated.payment_status,
      paid_at: updated.paid_at,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

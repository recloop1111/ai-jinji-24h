import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    // pending 状態の停止申請を取得
    const { data: request, error: fetchError } = await supabase
      .from('suspension_requests')
      .select('id')
      .eq('company_id', user.companyId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchError || !request) {
      return apiError('NOT_FOUND', '取り消し可能な停止申請が見つかりません')
    }

    // ステータスを cancelled に更新
    const { error: updateError } = await supabase
      .from('suspension_requests')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', request.id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', '停止申請の取り消しに失敗しました')
    }

    return successJson({ cancelled: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 企業自身の現在の停止状態と、最新の pending 申請を返す（リロード時の状態復元用）
export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    // RLS に左右されないよう service role を使用し、company_id でコード側フィルタ
    const supabase = createServiceRoleClient()

    // 停止状態の正は companies.is_suspended
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('is_suspended')
      .eq('id', user.companyId)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    // 最新の pending 申請（temporary / emergency）を1件取得
    const { data: latest, error: reqError } = await supabase
      .from('suspension_requests')
      .select('request_type, status, created_at')
      .eq('company_id', user.companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (reqError) {
      return apiError('INTERNAL_ERROR', '停止申請の取得に失敗しました')
    }

    let request: {
      request_type: string
      status: string
      created_at: string
      scheduled_stop_at: string | null
    } | null = null

    if (latest) {
      // 予定停止日は temporary のみ created_at + 1ヶ月で導出（緊急は承認後即時のため null）
      let scheduledStopAt: string | null = null
      if (latest.request_type === 'temporary' && latest.created_at) {
        const d = new Date(latest.created_at)
        d.setMonth(d.getMonth() + 1)
        scheduledStopAt = d.toISOString()
      }
      request = {
        request_type: latest.request_type,
        status: latest.status,
        created_at: latest.created_at,
        scheduled_stop_at: scheduledStopAt,
      }
    }

    return successJson({
      is_suspended: company.is_suspended === true,
      request,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

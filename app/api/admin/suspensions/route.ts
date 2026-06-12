import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    // 運営は全企業の停止申請を横断取得する必要があるため service role（RLS非依存）
    const supabase = createServiceRoleClient()

    const { data: suspensions, error } = await supabase
      .from('suspension_requests')
      .select('id, company_id, request_type, status, reason, created_at, companies ( name )')
      .order('created_at', { ascending: false })

    if (error) {
      return apiError('INTERNAL_ERROR', '停止申請の取得に失敗しました')
    }

    const items = (suspensions ?? []).map((s) => {
      // 予定停止日カラムは存在しないため、通常停止のみ created_at + 1ヶ月で導出（緊急は承認後即時のため null）
      let scheduledStopAt: string | null = null
      if (s.request_type === 'normal' && s.created_at) {
        const d = new Date(s.created_at)
        d.setMonth(d.getMonth() + 1)
        scheduledStopAt = d.toISOString()
      }
      return {
        id: s.id,
        company_name: (s.companies as unknown as { name: string } | null)?.name ?? '',
        type: s.request_type,
        status: s.status,
        requested_at: s.created_at,
        scheduled_stop_at: scheduledStopAt,
        created_at: s.created_at,
      }
    })

    return successJson({ suspensions: items })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

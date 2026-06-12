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

    const items = (suspensions ?? []).map((s) => ({
      id: s.id,
      company_name: (s.companies as unknown as { name: string } | null)?.name ?? '',
      type: s.request_type,
      status: s.status,
      requested_at: s.created_at,
      // suspension_requests に予定停止日カラムが存在しないため null（画面側で「—」表示）
      scheduled_stop_at: null,
      created_at: s.created_at,
    }))

    return successJson({ suspensions: items })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

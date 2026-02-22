import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const supabase = await createClient()

    const { data: suspensions, error } = await supabase
      .from('suspension_requests')
      .select('id, company_id, type, status, created_at, companies ( name )')
      .order('created_at', { ascending: false })

    if (error) {
      return apiError('INTERNAL_ERROR', '停止申請の取得に失敗しました')
    }

    const items = (suspensions ?? []).map((s) => ({
      id: s.id,
      company_name: (s.companies as unknown as { name: string } | null)?.name ?? '',
      type: s.type,
      status: s.status,
      requested_at: s.created_at,
    }))

    return successJson({ suspensions: items })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

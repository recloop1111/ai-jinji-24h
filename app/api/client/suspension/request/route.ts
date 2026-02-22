import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    const type = body?.type ?? 'normal'

    if (type !== 'normal') {
      return apiError('VALIDATION_ERROR', 'type は "normal" のみ指定可能です')
    }

    const supabase = await createClient()

    // 既に停止申請中でないか確認
    const { data: existing } = await supabase
      .from('suspension_requests')
      .select('id')
      .eq('company_id', user.companyId)
      .eq('status', 'pending')
      .limit(1)
      .single()

    if (existing) {
      return apiError('CONFLICT', '既に一時停止申請が進行中です')
    }

    const now = new Date()
    const scheduledStopAt = new Date(now)
    scheduledStopAt.setMonth(scheduledStopAt.getMonth() + 1)

    const { data: req, error: insertError } = await supabase
      .from('suspension_requests')
      .insert({
        company_id: user.companyId,
        type: 'normal',
        status: 'pending',
        requested_at: now.toISOString(),
        scheduled_stop_at: scheduledStopAt.toISOString(),
        requested_by: user.userId,
      })
      .select('requested_at, scheduled_stop_at')
      .single()

    if (insertError || !req) {
      return apiError('INTERNAL_ERROR', '停止申請の作成に失敗しました')
    }

    return successJson({
      requested: true,
      requested_at: req.requested_at,
      scheduled_stop_at: req.scheduled_stop_at,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

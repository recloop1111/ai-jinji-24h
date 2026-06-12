import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

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

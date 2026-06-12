import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 緊急停止申請の承認（emergency かつ pending のみ）。承認＝即時停止反映。
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = createServiceRoleClient()

    const { data: req, error: fetchError } = await supabase
      .from('suspension_requests')
      .select('id, company_id, request_type, status')
      .eq('id', id)
      .single()

    if (fetchError || !req) {
      return apiError('NOT_FOUND', '停止申請が見つかりません')
    }
    // 承認対象は承認待ちの緊急停止申請のみ（通常停止は batch が処理）
    if (req.request_type !== 'emergency' || req.status !== 'pending') {
      return apiError('VALIDATION_ERROR', '承認できるのは承認待ちの緊急停止申請のみです')
    }

    // 企業を停止状態に変更（停止状態の正は companies.is_suspended）
    const now = new Date().toISOString()
    const { error: compError } = await supabase
      .from('companies')
      .update({ is_suspended: true, updated_at: now })
      .eq('id', req.company_id)
    if (compError) {
      return apiError('INTERNAL_ERROR', '企業の停止反映に失敗しました')
    }

    // 申請を承認済み（終端）に更新
    const { error: updateError } = await supabase
      .from('suspension_requests')
      .update({ status: 'approved' })
      .eq('id', id)
    if (updateError) {
      return apiError('INTERNAL_ERROR', '停止申請の承認に失敗しました')
    }

    return successJson({ approved: true, company_status: 'suspended' })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'

// 緊急停止申請の却下（emergency かつ pending のみ）。企業の停止状態は変更しない。
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
      .select('id, request_type, status')
      .eq('id', id)
      .single()

    if (fetchError || !req) {
      return apiError('NOT_FOUND', '停止申請が見つかりません')
    }
    // 却下対象は承認待ちの緊急停止申請のみ
    if (req.request_type !== 'emergency' || req.status !== 'pending') {
      return apiError('VALIDATION_ERROR', '却下できるのは承認待ちの緊急停止申請のみです')
    }

    // 申請を却下（終端）に更新。companies.is_suspended は変更しない。
    const { error: updateError } = await supabase
      .from('suspension_requests')
      .update({ status: 'rejected' })
      .eq('id', id)
    if (updateError) {
      return apiError('INTERNAL_ERROR', '停止申請の却下に失敗しました')
    }

    return successJson({ rejected: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

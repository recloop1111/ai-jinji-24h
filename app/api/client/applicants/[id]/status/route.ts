import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['pending', 'second_interview', 'rejected'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id } = await params
    const body = await request.json().catch(() => null)

    if (!body || !body.selection_status) {
      return apiError('VALIDATION_ERROR', 'selection_status は必須です')
    }

    const newStatus = body.selection_status as string
    if (!VALID_STATUSES.includes(newStatus as typeof VALID_STATUSES[number])) {
      return apiError('VALIDATION_ERROR', 'selection_status の値が不正です（pending / second_interview / rejected）')
    }

    const supabase = await createClient()

    // 応募者の所有権確認 + 現在のステータス取得
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, selection_status')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .single()

    if (appError || !applicant) {
      return apiError('NOT_FOUND', '応募者が見つかりません')
    }

    const oldStatus = applicant.selection_status

    if (oldStatus === newStatus) {
      return successJson({ updated: false, old_status: oldStatus, new_status: newStatus })
    }

    // ステータス更新
    const { error: updateError } = await supabase
      .from('applicants')
      .update({ selection_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', 'ステータスの更新に失敗しました')
    }

    // 履歴テーブルに記録
    await supabase
      .from('selection_status_histories')
      .insert({
        applicant_id: id,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: user.userId,
      })

    return successJson({ updated: true, old_status: oldStatus, new_status: newStatus })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

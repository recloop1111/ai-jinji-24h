import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { isSelectionResultValue } from '@/lib/applicants/selectionResult'

// 選考結果の更新（client・自社 applicant のみ）。SoT = applicants.result（未対応/検討中/二次通過/不採用）。
//   ※ 旧実装は運営用カラム（applicants.selection_status）を CHECK 外の値で更新しており、
//     誰からも呼ばれない死蔵かつ 500 になる状態だった。client SoT の result へ是正し実配線する。
//   RBAC(selection.manage) ＋ tenant ownership ＋ 値 validation ＋ 履歴 ＋ honest error を server に集約。
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    // VIEWER は選考結果を変更不可（server が正。UI 非表示だけに依存しない）。
    if (!can(user.companyRole, 'selection.manage')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const body = await request.json().catch(() => null)
    const newResult = body?.result
    if (!isSelectionResultValue(newResult)) {
      return apiError('VALIDATION_ERROR', '選考結果の値が不正です（未対応 / 検討中 / 二次通過 / 不採用）')
    }

    const supabase = await createClientServerClient()

    // 所有権確認 + 現在値取得（自社のみ。他社 id は行が返らず NOT_FOUND）。
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, result')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (appError) return apiError('INTERNAL_ERROR', '応募者情報の取得に失敗しました')
    if (!applicant) return apiError('NOT_FOUND', '応募者が見つかりません')

    const oldResult = (applicant as { result: string | null }).result ?? '未対応'
    if (oldResult === newResult) {
      return successJson({ updated: false, result: newResult })
    }

    // 更新（authenticated client＝RLS/RBAC が DB でも効く）。更新後の行を取得し、
    // 0 行（RLS でブロック等）は正直に失敗として返す（fake success を作らない）。
    const { data: updated, error: updateError } = await supabase
      .from('applicants')
      .update({ result: newResult, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', user.companyId)
      .select('id, result')
      .maybeSingle()
    if (updateError || !updated) {
      return apiError('INTERNAL_ERROR', '選考結果の更新に失敗しました')
    }

    // 変更履歴（selection_status_histories）。監査目的のため service-role で best-effort 記録。
    // 記録失敗は保存の成否に影響させない（実データ＝applicants.result は更新済み）。
    try {
      const svc = createServiceRoleClient()
      await svc.from('selection_status_histories').insert({
        applicant_id: id,
        old_status: oldResult,
        new_status: newResult,
        changed_by: user.userId,
      })
    } catch {
      // best-effort（履歴の失敗で保存を失敗にしない）
    }

    return successJson({ updated: true, result: (updated as { result: string | null }).result ?? newResult })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { isSelectionResultValue, validateSelectionMemo } from '@/lib/applicants/selectionResult'

// 選考結果＋選考メモの更新（client・自社 applicant のみ）。SoT:
//   選考結果 = applicants.result（未対応/検討中/二次通過/不採用）
//   選考メモ = applicants.selection_memo（client/admin 共通の単一 TEXT）
//   最終更新者/日時 = applicants.selection_memo_updated_by / _at（メモ本文が実変更された時のみ更新）
// result と selection_memo は同じ applicants 行の列なので 1 回の UPDATE で原子的に保存する（partial success 無し）。
// RBAC(selection.manage) ＋ tenant ownership ＋ 値 validation ＋ 履歴(result のみ) ＋ honest error を server に集約。
// body は後方互換: { result?, selection_memo? }（少なくとも一方は必須）。一覧/ダッシュボードは result のみ送る。
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    // VIEWER は選考結果/メモを変更不可（server が正。UI 非表示だけに依存しない）。
    if (!can(user.companyRole, 'selection.manage')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const body = await request.json().catch(() => null)
    const hasResult = body != null && 'result' in body
    const hasMemo = body != null && 'selection_memo' in body
    if (!hasResult && !hasMemo) {
      return apiError('VALIDATION_ERROR', 'result または selection_memo のいずれかが必要です')
    }

    // result validation（存在時のみ）。selection_status には書かない。
    let newResult: string | null = null
    if (hasResult) {
      if (!isSelectionResultValue(body.result)) {
        return apiError('VALIDATION_ERROR', '選考結果の値が不正です（未対応 / 検討中 / 二次通過 / 不採用）')
      }
      newResult = body.result
    }

    // memo validation（存在時のみ）。string/trim/<=2000。空文字はクリアとして許可。
    let newMemo: string | null = null
    if (hasMemo) {
      const v = validateSelectionMemo(body.selection_memo)
      if (!v.ok) return apiError('VALIDATION_ERROR', v.error)
      newMemo = v.value
    }

    const supabase = await createClientServerClient()

    // 所有権確認 + 現在値取得（自社のみ・他社 id は行が返らず NOT_FOUND）。
    const { data: current, error: appError } = await supabase
      .from('applicants')
      .select('id, result, selection_memo')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (appError) return apiError('INTERNAL_ERROR', '応募者情報の取得に失敗しました')
    if (!current) return apiError('NOT_FOUND', '応募者が見つかりません')

    const cur = current as { result: string | null; selection_memo: string | null }
    const oldResult = cur.result ?? '未対応'
    const oldMemo = cur.selection_memo ?? ''

    const resultChanged = hasResult && newResult !== oldResult
    const memoChanged = hasMemo && newMemo !== oldMemo

    // no-op（どちらも変化なし）は honest に updated:false。result 同一でも memo だけ変われば保存、逆も同様。
    if (!resultChanged && !memoChanged) {
      return successJson({ updated: false, result: oldResult, selection_memo: oldMemo })
    }

    const nowIso = new Date().toISOString()
    const payload: Record<string, unknown> = { updated_at: nowIso }
    if (resultChanged) payload.result = newResult
    if (memoChanged) {
      // メモ本文が実際に変わった時のみ actor/time を更新（result のみ変更では触らない）。
      payload.selection_memo = newMemo
      payload.selection_memo_updated_by = user.userId
      payload.selection_memo_updated_at = nowIso
    }

    const { data: updated, error: updateError } = await supabase
      .from('applicants')
      .update(payload)
      .eq('id', id)
      .eq('company_id', user.companyId)
      .select('id, result, selection_memo, selection_memo_updated_at')
      .maybeSingle()
    if (updateError || !updated) {
      return apiError('INTERNAL_ERROR', '選考結果の更新に失敗しました')
    }
    const row = updated as { result: string | null; selection_memo: string | null; selection_memo_updated_at: string | null }

    // 選考結果の変更履歴（result が実変更された時のみ）。メモ本文は履歴に入れない。
    if (resultChanged) {
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
    }

    return successJson({
      updated: true,
      result: row.result ?? oldResult,
      selection_memo: row.selection_memo ?? '',
      selection_memo_updated_at: row.selection_memo_updated_at ?? null,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

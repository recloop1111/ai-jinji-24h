import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

const MAX_MEMO_LENGTH = 2000

type RouteParams = { params: Promise<{ id: string; memo_id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id, memo_id } = await params
    const body = await request.json().catch(() => null)

    if (!body || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'content は必須です')
    }

    const content = body.content.trim()
    if (content.length > MAX_MEMO_LENGTH) {
      return apiError('VALIDATION_ERROR', `content は${MAX_MEMO_LENGTH}文字以内で入力してください`)
    }

    const supabase = await createClient()

    // 応募者の所有権確認
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .single()

    if (appError || !applicant) {
      return apiError('NOT_FOUND', '応募者が見つかりません')
    }

    // メモ更新
    const { data: memo, error: updateError } = await supabase
      .from('internal_memos')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', memo_id)
      .eq('applicant_id', id)
      .select('id, content, updated_at')
      .single()

    if (updateError || !memo) {
      return apiError('NOT_FOUND', 'メモが見つかりません')
    }

    return successJson(memo)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id, memo_id } = await params
    const supabase = await createClient()

    // 応募者の所有権確認
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .single()

    if (appError || !applicant) {
      return apiError('NOT_FOUND', '応募者が見つかりません')
    }

    // メモ削除
    const { error: deleteError } = await supabase
      .from('internal_memos')
      .delete()
      .eq('id', memo_id)
      .eq('applicant_id', id)

    if (deleteError) {
      return apiError('INTERNAL_ERROR', 'メモの削除に失敗しました')
    }

    return successJson({ deleted: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

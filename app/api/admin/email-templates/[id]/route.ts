import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.subject === 'string') {
      if (body.subject.trim().length === 0) return apiError('VALIDATION_ERROR', 'subject は空にできません')
      if (body.subject.trim().length > 200) return apiError('VALIDATION_ERROR', 'subject は200文字以内で入力してください')
      updates.subject = body.subject.trim()
    }
    if (typeof body.body === 'string') {
      if (body.body.trim().length === 0) return apiError('VALIDATION_ERROR', 'body は空にできません')
      if (body.body.trim().length > 10000) return apiError('VALIDATION_ERROR', 'body は10000文字以内で入力してください')
      updates.body = body.body.trim()
    }

    if (Object.keys(updates).length <= 1) {
      return apiError('VALIDATION_ERROR', '更新する項目がありません')
    }

    const supabase = await createClient()

    const { data: template, error: updateError } = await supabase
      .from('email_templates')
      .update(updates)
      .eq('id', id)
      .select('id, company_id, template_type, subject, body, updated_at')
      .single()

    if (updateError || !template) {
      return apiError('NOT_FOUND', 'テンプレートが見つかりません')
    }

    return successJson(template)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = await createClient()

    const { error: deleteError } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return apiError('INTERNAL_ERROR', 'テンプレートの削除に失敗しました')
    }

    return successJson({ deleted: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

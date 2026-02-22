import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id } = await params
    const body = await request.json().catch(() => null)

    if (!body || (!body.subject && !body.body)) {
      return apiError('VALIDATION_ERROR', 'subject または body のいずれかは必須です')
    }

    if (typeof body.subject === 'string' && body.subject.length > 200) {
      return apiError('VALIDATION_ERROR', 'subject は200文字以内で入力してください')
    }
    if (typeof body.body === 'string' && body.body.length > 10000) {
      return apiError('VALIDATION_ERROR', 'body は10000文字以内で入力してください')
    }

    const supabase = await createClient()

    // テンプレートの所有権確認
    const { data: template, error: tplError } = await supabase
      .from('email_templates')
      .select('id')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .single()

    if (tplError || !template) {
      return apiError('NOT_FOUND', 'テンプレートが見つかりません')
    }

    // 更新対象のフィールドを構築
    const updates: Record<string, string> = { updated_at: new Date().toISOString() }
    if (typeof body.subject === 'string') updates.subject = body.subject
    if (typeof body.body === 'string') updates.body = body.body

    const { error: updateError } = await supabase
      .from('email_templates')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', 'テンプレートの更新に失敗しました')
    }

    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

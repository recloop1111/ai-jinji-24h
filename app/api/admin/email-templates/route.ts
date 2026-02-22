import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id') ?? ''

    if (companyId && !isValidUUID(companyId)) {
      return apiError('VALIDATION_ERROR', 'company_id の形式が不正です')
    }

    const supabase = await createClient()

    let query = supabase
      .from('email_templates')
      .select('id, company_id, template_type, subject, body, updated_at, companies ( name )')

    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    query = query.order('updated_at', { ascending: false })

    const { data: templates, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', 'テンプレートの取得に失敗しました')
    }

    const items = (templates ?? []).map((t) => ({
      id: t.id,
      company_id: t.company_id,
      company_name: (t.companies as unknown as { name: string } | null)?.name ?? '',
      template_type: t.template_type,
      subject: t.subject,
      body: t.body,
      updated_at: t.updated_at,
    }))

    return successJson({ templates: items })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    if (!body.company_id || !isValidUUID(body.company_id)) {
      return apiError('VALIDATION_ERROR', 'company_id は必須です')
    }
    if (typeof body.template_type !== 'string' || body.template_type.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'template_type は必須です')
    }
    if (typeof body.subject !== 'string' || body.subject.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'subject は必須です')
    }
    if (body.subject.trim().length > 200) {
      return apiError('VALIDATION_ERROR', 'subject は200文字以内で入力してください')
    }
    if (typeof body.body !== 'string' || body.body.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'body は必須です')
    }
    if (body.body.trim().length > 10000) {
      return apiError('VALIDATION_ERROR', 'body は10000文字以内で入力してください')
    }

    const supabase = await createClient()

    const { data: template, error: insertError } = await supabase
      .from('email_templates')
      .insert({
        company_id: body.company_id,
        template_type: body.template_type.trim(),
        subject: body.subject.trim(),
        body: body.body.trim(),
      })
      .select('id, company_id, template_type, subject, body, updated_at')
      .single()

    if (insertError || !template) {
      return apiError('INTERNAL_ERROR', 'テンプレートの作成に失敗しました')
    }

    return successJson(template, 201)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

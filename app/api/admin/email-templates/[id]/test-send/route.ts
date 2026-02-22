import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.to !== 'string' || !body.to.includes('@')) {
      return apiError('VALIDATION_ERROR', '有効な送信先メールアドレス (to) を指定してください')
    }

    const supabase = await createClient()

    // テンプレート取得
    const { data: template, error: tplError } = await supabase
      .from('email_templates')
      .select('id, subject, body, company_id')
      .eq('id', id)
      .single()

    if (tplError || !template) {
      return apiError('NOT_FOUND', 'テンプレートが見つかりません')
    }

    // 外部APIは呼び出さず、sent_emails にテスト送信ログを記録
    const { error: logError } = await supabase
      .from('sent_emails')
      .insert({
        company_id: template.company_id,
        template_id: template.id,
        to_address: body.to,
        subject: `[テスト] ${template.subject}`,
        body: template.body,
        status: 'test',
        sent_by: admin.userId,
      })

    if (logError) {
      return apiError('INTERNAL_ERROR', 'テスト送信ログの記録に失敗しました')
    }

    return successJson({ sent: true, to: body.to, note: 'テスト送信（外部API未呼び出し）' })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

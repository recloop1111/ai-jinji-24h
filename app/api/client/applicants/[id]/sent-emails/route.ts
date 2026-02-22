import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id } = await params
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

    // 送信メール一覧取得
    const { data: sentEmails, error: emailsError } = await supabase
      .from('sent_emails')
      .select('id, template_type, to_email, status, sent_at')
      .eq('applicant_id', id)
      .eq('company_id', user.companyId)
      .order('sent_at', { ascending: false })

    if (emailsError) {
      return apiError('INTERNAL_ERROR', '送信メールの取得に失敗しました')
    }

    return successJson({ sent_emails: sentEmails ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

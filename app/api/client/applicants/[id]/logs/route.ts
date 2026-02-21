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

    // 面接ID取得
    const { data: interview, error: intError } = await supabase
      .from('interviews')
      .select('id')
      .eq('applicant_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (intError || !interview) {
      return apiError('NOT_FOUND', '面接データが見つかりません')
    }

    // 面接ログ取得
    const { data: logs, error: logsError } = await supabase
      .from('interview_logs')
      .select('speaker, content, timestamp_ms')
      .eq('interview_id', interview.id)
      .order('timestamp_ms', { ascending: true })

    if (logsError) {
      return apiError('INTERNAL_ERROR', 'ログの取得に失敗しました')
    }

    return successJson({ logs: logs ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

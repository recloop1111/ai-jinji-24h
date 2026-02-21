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

    // メモ一覧取得
    const { data: memos, error: memosError } = await supabase
      .from('internal_memos')
      .select('id, content, created_at, updated_at')
      .eq('applicant_id', id)
      .order('created_at', { ascending: false })

    if (memosError) {
      return apiError('INTERNAL_ERROR', 'メモの取得に失敗しました')
    }

    return successJson({ memos: memos ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

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

const MAX_MEMO_LENGTH = 2000

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id } = await params
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

    // メモ作成
    const { data: memo, error: insertError } = await supabase
      .from('internal_memos')
      .insert({
        applicant_id: id,
        content,
        created_by: user.userId,
      })
      .select('id, content, created_at')
      .single()

    if (insertError || !memo) {
      return apiError('INTERNAL_ERROR', 'メモの作成に失敗しました')
    }

    return successJson(memo, 201)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import crypto from 'crypto'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = await createClient()

    // 企業存在確認
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', id)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業が見つかりません')
    }

    // 新しいスラッグを生成
    const newSlug = crypto.randomBytes(6).toString('hex')

    const { error: updateError } = await supabase
      .from('companies')
      .update({ interview_slug: newSlug, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', 'スラッグの再生成に失敗しました')
    }

    return successJson({ new_slug: newSlug })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

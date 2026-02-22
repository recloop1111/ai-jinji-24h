import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ id: string; job_type_id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id, job_type_id } = await params
    if (!isValidUUID(id) || !isValidUUID(job_type_id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'name は必須です')
    }
    if (body.name.trim().length > 100) {
      return apiError('VALIDATION_ERROR', 'name は100文字以内で入力してください')
    }

    const supabase = await createClient()

    const { data: jobType, error: updateError } = await supabase
      .from('job_types')
      .update({ name: body.name.trim() })
      .eq('id', job_type_id)
      .eq('company_id', id)
      .select('id, name')
      .single()

    if (updateError || !jobType) {
      return apiError('NOT_FOUND', '職種が見つかりません')
    }

    return successJson(jobType)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id, job_type_id } = await params
    if (!isValidUUID(id) || !isValidUUID(job_type_id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = await createClient()

    const { error: deleteError } = await supabase
      .from('job_types')
      .delete()
      .eq('id', job_type_id)
      .eq('company_id', id)

    if (deleteError) {
      return apiError('INTERNAL_ERROR', '職種の削除に失敗しました')
    }

    return successJson({ deleted: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

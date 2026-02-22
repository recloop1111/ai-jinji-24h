import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = await createClient()

    const { data: jobTypes, error } = await supabase
      .from('job_types')
      .select('id, name')
      .eq('company_id', id)
      .order('name', { ascending: true })

    if (error) {
      return apiError('INTERNAL_ERROR', '職種の取得に失敗しました')
    }

    return successJson({ job_types: jobTypes ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
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

    // 企業存在確認
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', id)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業が見つかりません')
    }

    const { data: jobType, error: insertError } = await supabase
      .from('job_types')
      .insert({ company_id: id, name: body.name.trim() })
      .select('id, name')
      .single()

    if (insertError || !jobType) {
      return apiError('INTERNAL_ERROR', '職種の作成に失敗しました')
    }

    return successJson(jobType, 201)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

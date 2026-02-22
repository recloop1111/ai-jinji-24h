import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

const VALID_PLANS = ['light', 'standard', 'pro', 'custom'] as const
const VALID_STATUSES = ['active', 'suspended'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
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

    // 更新対象フィールドを構築
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.name === 'string' && body.name.trim().length > 0) {
      updates.name = body.name.trim()
    }
    if (typeof body.plan === 'string') {
      if (!VALID_PLANS.includes(body.plan as typeof VALID_PLANS[number])) {
        return apiError('VALIDATION_ERROR', 'plan の値が不正です（light / standard / pro / custom）')
      }
      updates.plan = body.plan
    }
    if (typeof body.status === 'string') {
      if (!VALID_STATUSES.includes(body.status as typeof VALID_STATUSES[number])) {
        return apiError('VALIDATION_ERROR', 'status の値が不正です（active / suspended）')
      }
      updates.is_suspended = body.status === 'suspended'
    }
    if (typeof body.auto_upgrade === 'boolean') {
      updates.auto_upgrade = body.auto_upgrade
    }

    if (Object.keys(updates).length <= 1) {
      return apiError('VALIDATION_ERROR', '更新する項目がありません')
    }

    const { error: updateError } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      return apiError('INTERNAL_ERROR', '企業設定の更新に失敗しました')
    }

    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

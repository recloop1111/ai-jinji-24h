import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'
import { isEmploymentTypeDb } from '@/lib/jobs/employment-types'

// 求人の更新（内容 or 公開トグル）/ 削除（client・job.manage=OWNER/ADMIN/RECRUITER・VIEWER 不可）。
//   company_id は session 固定。他社/不存在 id は自社スコープ update/delete が 0 行 → NOT_FOUND（fail-closed）。
const MAX_LEN = 200

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'job.manage')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('VALIDATION_ERROR', '入力が不正です')
    const b = body as Record<string, unknown>
    const svc = createServiceRoleClient()

    // 公開トグル
    if (b.action === 'set_active') {
      if (typeof b.is_active !== 'boolean') return apiError('VALIDATION_ERROR', '入力が不正です')
      const { data: updated, error } = await svc
        .from('jobs')
        .update({ is_active: b.is_active })
        .eq('id', id)
        .eq('company_id', user.companyId)
        .select('id')
        .maybeSingle()
      if (error) return apiError('INTERNAL_ERROR', 'ステータスの変更に失敗しました')
      if (!updated) return apiError('NOT_FOUND', '求人が見つかりません')
      await writeCompanyAuditLog({
        companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
        action: 'job.updated', resourceType: 'job', resourceId: id, metadata: { is_active: b.is_active },
      })
      return successJson({ updated: true })
    }

    // 内容更新（既定）
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    const employmentType = typeof b.employment_type === 'string' ? b.employment_type : ''
    const description = typeof b.description === 'string' ? b.description.trim() : ''
    if (!title) return apiError('VALIDATION_ERROR', '職種を入力してください')
    if (title.length > MAX_LEN || description.length > MAX_LEN) return apiError('VALIDATION_ERROR', '入力が長すぎます')
    if (!isEmploymentTypeDb(employmentType)) {
      return apiError('VALIDATION_ERROR', '雇用形態が不正です')
    }

    const { data: updated, error } = await svc
      .from('jobs')
      .update({
        title,
        employment_type: employmentType,
        description: employmentType === 'other' ? (description || null) : null,
      })
      .eq('id', id)
      .eq('company_id', user.companyId)
      .select('id')
      .maybeSingle()
    if (error) return apiError('INTERNAL_ERROR', '求人の更新に失敗しました')
    if (!updated) return apiError('NOT_FOUND', '求人が見つかりません')
    await writeCompanyAuditLog({
      companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
      action: 'job.updated', resourceType: 'job', resourceId: id, metadata: { employment_type: employmentType },
    })
    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'job.manage')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const svc = createServiceRoleClient()
    const { data: deleted, error } = await svc
      .from('jobs')
      .delete()
      .eq('id', id)
      .eq('company_id', user.companyId)
      .select('id')
      .maybeSingle()
    if (error) return apiError('INTERNAL_ERROR', '求人の削除に失敗しました')
    if (!deleted) return apiError('NOT_FOUND', '求人が見つかりません')
    await writeCompanyAuditLog({
      companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
      action: 'job.deleted', resourceType: 'job', resourceId: id, metadata: {},
    })
    return successJson({ deleted: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

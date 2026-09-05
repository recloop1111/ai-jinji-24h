import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { can } from '@/lib/rbac/permissions'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'
import { isEmploymentTypeDb } from '@/lib/jobs/employment-types'

// 求人の作成（client・job.manage=OWNER/ADMIN/RECRUITER のみ・VIEWER 不可）。E-5-4-B:
//   従来のブラウザ直 insert（jobs）を廃止。company_id は session 固定（body は信用しない）。
//   experience_type / pattern_key / is_active はサーバ側で決定（作成時は非公開=false）。
const MAX_LEN = 200

export async function POST(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'job.manage')) return apiError('FORBIDDEN')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('VALIDATION_ERROR', '入力が不正です')
    const b = body as Record<string, unknown>
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    const employmentType = typeof b.employment_type === 'string' ? b.employment_type : ''
    const description = typeof b.description === 'string' ? b.description.trim() : ''

    if (!title) return apiError('VALIDATION_ERROR', '職種を入力してください')
    if (title.length > MAX_LEN || description.length > MAX_LEN) return apiError('VALIDATION_ERROR', '入力が長すぎます')
    if (!isEmploymentTypeDb(employmentType)) {
      return apiError('VALIDATION_ERROR', '雇用形態が不正です')
    }

    const svc = createServiceRoleClient()
    const { data: created, error: insErr } = await svc
      .from('jobs')
      .insert({
        company_id: user.companyId, // session 固定
        title,
        employment_type: employmentType,
        experience_type: 'none',
        pattern_key: `${employmentType}-default`,
        is_active: false, // 作成直後は非公開（質問設定後に公開）
        description: employmentType === 'other' ? (description || null) : null,
      })
      .select('id')
      .maybeSingle()
    if (insErr) return apiError('INTERNAL_ERROR', '求人の作成に失敗しました')
    if (!created) return apiError('INTERNAL_ERROR', '求人の作成に失敗しました')

    await writeCompanyAuditLog({
      companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
      action: 'job.created', resourceType: 'job', resourceId: created.id,
      metadata: { employment_type: employmentType },
    })

    return successJson({ id: created.id })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

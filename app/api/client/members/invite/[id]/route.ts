import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'

// 招待の取消（client・member.manage=OWNER/ADMIN のみ）。pending のみ revoked 化。
//   company_id は getClientUser 由来固定（他社の招待は revoke できない）。
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'member.manage')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const svc = createServiceRoleClient()
    const { data: updated, error } = await svc
      .from('member_invites')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', user.companyId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (error) return apiError('INTERNAL_ERROR', '招待の取消に失敗しました')
    if (!updated) return apiError('NOT_FOUND', '取消対象の招待が見つかりません')

    // 操作ログ（best-effort）。
    await writeCompanyAuditLog({
      companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
      action: 'member.invite_revoked', resourceType: 'member_invite', resourceId: id, metadata: {},
    })

    return successJson({ revoked: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

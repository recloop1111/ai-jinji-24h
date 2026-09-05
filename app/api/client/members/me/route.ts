import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { validateFullName } from '@/lib/members/member-view'

// 自分自身の company_members.full_name（表示名）を更新（E-5-3-1）。
//   userId/companyId は getClientUser 由来（body から member_id/company_id/user_id を受け取らない）。
//   member display name の SoT = company_members.full_name。profiles.display_name は同期しない。
//   今回は member.manage 保有者（OWNER/ADMIN）のみ（settings のメンバー管理タブ内 UI のため）。
export async function PATCH(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'member.manage')) return apiError('FORBIDDEN')

    const body = await request.json().catch(() => null)
    const v = validateFullName(body?.full_name)
    if (!v.ok) return apiError('VALIDATION_ERROR', v.error)

    const svc = createServiceRoleClient()
    const { data: updated, error: updateError } = await svc
      .from('company_members')
      .update({ full_name: v.value, updated_at: new Date().toISOString() })
      .eq('user_id', user.userId)
      .eq('company_id', user.companyId)
      .select('id, full_name')
      .maybeSingle()
    if (updateError || !updated) return apiError('INTERNAL_ERROR', '表示名の更新に失敗しました')

    return successJson({ full_name: (updated as { full_name: string | null }).full_name ?? v.value })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

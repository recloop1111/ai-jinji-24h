import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isMemberAction, planMemberAction } from '@/lib/members/member-actions'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'

// 企業メンバーの権限変更 / 利用停止 / 再有効化 / 削除（client・member.manage=OWNER/ADMIN のみ）。
//   action-based（change_role / suspend / reactivate / remove）。member id = company_members.id。
//   company_id は getClientUser 由来固定（body/query の company_id/user_id/role は信用しない）。
//   owner は全操作対象外・self は危険操作対象外。target lookup / update とも fail-closed（0行/error は成功にしない）。
//   ※ status='removed' も物理 DELETE しない（auth user / profiles / row を残す）。role 変更で profiles は触らない。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'member.manage')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const body = await request.json().catch(() => null)
    if (!isMemberAction(body?.action)) return apiError('VALIDATION_ERROR', '不正な操作です')
    const action = body.action

    const svc = createServiceRoleClient()

    // 対象を自社スコープで取得（他社 id は返らず NOT_FOUND）。fail-closed。
    const { data: targetRow, error: fetchError } = await svc
      .from('company_members')
      .select('id, user_id, company_role, status')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (fetchError) return apiError('INTERNAL_ERROR', 'メンバーの取得に失敗しました')
    if (!targetRow) return apiError('NOT_FOUND', 'メンバーが見つかりません')
    const target = targetRow as { id: string; user_id: string; company_role: string; status: string }

    // 可否判定（owner/self/transition/role validation）。
    const plan = planMemberAction(action, { actorUserId: user.userId, target, requestedRole: body?.company_role })
    if (!plan.ok) return apiError(plan.code, plan.message)

    // conditional update（race 対策）: id/company_id 固定 ＋ 期待 status（＋role）＋ owner 除外を WHERE に含める。
    let q = svc
      .from('company_members')
      .update({ ...plan.set, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', user.companyId)
      .neq('company_role', 'owner')
      .in('status', plan.expectStatusIn)
    if (plan.expectRole !== undefined) q = q.eq('company_role', plan.expectRole)

    const { data: updated, error: updateError } = await q.select('id, company_role, status, updated_at').maybeSingle()
    if (updateError) return apiError('INTERNAL_ERROR', '操作に失敗しました')
    if (!updated) return apiError('CONFLICT', '操作を完了できませんでした（メンバーの状態が変化した可能性があります）')
    const row = updated as { id: string; company_role: string; status: string; updated_at: string | null }

    // 操作ログ（best-effort・本文/PII なし）。action ごとに stable ID と from/to を記録。
    const auditBase = { companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole, resourceType: 'member' as const, resourceId: row.id }
    if (action === 'change_role') {
      await writeCompanyAuditLog({ ...auditBase, action: 'member.role_changed', metadata: { from_role: target.company_role, to_role: row.company_role } })
    } else if (action === 'suspend') {
      await writeCompanyAuditLog({ ...auditBase, action: 'member.suspended', metadata: { from_status: target.status, to_status: 'suspended' } })
    } else if (action === 'reactivate') {
      await writeCompanyAuditLog({ ...auditBase, action: 'member.reactivated', metadata: { from_status: target.status, to_status: 'active' } })
    } else if (action === 'remove') {
      await writeCompanyAuditLog({ ...auditBase, action: 'member.removed', metadata: { from_status: target.status, to_status: 'removed' } })
    }

    return successJson({ updated: true, member: { id: row.id, company_role: row.company_role, status: row.status, updated_at: row.updated_at } })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

// 企業メンバー管理アクションの pure validation（E-5-3-3）。
//   role 変更 / suspend / reactivate / remove の可否・遷移を1箇所で判定（route/UI から共有・test 容易）。
//   ※ owner は全操作対象外・self は危険操作対象外・SoT は company_members（profiles.role は使わない）。
import { isCompanyRole } from '@/lib/rbac/roles'

export const MEMBER_ACTIONS = ['change_role', 'suspend', 'reactivate', 'remove'] as const
export type MemberAction = (typeof MEMBER_ACTIONS)[number]

// role 変更で指定できる値（owner 不可）。
export const ASSIGNABLE_ROLES = ['admin', 'recruiter', 'viewer'] as const

export type MemberTarget = { user_id: string; company_role: string; status: string }

export type ActionPlan =
  | { ok: true; set: Record<string, unknown>; expectStatusIn: string[]; expectRole?: string }
  | { ok: false; code: 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR'; message: string }

export function isMemberAction(v: unknown): v is MemberAction {
  return typeof v === 'string' && (MEMBER_ACTIONS as readonly string[]).includes(v)
}
export function isAssignableRole(v: unknown): v is (typeof ASSIGNABLE_ROLES)[number] {
  return typeof v === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(v)
}

// action の可否＋DB へ適用する set / 楽観ロック用の期待状態（expectStatusIn / expectRole）を返す。
//   実際の UPDATE と conditional（id/company_id/status/role）は route 側で組む。
export function planMemberAction(
  action: MemberAction,
  opts: { actorUserId: string; target: MemberTarget; requestedRole?: unknown },
): ActionPlan {
  const { actorUserId, target, requestedRole } = opts

  // owner は全操作対象外（server でも明示保護。owner transfer は v1 対象外）。
  if (target.company_role === 'owner') {
    return { ok: false, code: 'FORBIDDEN', message: 'オーナーは変更できません' }
  }
  // self は危険操作（role/suspend/remove/reactivate）対象外＝自己ロックアウト防止。
  if (target.user_id === actorUserId) {
    return { ok: false, code: 'FORBIDDEN', message: '自分自身は操作できません' }
  }

  switch (action) {
    case 'change_role': {
      if (!isAssignableRole(requestedRole) || !isCompanyRole(requestedRole)) {
        return { ok: false, code: 'VALIDATION_ERROR', message: '権限は 管理者 / 採用担当 / 閲覧者 のいずれかを指定してください' }
      }
      if (target.status !== 'active') {
        return { ok: false, code: 'CONFLICT', message: 'アクティブなメンバーのみ権限を変更できます' }
      }
      if (requestedRole === target.company_role) {
        return { ok: false, code: 'CONFLICT', message: '現在と同じ権限です' }
      }
      return { ok: true, set: { company_role: requestedRole }, expectStatusIn: ['active'], expectRole: target.company_role }
    }
    case 'suspend': {
      if (target.status !== 'active') {
        return { ok: false, code: 'CONFLICT', message: 'アクティブなメンバーのみ利用停止できます' }
      }
      return { ok: true, set: { status: 'suspended' }, expectStatusIn: ['active'] }
    }
    case 'reactivate': {
      if (target.status !== 'suspended' && target.status !== 'removed') {
        return { ok: false, code: 'CONFLICT', message: '停止中または削除済みのメンバーのみ再有効化できます' }
      }
      return { ok: true, set: { status: 'active' }, expectStatusIn: ['suspended', 'removed'] }
    }
    case 'remove': {
      if (target.status !== 'active' && target.status !== 'suspended') {
        return { ok: false, code: 'CONFLICT', message: 'この状態のメンバーは削除できません' }
      }
      return { ok: true, set: { status: 'removed' }, expectStatusIn: ['active', 'suspended'] }
    }
    default:
      return { ok: false, code: 'VALIDATION_ERROR', message: '不正な操作です' }
  }
}

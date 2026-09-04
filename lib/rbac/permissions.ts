// 企業RBAC の central permission map（Phase E-5-2）。
//   SoT = company_members.company_role（owner/admin/recruiter/viewer）。roles.ts の CompanyRole を使用。
//   ※ AIMEN24 運営 admin（profiles.role='admin'|'super_admin'）とは別体系。ここでは扱わない（混同・流用しない）。
//   使い方: サーバ route / UI とも can(role, permission) で判定する。route ごとに if (role==='owner'||...) を書かない。
//   UNKNOWN role / null / 未知の permission は default deny。

import { type CompanyRole, isCompanyRole } from './roles'

// アプリ全体で意味を持つ権限（未実装機能の権限も将来のため定義。ただし未実装画面は新設しない）。
export const PERMISSIONS = [
  // 全 role（VIEWER 含む）
  'applicant.read',
  // OWNER / ADMIN / RECRUITER
  'resume.pdf.download',
  'report.pdf.download',
  'applicant_report.pdf.download',
  'applicant_report.email_share',
  'share_link.manage',
  'selection.manage',
  'applicant_memo.manage',
  'job.manage',
  'question.manage',
  // OWNER / ADMIN
  'member.manage',
  'member.role_change',
  'audit.read',
  'company_settings.manage',
  // OWNER のみ
  'billing.manage',
  'subscription.manage',
  'company_destructive_action',
] as const

export type Permission = (typeof PERMISSIONS)[number]

// role 別付与セット（上位 role は下位の権限を包含）。
const ALL_ROLES: Permission[] = ['applicant.read']

const RECRUITER_PLUS: Permission[] = [
  'resume.pdf.download',
  'report.pdf.download',
  'applicant_report.pdf.download',
  'applicant_report.email_share',
  'share_link.manage',
  'selection.manage',
  'applicant_memo.manage',
  'job.manage',
  'question.manage',
]

const ADMIN_PLUS: Permission[] = [
  'member.manage',
  'member.role_change',
  'audit.read',
  'company_settings.manage',
]

const OWNER_ONLY: Permission[] = [
  'billing.manage',
  'subscription.manage',
  'company_destructive_action',
]

const ROLE_PERMISSIONS: Record<CompanyRole, ReadonlySet<Permission>> = {
  viewer: new Set<Permission>(ALL_ROLES),
  recruiter: new Set<Permission>([...ALL_ROLES, ...RECRUITER_PLUS]),
  admin: new Set<Permission>([...ALL_ROLES, ...RECRUITER_PLUS, ...ADMIN_PLUS]),
  owner: new Set<Permission>([...ALL_ROLES, ...RECRUITER_PLUS, ...ADMIN_PLUS, ...OWNER_ONLY]),
}

/**
 * role が permission を持つか。UNKNOWN role / null / undefined / 未知の permission は false（default deny）。
 * サーバ（route）でも UI でも同一の判定を使うこと（UI 非表示だけに依存しない）。
 */
export function can(role: CompanyRole | string | null | undefined, permission: Permission): boolean {
  if (!isCompanyRole(role)) return false
  return ROLE_PERMISSIONS[role].has(permission)
}

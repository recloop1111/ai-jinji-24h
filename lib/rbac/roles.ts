// 企業RBAC の基礎型（Phase E-5-1）。DB: company_members.company_role の許可値と一致。
//   ※ AIMEN24 運営 admin の profiles.role（'admin'|'super_admin'）とは別体系（混同しない）。
//   ※ can()/requirePermission()/permission map は Phase E-5-2 で追加（本ファイルには置かない）。

export const COMPANY_ROLES = ['owner', 'admin', 'recruiter', 'viewer'] as const
export type CompanyRole = (typeof COMPANY_ROLES)[number]

export const COMPANY_MEMBER_STATUSES = ['active', 'suspended', 'removed'] as const
export type CompanyMemberStatus = (typeof COMPANY_MEMBER_STATUSES)[number]

export function isCompanyRole(v: unknown): v is CompanyRole {
  return typeof v === 'string' && (COMPANY_ROLES as readonly string[]).includes(v)
}
export function isCompanyMemberStatus(v: unknown): v is CompanyMemberStatus {
  return typeof v === 'string' && (COMPANY_MEMBER_STATUSES as readonly string[]).includes(v)
}

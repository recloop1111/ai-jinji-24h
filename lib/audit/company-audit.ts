// server 専用（createServiceRoleClient を使用＝サーバでのみ import すること。'server-only' パッケージは未導入のため使わない）。
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { CompanyRole } from '@/lib/rbac/roles'

// 企業操作ログの server-only 書き込み（E-5-4-1）。
//   ※ action は英語 stable ID（allowlist union）。DB は text だが app 側で型制限し任意文字列を弾く。
//   ※ metadata は最小限の安全 primitive のみ（PII/token/本文/credential を入れない・helper は body/token を受けない）。
//   ※ export=fail-closed / mutation=best-effort の両方で使えるよう { ok } を返す（helper は primary の成否を決めない）。

export const COMPANY_AUDIT_ACTIONS = [
  'applicant.resume_pdf_exported',
  'applicant.report_pdf_exported',
  'applicant.csv_exported',
  'applicant.selection_result_changed',
  'applicant.selection_memo_changed',
  'member.invite_created',
  'member.invite_regenerated',
  'member.invite_revoked',
  'member.joined',
  'member.role_changed',
  'member.suspended',
  'member.reactivated',
  'member.removed',
  'company.billing_profile_changed',
  'company.plan_changed',
  'company.setting_password_changed',
  'company.suspension_requested',
  'company.suspension_cancelled',
  'company.emergency_suspension_requested',
  'template.updated',
  'billing.invoice_pdf_exported',
  // E-5-4-B: jobs / questions / general settings の server route 化に伴う mutation。
  'job.created',
  'job.updated',
  'job.deleted',
  'question.updated',
  'company_settings.updated',
] as const
export type CompanyAuditAction = (typeof COMPANY_AUDIT_ACTIONS)[number]

export const COMPANY_AUDIT_RESOURCE_TYPES = ['applicant', 'member', 'member_invite', 'company', 'template', 'billing_record', 'job'] as const
export type CompanyAuditResourceType = (typeof COMPANY_AUDIT_RESOURCE_TYPES)[number]

// metadata に入れてよいのは安全な primitive のみ（object/array/関数などは受けない＝PII/本文の巻き込みを防ぐ）。
type SafePrimitive = string | number | boolean | null
export type CompanyAuditMetadata = Record<string, SafePrimitive>

export type CompanyAuditInput = {
  companyId: string
  actorUserId: string | null
  actorCompanyRole: CompanyRole | null
  action: CompanyAuditAction
  resourceType: CompanyAuditResourceType
  resourceId?: string | null
  metadata?: CompanyAuditMetadata
}

export type CompanyAuditResult = { ok: true } | { ok: false }

// metadata を安全な primitive のみに正規化（想定外の型が来ても object を汚さない）。
function sanitizeMetadata(input: CompanyAuditMetadata | undefined): Record<string, SafePrimitive> {
  const out: Record<string, SafePrimitive> = {}
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input)) {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v
    // それ以外（object/array/関数/undefined）は捨てる（本文/PII の巻き込み防止）
  }
  return out
}

export async function writeCompanyAuditLog(input: CompanyAuditInput): Promise<CompanyAuditResult> {
  try {
    const svc = createServiceRoleClient()
    const { error } = await svc.from('company_audit_logs').insert({
      company_id: input.companyId,
      actor_user_id: input.actorUserId,
      actor_company_role: input.actorCompanyRole,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      metadata: sanitizeMetadata(input.metadata),
    })
    // 失敗しても PII/SQL 詳細は出さない（console 出力しない＝本番方針）。
    if (error) return { ok: false }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

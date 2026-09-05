import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { applyNextMonthLimit } from '@/lib/companies/applyNextMonthLimit'
import { can } from '@/lib/rbac/permissions'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'

export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClientServerClient()

    const { data: company, error } = await supabase
      .from('companies')
      .select('id, name, email, interview_slug, plan, monthly_interview_limit, next_month_interview_limit, next_month_limit_effective_month, is_suspended, onboarding_completed, created_at')
      .eq('id', user.companyId)
      .single()

    if (error || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    // 翌月上限予約の月初昇格
    const applied = await applyNextMonthLimit({
      id: company.id,
      monthly_interview_limit: company.monthly_interview_limit ?? null,
      next_month_interview_limit: company.next_month_interview_limit ?? null,
      next_month_limit_effective_month: company.next_month_limit_effective_month ?? null,
    })

    return successJson({
      id: company.id,
      name: company.name,
      email: company.email,
      interview_slug: company.interview_slug,
      plan: company.plan,
      monthly_interview_limit: applied.monthly_interview_limit,
      // 停止判定の正は is_suspended（status は後方互換の派生値）
      is_suspended: company.is_suspended === true,
      status: company.is_suspended ? 'suspended' : 'active',
      onboarding_completed: company.onboarding_completed,
      created_at: company.created_at,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

const MAX_LEN = 200
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 一般企業設定（会社名/担当者/連絡先メール/電話）の更新。E-5-4-B:
//   従来のブラウザ直 update（companies）を廃止し、getClientUser + RBAC(company_settings.manage=
//   OWNER/ADMIN) + session company 固定 + service-role write + 監査へ移行。VIEWER/RECRUITER 不可。
export async function PATCH(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'company_settings.manage')) return apiError('FORBIDDEN')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('VALIDATION_ERROR', '入力が不正です')
    const b = body as Record<string, unknown>

    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
    const name = str(b.name)
    const contactPerson = str(b.contact_person)
    const contactEmail = str(b.contact_email)
    const phone = str(b.phone)

    if (!name) return apiError('VALIDATION_ERROR', '会社名を入力してください')
    if ([name, contactPerson, contactEmail, phone].some((v) => v.length > MAX_LEN)) {
      return apiError('VALIDATION_ERROR', '入力が長すぎます')
    }
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      return apiError('VALIDATION_ERROR', 'メールアドレスの形式が正しくありません')
    }

    // company_id は session 固定（body の id は信用しない）。service-role で自社1行のみ更新。
    const svc = createServiceRoleClient()
    const { data: updated, error: updErr } = await svc
      .from('companies')
      .update({
        name,
        contact_person: contactPerson || null,
        contact_email: contactEmail || null,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.companyId)
      .select('id')
      .maybeSingle()
    if (updErr) return apiError('INTERNAL_ERROR', '保存に失敗しました')
    if (!updated) return apiError('NOT_FOUND', '企業情報が見つかりません')

    // 監査（best-effort・値は入れず、変更されたフィールド名のみ）。PII（会社名/連絡先）を metadata に載せない。
    await writeCompanyAuditLog({
      companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
      action: 'company_settings.updated', resourceType: 'company', resourceId: user.companyId,
      metadata: { fields: 'name,contact_person,contact_email,phone' },
    })

    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

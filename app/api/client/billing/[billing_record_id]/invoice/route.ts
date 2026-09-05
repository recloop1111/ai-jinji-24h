import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { apiError, errorJson } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isIssuableStatus } from '@/lib/config/billing'
import { buildInvoicePdf, toInvoiceInput } from '@/lib/billing/invoice-pdf'
import { writeCompanyAuditLog } from '@/lib/audit/company-audit'

// 請求書PDFダウンロード（client・自社の billing_record のみ）。
// pdfkit が Node の fs/streams に依存するため Node runtime を明示。
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ billing_record_id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    // role 認可を record 取得より先に行う（recruiter/viewer は自社/他社/不存在いずれでも 403＝存在有無を漏らさない）。
    if (!can(user.companyRole, 'billing.read')) return apiError('FORBIDDEN')

    const { billing_record_id } = await params
    if (!isValidUUID(billing_record_id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = createServiceRoleClient()

    const { data: record, error: recError } = await supabase
      .from('billing_records')
      .select('id, company_id, billing_month, interview_count, amount_jpy, tax_jpy, total_jpy, payment_status, created_at, invoice_snapshot')
      .eq('id', billing_record_id)
      .maybeSingle()
    if (recError) return apiError('INTERNAL_ERROR', '請求情報の取得に失敗しました')
    if (!record) return apiError('NOT_FOUND', '請求が見つかりません')

    // 他社の請求書は不可
    if (record.company_id !== user.companyId) {
      return apiError('FORBIDDEN', 'この請求書にはアクセスできません')
    }
    // 発行可能なのは pending / paid のみ（failed/refunded は不可）
    if (!isIssuableStatus(record.payment_status)) {
      return errorJson('UNPROCESSABLE', 'この請求は請求書を発行できません', 422)
    }

    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('name, contact_person')
      .eq('id', record.company_id)
      .maybeSingle()
    if (compError || !company) return apiError('INTERNAL_ERROR', '企業情報の取得に失敗しました')

    // 請求先（宛名）= invoice_snapshot 優先 → company_billing_profiles → companies fallback。
    const { data: profile } = await supabase
      .from('company_billing_profiles')
      .select('billing_name, department, contact_name, postal_code, address, building, phone')
      .eq('company_id', record.company_id)
      .maybeSingle()

    // 発行者/振込先/支払案内文 = invoice_snapshot 優先 → billing_issuer_settings(DB) → config fallback。
    const { data: issuerSettings } = await supabase
      .from('billing_issuer_settings')
      .select('issuer_name, postal_code, address, building, tel, registration_number, bank_name, branch_name, account_type, account_number, account_holder, payment_note')
      .eq('id', 'default')
      .maybeSingle()

    const input = toInvoiceInput(
      record,
      company,
      profile ?? null,
      record.invoice_snapshot ?? null,
      issuerSettings ?? null,
    )
    const pdf = await buildInvoicePdf(input)

    // export は fail-closed 監査: 記録できて初めて download を返す（記録失敗なら 500・PDF を返さない）。
    // metadata は billing_month(YYYY-MM) のみ（金額/snapshot/宛名/振込先/番号/PII は入れない）。
    const bm = typeof record.billing_month === 'string' && record.billing_month.length >= 7 ? record.billing_month.slice(0, 7) : null
    const audit = await writeCompanyAuditLog({
      companyId: user.companyId, actorUserId: user.userId, actorCompanyRole: user.companyRole,
      action: 'billing.invoice_pdf_exported', resourceType: 'billing_record', resourceId: record.id,
      metadata: bm ? { billing_month: bm } : {},
    })
    if (!audit.ok) return apiError('INTERNAL_ERROR', '操作を記録できなかったため、ダウンロードを中止しました。')

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${input.invoiceNumber}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

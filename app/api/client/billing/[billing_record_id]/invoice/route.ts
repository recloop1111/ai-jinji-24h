import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { apiError, errorJson } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isIssuableStatus } from '@/lib/config/billing'
import { buildInvoicePdf, toInvoiceInput } from '@/lib/billing/invoice-pdf'

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

    const input = toInvoiceInput(record, company, profile ?? null, record.invoice_snapshot ?? null)
    const pdf = await buildInvoicePdf(input)

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

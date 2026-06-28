import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { apiError, errorJson } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isIssuableStatus } from '@/lib/config/billing'
import { buildInvoicePdf, toInvoiceInput } from '@/lib/billing/invoice-pdf'

// 請求書PDFダウンロード（admin・全社の billing_record）。client と同一ビルダーを共有。
// 認可差は「自社限定(client) vs 全社(admin)」のみ。pdfkit のため Node runtime。
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ billing_record_id: string }> },
) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { billing_record_id } = await params
    if (!isValidUUID(billing_record_id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = createServiceRoleClient()

    const { data: record, error: recError } = await supabase
      .from('billing_records')
      .select('id, company_id, billing_month, interview_count, amount_jpy, tax_jpy, total_jpy, payment_status, created_at')
      .eq('id', billing_record_id)
      .maybeSingle()
    if (recError) return apiError('INTERNAL_ERROR', '請求情報の取得に失敗しました')
    if (!record) return apiError('NOT_FOUND', '請求が見つかりません')

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

    const input = toInvoiceInput(record, company)
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

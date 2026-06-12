import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

const MAX_PER_PAGE = 50

export async function GET(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(searchParams.get('per_page') ?? '12', 10) || 12))
    const offset = (page - 1) * perPage

    const supabase = await createClient()

    // 確定請求は実DBの billing_records（invoices テーブルは存在しない）。
    // 既存レスポンス互換へマッピング: amount=amount_jpy(税抜) / tax_amount=tax_jpy / status=payment_status / period=billing_month(date)→YYYY-MM / stripe_invoice_url=invoice_pdf_url
    const { data: records, count, error } = await supabase
      .from('billing_records')
      .select('id, billing_month, plan_at_billing, interview_count, amount_jpy, tax_jpy, payment_status, invoice_pdf_url, created_at', { count: 'exact' })
      .eq('company_id', user.companyId)
      .order('billing_month', { ascending: false })
      .range(offset, offset + perPage - 1)

    if (error) {
      return apiError('INTERNAL_ERROR', '請求データの取得に失敗しました')
    }

    const invoices = (records ?? []).map((r) => ({
      id: r.id,
      period: r.billing_month ? String(r.billing_month).slice(0, 7) : '',
      plan: r.plan_at_billing,
      interview_count: r.interview_count,
      amount: r.amount_jpy,
      tax_amount: r.tax_jpy,
      status: r.payment_status,
      stripe_invoice_url: r.invoice_pdf_url,
      created_at: r.created_at,
    }))

    return successJson({
      invoices,
      total_count: count ?? 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

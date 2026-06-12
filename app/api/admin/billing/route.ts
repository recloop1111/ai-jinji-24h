import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id') ?? ''
    const period = searchParams.get('period') ?? ''

    if (companyId && !isValidUUID(companyId)) {
      return apiError('VALIDATION_ERROR', 'company_id の形式が不正です')
    }
    if (period && !/^\d{4}-\d{2}$/.test(period)) {
      return apiError('VALIDATION_ERROR', 'period の形式が不正です（YYYY-MM）')
    }

    const supabase = await createClient()

    // 確定請求は実DBの billing_records（invoices テーブルは存在しない）。
    // 既存レスポンス互換のためマッピング: amount=amount_jpy(税抜) / status=payment_status / period=billing_month(date)→YYYY-MM
    let query = supabase
      .from('billing_records')
      .select('id, company_id, plan_at_billing, interview_count, amount_jpy, payment_status, invoice_pdf_url, billing_month, companies ( name )')

    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    if (period) {
      // billing_month は date。当月の範囲で絞る（period=YYYY-MM）
      const [y, m] = period.split('-').map(Number)
      const start = `${period}-01`
      const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`
      query = query.gte('billing_month', start).lt('billing_month', end)
    }

    query = query.order('billing_month', { ascending: false })

    const { data: records, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', '請求データの取得に失敗しました')
    }

    let totalRevenue = 0
    const items = (records ?? []).map((rec) => {
      const companyName = (rec.companies as unknown as { name: string } | null)?.name ?? ''
      const amount = typeof rec.amount_jpy === 'number' ? rec.amount_jpy : 0
      totalRevenue += amount
      return {
        company_id: rec.company_id,
        company_name: companyName,
        plan: rec.plan_at_billing,
        interview_count: rec.interview_count,
        amount,
        status: rec.payment_status,
        stripe_invoice_url: rec.invoice_pdf_url,
      }
    })

    return successJson({
      invoices: items,
      total_revenue: totalRevenue,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

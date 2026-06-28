import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { jstDueDate, effectiveStatus } from '@/lib/billing/dueDate'

// 確定請求一覧（admin・service-role）。当月見込みダッシュボード（summary）とは別の billing_records 一覧。
// フィルタ: billing_month（YYYY-MM or YYYY-MM-01）/ status（all/pending/paid/overdue）。
// overdue は DB値ではなく created_at の翌月末超過＋pending で導出する。
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const url = new URL(request.url)
    const monthParam = url.searchParams.get('billing_month') // 'YYYY-MM' or 'YYYY-MM-01' or null
    const statusParam = url.searchParams.get('status') ?? 'all' // all/pending/paid/overdue

    const supabase = createServiceRoleClient()

    let query = supabase
      .from('billing_records')
      .select('id, company_id, billing_month, interview_count, amount_jpy, tax_jpy, total_jpy, payment_status, created_at, paid_at')
      .order('billing_month', { ascending: false })
      .order('created_at', { ascending: false })

    if (monthParam) {
      // 'YYYY-MM' は '-01' を補って date 列と一致させる
      const billingMonth = /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : monthParam
      query = query.eq('billing_month', billingMonth)
    }

    const { data: rows, error: recError } = await query
    if (recError) return apiError('INTERNAL_ERROR', '請求一覧の取得に失敗しました')

    const records = rows ?? []

    // company 名を解決（billing_records には企業名が無いため別取得してマップ）
    const companyIds = Array.from(new Set(records.map((r: { company_id: string }) => r.company_id)))
    const nameMap: Record<string, string> = {}
    if (companyIds.length > 0) {
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .in('id', companyIds)
      for (const c of companies ?? []) nameMap[c.id] = c.name ?? ''
    }

    const now = Date.now()
    const items = records
      .map((r: {
        id: string
        company_id: string
        billing_month: string | null
        interview_count: number | null
        amount_jpy: number | null
        tax_jpy: number | null
        total_jpy: number | null
        payment_status: string | null
        created_at: string | null
        paid_at: string | null
      }) => ({
        id: r.id,
        company_id: r.company_id,
        company_name: nameMap[r.company_id] ?? '',
        billing_month: r.billing_month ? String(r.billing_month).slice(0, 7) : '',
        interview_count: r.interview_count ?? 0,
        amount_jpy: r.amount_jpy ?? 0,
        tax_jpy: r.tax_jpy ?? 0,
        total_jpy: r.total_jpy ?? 0,
        payment_status: r.payment_status ?? 'pending',
        effective_status: effectiveStatus(r.created_at, r.payment_status, now),
        created_at: r.created_at,
        paid_at: r.paid_at,
        due_date: jstDueDate(r.created_at),
      }))
      // status フィルタは overdue が導出のため JS 側で適用
      .filter((it) => {
        if (statusParam === 'all') return true
        if (statusParam === 'paid') return it.payment_status === 'paid'
        if (statusParam === 'pending') return it.effective_status === 'pending'
        if (statusParam === 'overdue') return it.effective_status === 'overdue'
        return true
      })

    return successJson({ records: items })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

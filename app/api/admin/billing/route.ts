import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
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

    let query = supabase
      .from('invoices')
      .select('id, company_id, plan, interview_count, amount, status, stripe_invoice_url, period, companies ( name )')

    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    if (period) {
      query = query.eq('period', period)
    }

    query = query.order('period', { ascending: false })

    const { data: invoices, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', '請求データの取得に失敗しました')
    }

    let totalRevenue = 0
    const items = (invoices ?? []).map((inv) => {
      const companyName = (inv.companies as unknown as { name: string } | null)?.name ?? ''
      const amount = typeof inv.amount === 'number' ? inv.amount : 0
      totalRevenue += amount
      return {
        company_id: inv.company_id,
        company_name: companyName,
        plan: inv.plan,
        interview_count: inv.interview_count,
        amount,
        status: inv.status,
        stripe_invoice_url: inv.stripe_invoice_url,
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

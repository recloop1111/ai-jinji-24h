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

    const { data: invoices, count, error } = await supabase
      .from('invoices')
      .select('id, period, plan, interview_count, amount, tax_amount, status, stripe_invoice_url, created_at', { count: 'exact' })
      .eq('company_id', user.companyId)
      .order('period', { ascending: false })
      .range(offset, offset + perPage - 1)

    if (error) {
      return apiError('INTERNAL_ERROR', '請求データの取得に失敗しました')
    }

    return successJson({
      invoices: invoices ?? [],
      total_count: count ?? 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

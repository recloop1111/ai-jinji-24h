import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

const VALID_STATUSES = ['all', 'active', 'suspended'] as const
const MAX_PER_PAGE = 100

export async function GET(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10) || 20))
    const status = searchParams.get('status') ?? 'all'
    const offset = (page - 1) * perPage

    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return apiError('VALIDATION_ERROR', 'statusの値が不正です')
    }

    const supabase = await createClient()

    let query = supabase
      .from('companies')
      .select('id, name, plan, is_suspended, plan_limit, created_at', { count: 'exact' })

    if (status === 'active') {
      query = query.eq('is_suspended', false)
    } else if (status === 'suspended') {
      query = query.eq('is_suspended', true)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + perPage - 1)

    const { data: companies, count, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', '企業一覧の取得に失敗しました')
    }

    // 各企業の当月面接数を取得
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const companyIds = (companies ?? []).map((c: { id: string }) => c.id)

    let monthlyCounts: Record<string, number> = {}
    if (companyIds.length > 0) {
      const { data: interviewData } = await supabase
        .from('interviews')
        .select('company_id')
        .in('company_id', companyIds)
        .eq('billable', true)
        .gte('created_at', monthStart)

      monthlyCounts = (interviewData ?? []).reduce((acc: Record<string, number>, row: { company_id: string }) => {
        acc[row.company_id] = (acc[row.company_id] ?? 0) + 1
        return acc
      }, {})
    }

    const items = (companies ?? []).map((c: { id: string; name: string; plan: string; is_suspended: boolean; plan_limit: number | null; created_at: string }) => ({
      id: c.id,
      name: c.name,
      plan: c.plan,
      status: c.is_suspended ? 'suspended' : 'active',
      monthly_count: monthlyCounts[c.id] ?? 0,
      plan_limit: c.plan_limit,
      created_at: c.created_at,
    }))

    return successJson({
      companies: items,
      total_count: count ?? 0,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

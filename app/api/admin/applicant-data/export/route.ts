import { type NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { isValidUUID, isValidDate } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const companyId = searchParams.get('company_id') ?? ''
    const dateFrom = searchParams.get('date_from') ?? ''
    const dateTo = searchParams.get('date_to') ?? ''

    if (companyId && !isValidUUID(companyId)) {
      return apiError('VALIDATION_ERROR', 'company_id の形式が不正です')
    }
    if (dateFrom && !isValidDate(dateFrom)) {
      return apiError('VALIDATION_ERROR', 'date_from の形式が不正です（YYYY-MM-DD）')
    }
    if (dateTo && !isValidDate(dateTo)) {
      return apiError('VALIDATION_ERROR', 'date_to の形式が不正です（YYYY-MM-DD）')
    }

    const supabase = await createClient()

    let query = supabase
      .from('applicants')
      .select('id, last_name, first_name, email, rank, selection_status, created_at, company_id, companies ( name )')

    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00Z`)
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59Z`)
    }

    query = query.order('created_at', { ascending: false })

    const { data: applicants, error } = await query

    if (error) {
      return apiError('INTERNAL_ERROR', '応募者データの取得に失敗しました')
    }

    const rows = (applicants ?? []).map((a) => {
      const companyName = (a.companies as unknown as { name: string } | null)?.name ?? ''
      return [
        a.id,
        companyName,
        a.last_name,
        a.first_name,
        a.email ?? '',
        a.rank ?? '',
        a.selection_status ?? '',
        a.created_at,
      ]
    })

    const header = ['ID', '企業名', '姓', '名', 'メール', 'ランク', '選考ステータス', '応募日時']
    const csvLines = [header, ...rows].map((row) =>
      row.map((cell: string) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    )
    const csvContent = csvLines.join('\r\n')

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const bom = '\uFEFF'

    return new NextResponse(bom + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="admin_applicants_${today}.csv"`,
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

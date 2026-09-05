import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { jstCurrentMonthStartIso } from '@/lib/companies/applyNextMonthLimit'
import { PRICE_PER_INTERVIEW } from '@/types/database'

// 企業の請求サマリ＋請求履歴（client・billing.read=OWNER/ADMIN のみ）。
//   browser 直読みを廃し server(service-role)で取得。company_id は getClientUser 由来固定（query 不信用）。
//   返すのは表示に必要な非機微値のみ（凍結 snapshot 等の機微は返さない・PDF は別 route）。
export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    if (!can(user.companyRole, 'billing.read')) return apiError('FORBIDDEN')

    const svc = createServiceRoleClient()

    // 企業情報（上限・単価）
    const { data: company, error: compError } = await svc
      .from('companies')
      .select('monthly_interview_limit, price_per_interview')
      .eq('id', user.companyId)
      .maybeSingle()
    if (compError) return apiError('INTERNAL_ERROR', '請求情報の取得に失敗しました')

    // 当月の課金対象面接数（JST 月境界・plan/start/admin と同一基準）
    const monthStart = jstCurrentMonthStartIso()
    const { count, error: countError } = await svc
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.companyId)
      .eq('is_billable', true)
      .gte('created_at', monthStart)
    if (countError) return apiError('INTERNAL_ERROR', '利用状況の取得に失敗しました')

    // 過去請求履歴（最新 20 件・非機微列のみ）
    const { data: recs, error: recError } = await svc
      .from('billing_records')
      .select('id, billing_month, interview_count, amount_jpy, tax_jpy, payment_status, created_at')
      .eq('company_id', user.companyId)
      .order('billing_month', { ascending: false })
      .limit(20)
    if (recError) return apiError('INTERNAL_ERROR', '請求履歴の取得に失敗しました')

    const records = (recs ?? []).map((r) => {
      const rec = r as { id: string; billing_month: string | null; interview_count: number | null; amount_jpy: number | null; tax_jpy: number | null; payment_status: string; created_at: string }
      return {
        id: rec.id,
        period: rec.billing_month ? String(rec.billing_month).slice(0, 7) : '',
        interview_count: rec.interview_count,
        amount: rec.amount_jpy ?? 0,
        tax_amount: rec.tax_jpy,
        status: rec.payment_status,
        created_at: rec.created_at,
      }
    })

    return successJson({
      monthly_count: count ?? 0,
      monthly_interview_limit: (company as { monthly_interview_limit?: number } | null)?.monthly_interview_limit ?? 10,
      price_per_interview: (company as { price_per_interview?: number } | null)?.price_per_interview ?? PRICE_PER_INTERVIEW,
      records,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

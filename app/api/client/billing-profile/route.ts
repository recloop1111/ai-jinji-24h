import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { BILLING_PROFILE_FIELDS, sanitizeBillingProfile } from '@/lib/billing/billing-profile'

// 企業の請求先情報（自社のみ）。getClientUser＋service-role（RLSは多重防御）。companyId は認証由来。
export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = createServiceRoleClient()

    const { data: profile, error: pErr } = await supabase
      .from('company_billing_profiles')
      .select(`${BILLING_PROFILE_FIELDS.join(', ')}, updated_at`)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (pErr) return apiError('INTERNAL_ERROR', '請求先情報の取得に失敗しました')

    // 未登録時の表示フォールバック（請求書は会社名/担当者で代替表示される）
    const { data: company } = await supabase
      .from('companies')
      .select('name, contact_person, contact_email, email')
      .eq('id', user.companyId)
      .maybeSingle()

    return successJson({
      profile: profile ?? null,
      fallback: {
        billing_name: company?.name ?? '',
        contact_name: company?.contact_person ?? '',
        contact_email: company?.contact_email ?? company?.email ?? '',
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }
    const fields = sanitizeBillingProfile(body)

    const supabase = createServiceRoleClient()
    // 本人編集（updated_by=null）。company_id は認証由来で body 不信用。
    const { error: upErr } = await supabase
      .from('company_billing_profiles')
      .upsert(
        { company_id: user.companyId, ...fields, updated_by: null, updated_at: new Date().toISOString() },
        { onConflict: 'company_id' },
      )
    if (upErr) return apiError('INTERNAL_ERROR', '請求先情報の保存に失敗しました')

    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { BILLING_PROFILE_FIELDS, sanitizeBillingProfile } from '@/lib/billing/billing-profile'

// 運営による任意企業の請求先情報 確認/代行編集。getAdminUser＋service-role（全社）。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const supabase = createServiceRoleClient()

    const { data: profile, error: pErr } = await supabase
      .from('company_billing_profiles')
      .select(`${BILLING_PROFILE_FIELDS.join(', ')}, updated_by, updated_at`)
      .eq('company_id', id)
      .maybeSingle()
    if (pErr) return apiError('INTERNAL_ERROR', '請求先情報の取得に失敗しました')

    const { data: company } = await supabase
      .from('companies')
      .select('name, contact_person, contact_email, email')
      .eq('id', id)
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }
    const fields = sanitizeBillingProfile(body)

    const supabase = createServiceRoleClient()
    // 代行編集: updated_by=admin.userId で監査。
    const { error: upErr } = await supabase
      .from('company_billing_profiles')
      .upsert(
        { company_id: id, ...fields, updated_by: admin.userId, updated_at: new Date().toISOString() },
        { onConflict: 'company_id' },
      )
    if (upErr) return apiError('INTERNAL_ERROR', '請求先情報の保存に失敗しました')

    return successJson({ updated: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

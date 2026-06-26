import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'
import { applyNextMonthLimit, jstFirstOfNextMonthDate, jstCurrentMonthStartIso } from '@/lib/companies/applyNextMonthLimit'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params

    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = createServiceRoleClient()

    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業が見つかりません')
    }

    // 当月の面接実績数
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count: monthlyCount } = await supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id)
      .eq('is_billable', true)
      .gte('created_at', monthStart)

    // 職種一覧
    const { data: jobTypes } = await supabase
      .from('job_types')
      .select('id, name')
      .eq('company_id', id)
      .order('name', { ascending: true })

    // 翌月上限予約の月初昇格
    const applied = await applyNextMonthLimit({
      id: company.id,
      monthly_interview_limit: company.monthly_interview_limit ?? null,
      next_month_interview_limit: company.next_month_interview_limit ?? null,
      next_month_limit_effective_month: company.next_month_limit_effective_month ?? null,
    })

    // レスポンスはホワイトリストで構築する。company 全列を spread すると
    // company_setting_password_hash / auth_user_id 等の機微列まで admin ブラウザへ返るため、
    // 管理画面が必要とする列だけを明示的に返す（hash / auth_user_id は絶対に返さない）。
    return successJson({
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        contact_person: company.contact_person,
        contact_email: company.contact_email,
        phone: company.phone,
        industry: company.industry,
        interview_slug: company.interview_slug,
        plan: company.plan,
        price_per_interview: company.price_per_interview,
        monthly_interview_count: company.monthly_interview_count,
        is_suspended: company.is_suspended,
        is_active: company.is_active,
        status: company.status,
        created_at: company.created_at,
        logo_url: company.logo_url,
        avatar_url: company.avatar_url,
        // サーバ算出/上書き値
        monthly_interview_limit: applied.monthly_interview_limit,
        next_month_interview_limit: applied.next_month_interview_limit,
        next_month_limit_effective_month: applied.next_month_limit_effective_month,
        monthly_interview_count_actual: monthlyCount ?? 0,
      },
      job_types: jobTypes ?? [],
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params

    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    const supabase = createServiceRoleClient()

    // 重要設定（今月上限/翌月予約/契約種別plan/単価）の変更時は
    // 「運営管理設定変更用パスワード」(ログインPWとは別) を必須にする。
    // adminSettingPassword を admin_security_settings.setting_password_hash と照合する。
    // 重要操作: 契約/上限/単価に加え、企業停止・再開（status / is_suspended）も設定パスワード必須にする。
    const IMPORTANT_FIELDS = [
      'monthly_interview_limit', 'plan', 'price_per_interview',
      'next_month_interview_limit', 'next_month_limit_effective_month',
      'status', 'is_suspended',
    ]
    const requiresAuth = IMPORTANT_FIELDS.some((f) => f in body)
    if (requiresAuth) {
      const { adminSettingPassword } = body as { adminSettingPassword?: string }
      if (typeof adminSettingPassword !== 'string' || adminSettingPassword.length === 0) {
        return apiError('VALIDATION_ERROR', '運営管理設定変更用パスワードが必要です')
      }

      const { data: secRow, error: secError } = await supabase
        .from('admin_security_settings')
        .select('setting_password_hash')
        .eq('id', 'default')
        .maybeSingle()
      if (secError) {
        return apiError('INTERNAL_ERROR', '設定保存先が未作成です（migration未適用）')
      }
      const settingHash = secRow?.setting_password_hash ?? null
      if (!settingHash) {
        return apiError('FORBIDDEN', '運営管理設定変更用パスワードが未設定です')
      }
      if (!verifySettingPassword(adminSettingPassword, settingHash)) {
        return apiError('FORBIDDEN', '運営管理設定変更用パスワードが正しくありません')
      }
    }

    // plan は pay_per_use / custom のみ（旧 light / standard / pro は拒否）
    if ('plan' in body) {
      if (body.plan !== 'pay_per_use' && body.plan !== 'custom') {
        return apiError('VALIDATION_ERROR', 'plan の値が不正です（pay_per_use / custom）')
      }
    }

    // price_per_interview は0以上の整数
    if ('price_per_interview' in body) {
      const p = body.price_per_interview
      if (typeof p !== 'number' || !Number.isInteger(p) || p < 0) {
        return apiError('VALIDATION_ERROR', 'price_per_interview は0以上の整数で指定してください')
      }
    }

    // 翌月上限予約は最低5人の整数（null=予約解除は許可）
    if ('next_month_interview_limit' in body && body.next_month_interview_limit !== null) {
      const n = body.next_month_interview_limit
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 5) {
        return apiError('VALIDATION_ERROR', '翌月上限は最低5人の整数で指定してください')
      }
    }

    // 今月上限: 5以上 かつ 当月利用数以上
    if ('monthly_interview_limit' in body) {
      const newLimit = body.monthly_interview_limit
      if (typeof newLimit !== 'number' || newLimit < 5) {
        return apiError('VALIDATION_ERROR', '月間上限は5件以上に設定してください')
      }
      // 月初は JST 基準（start / client plan と同一基準）。サーバTZ(UTC)依存にしない。
      const monthStart = jstCurrentMonthStartIso()
      const { count: monthlyCount } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', id)
        .eq('is_billable', true)
        .gte('created_at', monthStart)

      if (newLimit < (monthlyCount ?? 0)) {
        return apiError('VALIDATION_ERROR', `当月利用人数（${monthlyCount}件）未満には設定できません`)
      }
    }

    const allowedFields = [
      'name', 'contact_person', 'contact_email', 'phone', 'email',
      'industry', 'monthly_interview_limit', 'plan', 'price_per_interview',
      'next_month_interview_limit', 'next_month_limit_effective_month',
      'is_suspended', 'status',
      'logo_url', 'avatar_url',
    ]

    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key]
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiError('VALIDATION_ERROR', '更新するフィールドがありません')
    }

    updates.updated_at = new Date().toISOString()

    // next_month_limit_effective_month はクライアント値を信用しない（admin ブラウザTZ依存だと
    // 月境界で当月日付を送ってしまい即時適用される）。サーバ側で JST 基準に確定する。
    if ('next_month_interview_limit' in updates) {
      updates.next_month_limit_effective_month =
        updates.next_month_interview_limit === null ? null : jstFirstOfNextMonthDate()
    } else {
      // 予約上限を伴わない effective_month 単独指定は採用しない（client 値を破棄）
      delete updates.next_month_limit_effective_month
    }

    // 翌月予約（next_month_*）を上書きする場合は、書き込み前に満了済み予約を昇格しておく。
    // （client/plan PATCH と同じ事故＝JST月替わり後の最初のリクエストで、当月に効くはずだった
    //  既存予約を上書きで黙って飛ばすのを防ぐ。二重反映/CAS ガードは applyNextMonthLimit 側にある）
    if ('next_month_interview_limit' in body || 'next_month_limit_effective_month' in body) {
      const { data: existing } = await supabase
        .from('companies')
        .select('id, monthly_interview_limit, next_month_interview_limit, next_month_limit_effective_month')
        .eq('id', id)
        .single()
      if (existing) {
        await applyNextMonthLimit({
          id: existing.id,
          monthly_interview_limit: existing.monthly_interview_limit ?? null,
          next_month_interview_limit: existing.next_month_interview_limit ?? null,
          next_month_limit_effective_month: existing.next_month_limit_effective_month ?? null,
        })
      }
    }

    const { data: company, error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error || !company) {
      return apiError('INTERNAL_ERROR', '企業情報の更新に失敗しました')
    }

    return successJson({ company })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'
import { verifySettingPassword } from '@/lib/security/setting-password'
import { applyNextMonthLimit } from '@/lib/companies/applyNextMonthLimit'
import { PRICE_PER_INTERVIEW, MIN_INTERVIEW_LIMIT } from '@/types/database'

// 翌月1日（YYYY-MM-01）を返す
function firstOfNextMonth(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = await createClient()

    // 企業情報（migration 適用前後どちらでも壊れないよう select('*')）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', user.companyId)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    // 翌月上限予約の月初昇格（適用月到来時に monthly_interview_limit へ反映）
    const applied = await applyNextMonthLimit({
      id: company.id,
      monthly_interview_limit: company.monthly_interview_limit ?? null,
      next_month_interview_limit: company.next_month_interview_limit ?? null,
      next_month_limit_effective_month: company.next_month_limit_effective_month ?? null,
    })

    // 会社ごとの単価（未設定/未適用なら通常単価）
    const pricePerInterview = company.price_per_interview ?? PRICE_PER_INTERVIEW
    const limit = applied.monthly_interview_limit ?? 10
    const nextMonthLimit = applied.next_month_interview_limit
    const nextMonthEffectiveMonth = applied.next_month_limit_effective_month

    // 当月の面接件数（billable のみ）
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const { count: monthlyCount } = await supabase
      .from('interviews')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.companyId)
      .eq('is_billable', true)
      .gte('created_at', monthStart)

    const used = monthlyCount ?? 0
    const remaining = Math.max(0, limit - used)

    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextResetDate = `${nextReset.getFullYear()}-${String(nextReset.getMonth() + 1).padStart(2, '0')}-${String(nextReset.getDate()).padStart(2, '0')}`

    return successJson({
      // 企業側には plan(custom等)を出さず、契約形態は常に「従量課金」表記
      contract_type_label: '従量課金',
      price_per_interview: pricePerInterview,
      monthly_interview_limit: limit,
      monthly_count: used,
      remaining,
      current_charge: used * pricePerInterview,
      max_charge: limit * pricePerInterview,
      next_month_interview_limit: nextMonthLimit,
      next_month_limit_effective_month: nextMonthEffectiveMonth,
      next_month_max_charge: (nextMonthLimit ?? limit) * pricePerInterview,
      next_reset_date: nextResetDate,
      min_interview_limit: MIN_INTERVIEW_LIMIT,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

// 企業側: 翌月上限予約のみ変更可（即時反映しない / 自社のみ / 設定変更用パスワード必須）
export async function PATCH(request: NextRequest) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    const { next_month_interview_limit, settingPassword, demo } = body as {
      next_month_interview_limit?: unknown
      settingPassword?: unknown
      demo?: unknown
    }

    // バリデーション: 整数・最低5人（使用済み人数より低くても許可）
    if (typeof next_month_interview_limit !== 'number' || !Number.isInteger(next_month_interview_limit)) {
      return apiError('VALIDATION_ERROR', '翌月の上限人数は整数で指定してください')
    }
    if (next_month_interview_limit < MIN_INTERVIEW_LIMIT) {
      return apiError('VALIDATION_ERROR', `翌月の上限人数は最低${MIN_INTERVIEW_LIMIT}人です`)
    }

    // demo の場合は DB 更新せず、画面確認用に成功扱い
    if (demo === true) {
      return successJson({
        updated: true,
        demo: true,
        next_month_interview_limit,
        next_month_limit_effective_month: firstOfNextMonth(),
      })
    }

    const supabase = await createClient()

    // 自社のみ（companyId は認証から取得。body の company_id は信用しない）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', user.companyId)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '企業情報が見つかりません')
    }

    // 企業設定変更用パスワード（未設定ならエラー）
    if (!company.company_setting_password_hash) {
      return apiError('FORBIDDEN', '企業設定変更用パスワードが未設定です。運営担当者へお問い合わせください')
    }
    if (typeof settingPassword !== 'string' || !verifySettingPassword(settingPassword, company.company_setting_password_hash)) {
      return apiError('FORBIDDEN', '企業設定変更用パスワードが正しくありません')
    }

    // 翌月上限予約のみ更新（今月の monthly_interview_limit は変更しない）
    const { error: updateError } = await supabase
      .from('companies')
      .update({
        next_month_interview_limit,
        next_month_limit_effective_month: firstOfNextMonth(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.companyId)

    if (updateError) {
      return apiError('INTERNAL_ERROR', '翌月上限予約の更新に失敗しました')
    }

    return successJson({
      updated: true,
      next_month_interview_limit,
      next_month_limit_effective_month: firstOfNextMonth(),
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

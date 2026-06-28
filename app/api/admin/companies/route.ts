import { type NextRequest } from 'next/server'
import crypto from 'crypto'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { jstCurrentMonthStartIso } from '@/lib/companies/applyNextMonthLimit'

const VALID_STATUSES = ['all', 'active', 'suspended'] as const
const MAX_PER_PAGE = 100

// GET 企業一覧の select 列に対応する行型（map コールバックの any 解消用）
type CompanyListRow = {
  id: string
  name: string | null
  email: string | null
  plan: string | null
  industry: string | null
  is_suspended: boolean | null
  is_active: boolean | null
  status: string | null
  monthly_interview_limit: number | null
  monthly_interview_count: number | null
  contact_person: string | null
  contact_email: string | null
  contract_start_date: string | null
  created_at: string | null
}

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10) || 20))
    const status = searchParams.get('status') ?? 'all'
    const offset = (page - 1) * perPage

    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return apiError('VALIDATION_ERROR', 'statusの値が不正です')
    }

    const supabase = createServiceRoleClient()

    let query = supabase
      .from('companies')
      .select('id, name, email, plan, industry, is_suspended, is_active, status, monthly_interview_limit, monthly_interview_count, contact_person, contact_email, contract_start_date, created_at', { count: 'exact' })

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

    // 各企業の当月面接数を取得。当月境界は billing/上限判定と同じ JST 基準に統一
    // （サーバローカルTZ=Vercel UTC だと月初 0:00〜8:59 JST で課金/上限とズレるため）。
    const monthStart = jstCurrentMonthStartIso()
    const companyIds = (companies ?? []).map((c: { id: string }) => c.id)

    const monthlyCounts: Record<string, number> = {}
    if (companyIds.length > 0) {
      // PostgREST の1ページ上限（通常1000行）で当月利用数が過少表示されないよう
      // range() で全件ページングして件数を積み上げる。
      const PAGE_SIZE = 1000
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data: interviewData, error: countError } = await supabase
          .from('interviews')
          .select('company_id')
          .in('company_id', companyIds)
          .eq('is_billable', true)
          .gte('created_at', monthStart)
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        // 集計失敗を 0 件として隠蔽せず、companies クエリ失敗時と同じくエラーを返す
        // （?? 0 だと全企業が当月0件として 200 で返り利用数が過少報告になるため）。
        if (countError) {
          return apiError('INTERNAL_ERROR', '当月面接数の取得に失敗しました')
        }
        if (!interviewData || interviewData.length === 0) break
        for (const row of interviewData as { company_id: string }[]) {
          monthlyCounts[row.company_id] = (monthlyCounts[row.company_id] ?? 0) + 1
        }
        if (interviewData.length < PAGE_SIZE) break
      }
    }

    const items = (companies ?? []).map((c: CompanyListRow) => ({
      id: c.id,
      name: c.name,
      industry: c.industry || '未設定',
      plan: c.plan || 'pay_per_use',
      status: c.is_suspended ? 'suspended' : c.is_active === false ? 'cancelled' : (c.status || 'active'),
      // 当月の is_billable 実数を正とする。0件企業で legacy monthly_interview_count
      // （古い非0値）にフォールバックすると課金/上限と食い違うため 0 デフォルト。
      interviewsThisMonth: monthlyCounts[c.id] ?? 0,
      interviewLimit: c.monthly_interview_limit || 0,
      contractStart: c.contract_start_date || '',
      contactName: c.contact_person || '',
      contactEmail: c.contact_email || c.email || '',
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

export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)

    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    const { name, email, password, contact_person, phone, industry, monthly_interview_limit } = body as {
      name?: string
      email?: string
      password?: string
      contact_person?: string
      phone?: string
      industry?: string
      monthly_interview_limit?: number
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiError('VALIDATION_ERROR', '企業名は必須です')
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return apiError('VALIDATION_ERROR', '有効なメールアドレスを入力してください')
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return apiError('VALIDATION_ERROR', 'パスワードは8文字以上で入力してください')
    }

    const supabase = createServiceRoleClient()

    // Step 1: Supabase Auth ユーザー作成
    const { data: authData, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (signUpError || !authData.user) {
      if (signUpError?.message?.includes('already')) {
        return apiError('CONFLICT', 'このメールアドレスは既に登録されています')
      }
      return apiError('INTERNAL_ERROR', 'ユーザーの作成に失敗しました: ' + (signUpError?.message ?? ''))
    }

    const authUserId = authData.user.id

    // Step 2: 企業レコード作成
    const slug = crypto.randomBytes(6).toString('hex')
    const { data: company, error: compError } = await supabase
      .from('companies')
      .insert({
        auth_user_id: authUserId,
        name: name.trim(),
        email,
        plan: 'pay_per_use',
        interview_slug: slug,
        monthly_interview_limit: monthly_interview_limit ?? 20,
        contact_person: contact_person?.trim() || null,
        phone: phone?.trim() || null,
        industry: industry?.trim() || null,
        status: 'active',
        is_active: true,
        is_suspended: false,
        interview_url_active: true,
        onboarding_completed: false,
      })
      .select('id')
      .single()

    if (compError || !company) {
      // ロールバック: Auth ユーザー削除
      await supabase.auth.admin.deleteUser(authUserId)
      return apiError('INTERNAL_ERROR', '企業の作成に失敗しました: ' + (compError?.message ?? ''))
    }

    // Step 3: profiles レコード作成（trigger で自動作成済みの場合は更新）
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authUserId,
        email,
        role: 'company',
        company_id: company.id,
        display_name: contact_person?.trim() || name.trim(),
      }, { onConflict: 'id' })

    if (profileError) {
      // ロールバック: companies + Auth ユーザー削除
      await supabase.from('companies').delete().eq('id', company.id)
      await supabase.auth.admin.deleteUser(authUserId)
      return apiError('INTERNAL_ERROR', 'プロフィールの作成に失敗しました: ' + profileError.message)
    }

    return successJson({
      company_id: company.id,
      auth_user_id: authUserId,
      email,
      interview_slug: slug,
    }, 201)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

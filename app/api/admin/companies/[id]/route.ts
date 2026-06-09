import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
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
      .eq('billable', true)
      .gte('created_at', monthStart)

    // 職種一覧
    const { data: jobTypes } = await supabase
      .from('job_types')
      .select('id, name')
      .eq('company_id', id)
      .order('name', { ascending: true })

    // 質問バンク一覧（質問数付き）
    const { data: questionBanks } = await supabase
      .from('question_banks')
      .select('id, name, questions ( id )')
      .eq('company_id', id)

    const banks = (questionBanks ?? []).map((qb: { id: string; name: string; questions: { id: string }[] | null }) => ({
      id: qb.id,
      name: qb.name,
      question_count: qb.questions?.length ?? 0,
    }))

    return successJson({
      company: {
        ...company,
        monthly_interview_count_actual: monthlyCount ?? 0,
      },
      job_types: jobTypes ?? [],
      question_banks: banks,
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
    const { data: admin, error: authError } = await getAdminUser()
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

    // monthly_interview_limit 変更時は管理者パスワード再確認が必要
    if ('monthly_interview_limit' in body) {
      const { adminPassword } = body as { adminPassword?: string }
      if (!adminPassword || typeof adminPassword !== 'string') {
        return apiError('VALIDATION_ERROR', '管理者パスワードが必要です')
      }

      // 管理者のメールアドレスを取得
      const { data: adminAuth } = await supabase.auth.admin.getUserById(admin.userId)
      if (!adminAuth?.user?.email) {
        return apiError('INTERNAL_ERROR', '管理者情報の取得に失敗しました')
      }

      // パスワード再認証（セッションに影響しない別クライアントで実行）
      const verifyClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { error: signInError } = await verifyClient.auth.signInWithPassword({
        email: adminAuth.user.email,
        password: adminPassword,
      })
      if (signInError) {
        return apiError('FORBIDDEN', '管理者パスワードが正しくありません')
      }

      // バリデーション
      const newLimit = body.monthly_interview_limit
      if (typeof newLimit !== 'number' || newLimit < 5) {
        return apiError('VALIDATION_ERROR', '月間上限は5件以上に設定してください')
      }

      // 当月利用数チェック
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { count: monthlyCount } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', id)
        .eq('billable', true)
        .gte('created_at', monthStart)

      if (newLimit < (monthlyCount ?? 0)) {
        return apiError('VALIDATION_ERROR', `当月利用人数（${monthlyCount}件）未満には設定できません`)
      }
    }

    const allowedFields = [
      'name', 'contact_person', 'contact_email', 'phone', 'email',
      'industry', 'monthly_interview_limit',
      'is_suspended', 'status', 'is_locked', 'locked_at', 'login_fail_count',
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

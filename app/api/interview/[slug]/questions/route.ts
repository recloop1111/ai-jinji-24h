import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'

// node:crypto（POST の token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 旧API（anon・廃止スキーマ question_banks/questions 参照）。未使用だが将来整理まで温存。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const supabase = await createClient()

    // slug → 企業特定
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended')
      .eq('interview_slug', slug)
      .single()

    if (compError || !company) {
      return apiError('NOT_FOUND', '無効な面接URLです')
    }

    if (company.is_suspended) {
      return apiError('FORBIDDEN', 'この企業は現在利用停止中です')
    }

    // question_banks → questions
    const { data: bankIds } = await supabase
      .from('question_banks')
      .select('id')
      .eq('company_id', company.id)

    const bankIdList = (bankIds ?? []).map((qb: { id: string }) => qb.id)

    if (bankIdList.length === 0) {
      return successJson({ questions: [] })
    }

    const { data: questions, error } = await supabase
      .from('questions')
      .select('id, text, primary_axis, allow_followup, sort_order, job_type_id')
      .in('question_bank_id', bankIdList)
      .order('sort_order', { ascending: true })

    if (error) {
      return apiError('INTERNAL_ERROR', '質問の取得に失敗しました')
    }

    return successJson({ questions: questions ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

// 公開面接フロー: 面接質問取得（service-role）。token で本人のフローだけ許可する。
// applicant.job_id を元に job_questions を返す（question_text / sort_order のみ・昇順）。
// job_id 無し or 質問無しは空配列を返し、呼び出し側の既定質問フォールバックを壊さない。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // token 検証（署名・exp）＋ slug / applicant_id の一致
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return apiError('UNAUTHORIZED', 'トークンが無効です')
    if (payload.slug !== slug) return apiError('UNAUTHORIZED', 'トークンが一致しません')
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return apiError('UNAUTHORIZED', 'applicant_id が一致しません')
    }

    const interviewId = typeof body.interview_id === 'string' ? body.interview_id : ''
    if (!interviewId) return apiError('VALIDATION_ERROR', 'interview_id は必須です')

    const supabase = createServiceRoleClient()

    // slug → 企業特定（停止中は受付不可）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')
    if (company.is_suspended) return apiError('FORBIDDEN', '現在、面接の受付を停止しています')

    // applicant 実在＆当該企業所属
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id, job_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // interview 実在＆applicant 一致
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')

    // job_id 無しは質問無し扱い（呼び出し側の既定質問フォールバックを維持）
    if (!applicant.job_id) {
      return successJson({ questions: [] })
    }

    // job が当該企業のものであることを検証
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, company_id')
      .eq('id', applicant.job_id)
      .single()
    if (jobError || !job) return apiError('NOT_FOUND', '求人が見つかりません')
    if (job.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // job_questions を取得（question_text / sort_order のみ・昇順）
    const { data: questions } = await supabase
      .from('job_questions')
      .select('question_text, sort_order')
      .eq('job_id', applicant.job_id)
      .order('sort_order', { ascending: true })

    return successJson({ questions: questions ?? [] })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

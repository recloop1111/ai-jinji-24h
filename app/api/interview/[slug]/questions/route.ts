import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { derivePatternKey } from '@/lib/interview/patternKey'

// node:crypto（POST の token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー: 面接質問取得（service-role）。token で本人のフローだけ許可する。
// applicant.job_id ＋ 応募者区分から導出した pattern_key で job_questions を返す
//（question_text / sort_order のみ・昇順）。他区分の質問は混ぜない。
// job_id 無し or 該当 pattern_key の質問無しは空配列を返し、呼び出し側の既定質問フォールバックを壊さない。
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

    // applicant 実在＆当該企業所属（区分導出に employment_type / industry_experience も取得）
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id, job_id, employment_type, industry_experience')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // interview 実在＆applicant 一致（snapshot も取得）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, questions_snapshot')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')

    // 開始時点の質問を固定：snapshot があればそれを優先（再開時に企業の質問変更の影響を受けない）。
    if (Array.isArray(interview.questions_snapshot) && interview.questions_snapshot.length > 0) {
      return successJson({ questions: interview.questions_snapshot })
    }

    // job_id 無しは質問無し扱い（呼び出し側の既定質問フォールバックを維持）
    if (!applicant.job_id) {
      return successJson({ questions: [] })
    }

    // job が当該企業のものであることを検証（求人の雇用形態も取得）
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, company_id, employment_type')
      .eq('id', applicant.job_id)
      .single()
    if (jobError || !job) return apiError('NOT_FOUND', '求人が見つかりません')
    if (job.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // 応募者区分から pattern_key を導出（jobの雇用形態 × 応募者の新卒/中途 × 経験有無）
    const patternKey = derivePatternKey({
      jobEmploymentType: job.employment_type,
      applicantEmploymentType: applicant.employment_type,
      industryExperience: applicant.industry_experience,
    })

    // job_questions を取得（当該 pattern_key のみ・question_text / sort_order のみ・昇順）。
    // 他区分の質問は混ぜない。該当0件は空配列（既定質問フォールバックへ・job_id 全体へは fallback しない）。
    const { data: jobQuestions } = await supabase
      .from('job_questions')
      .select('question_text, sort_order')
      .eq('job_id', applicant.job_id)
      .eq('pattern_key', patternKey)
      .order('sort_order', { ascending: true })

    // 該当 pattern_key の job_questions が0件なら、common だけ返さず空配列（既定質問フォールバックへ）。
    if (!jobQuestions || jobQuestions.length === 0) {
      return successJson({ questions: [] })
    }

    // common_questions（企業共通）を合流。結合順 = icebreakers → job_questions → closing。
    // 各カテゴリ内は sort_order 昇順。common が0件なら job_questions のみ。
    const { data: commonRows } = await supabase
      .from('common_questions')
      .select('category, question_text, sort_order')
      .eq('company_id', company.id)
      .order('sort_order', { ascending: true })

    const pick = (cat: string) =>
      (commonRows ?? [])
        .filter((r) => r.category === cat)
        .map((r) => ({ question_text: r.question_text, sort_order: r.sort_order }))

    const questions = [...pick('icebreakers'), ...jobQuestions, ...pick('closing')]

    return successJson({ questions })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

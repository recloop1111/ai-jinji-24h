import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

// service-role 利用のため Node runtime を明示
export const runtime = 'nodejs'

// 社風アンケートは完全匿名（回答者識別なし）。slug の知識を公開回答権限とみなす（capability token 不要）。
// 質問→因子の対応はサーバ側で保持し、スコアはサーバで計算する（クライアントによるスコア偽装を防止）。
const FACTOR_QUESTIONS: Record<string, number[]> = {
  openness: [1, 2, 3, 4],
  conscientiousness: [5, 6, 7, 8],
  extraversion: [9, 10, 11, 12],
  agreeableness: [13, 14, 15, 16],
  neuroticism: [17, 18, 19, 20],
}
const ALL_QUESTION_IDS = Object.values(FACTOR_QUESTIONS).flat() // 1..20
const PROFILE_MIN_RESPONSES = 3

// 因子スコア = その因子の回答平均(1-7) を 0-10 換算し小数1桁丸め（survey/page.tsx の計算と一致）
function factorScore(answers: Record<number, number>, factor: string): number {
  const ids = FACTOR_QUESTIONS[factor]
  const vals = ids.map((id) => answers[id]).filter((v) => typeof v === 'number')
  if (vals.length === 0) return 0
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length
  return Math.round((avg / 7) * 10 * 10) / 10
}

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

    // answers の検証（1..20 すべて 1-7 の整数）
    const rawAnswers = body.answers
    if (!rawAnswers || typeof rawAnswers !== 'object') {
      return apiError('VALIDATION_ERROR', '回答が不正です')
    }
    const answers: Record<number, number> = {}
    for (const id of ALL_QUESTION_IDS) {
      const v = Number((rawAnswers as Record<string, unknown>)[String(id)])
      if (!Number.isInteger(v) || v < 1 || v > 7) {
        return apiError('VALIDATION_ERROR', 'すべての質問に回答してください')
      }
      answers[id] = v
    }

    const freeTextRaw = typeof body.free_text === 'string' ? body.free_text.trim() : ''
    const freeText = freeTextRaw.length > 0 ? freeTextRaw : null

    const supabase = createServiceRoleClient()

    // slug → アクティブな survey を取得（company_id / department / employment_type はサーバ由来で確定）
    const { data: survey, error: surveyError } = await supabase
      .from('culture_surveys')
      .select('id, company_id, department, employment_type, is_active')
      .eq('survey_url_slug', slug)
      .single()
    if (surveyError || !survey) return apiError('NOT_FOUND', 'アンケートが見つかりません')
    if (!survey.is_active) return apiError('FORBIDDEN', 'このアンケートは現在受付を停止しています')

    // 因子スコアをサーバ計算
    const opennessScore = factorScore(answers, 'openness')
    const conscientiousnessScore = factorScore(answers, 'conscientiousness')
    const extraversionScore = factorScore(answers, 'extraversion')
    const agreeablenessScore = factorScore(answers, 'agreeableness')
    const neuroticismScore = factorScore(answers, 'neuroticism')

    // 回答を保存
    const { error: insertError } = await supabase.from('culture_survey_responses').insert({
      survey_id: survey.id,
      openness_score: opennessScore,
      conscientiousness_score: conscientiousnessScore,
      extraversion_score: extraversionScore,
      agreeableness_score: agreeablenessScore,
      neuroticism_score: neuroticismScore,
      free_text: freeText,
    })
    if (insertError) return apiError('INTERNAL_ERROR', '送信に失敗しました')

    // 同 survey の全回答を集計（service-role）
    const { data: responses } = await supabase
      .from('culture_survey_responses')
      .select('openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score')
      .eq('survey_id', survey.id)

    const count = responses?.length ?? 0
    const profileEnabled = count >= PROFILE_MIN_RESPONSES

    // 既存プロファイル（company_id + department + employment_type）
    const { data: existingProfile } = await supabase
      .from('culture_profiles')
      .select('id')
      .eq('company_id', survey.company_id)
      .eq('department', survey.department)
      .eq('employment_type', survey.employment_type)
      .maybeSingle()

    if (!profileEnabled) {
      // count < 3: response_count のみ更新（平均は出さない）。既存が無ければ作成しない（既存仕様に合わせる）
      if (existingProfile) {
        await supabase
          .from('culture_profiles')
          .update({ response_count: count, updated_at: new Date().toISOString() })
          .eq('id', existingProfile.id)
      }
    } else {
      const rows = responses ?? []
      const avg = (key: keyof (typeof rows)[number]) =>
        Math.round((rows.reduce((s, r) => s + Number(r[key]), 0) / count) * 10) / 10
      const profileValues = {
        avg_openness: avg('openness_score'),
        avg_conscientiousness: avg('conscientiousness_score'),
        avg_extraversion: avg('extraversion_score'),
        avg_agreeableness: avg('agreeableness_score'),
        avg_neuroticism: avg('neuroticism_score'),
        response_count: count,
      }

      if (existingProfile) {
        await supabase
          .from('culture_profiles')
          .update({ ...profileValues, updated_at: new Date().toISOString() })
          .eq('id', existingProfile.id)
      } else {
        await supabase.from('culture_profiles').insert({
          company_id: survey.company_id,
          department: survey.department,
          employment_type: survey.employment_type,
          ...profileValues,
        })
      }
    }

    return successJson({ success: true, response_count: count, profile_enabled: profileEnabled })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

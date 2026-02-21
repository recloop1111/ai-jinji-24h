'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'

type SurveyData = {
  id: string
  department: string
  employment_type: string
  is_active: boolean
  company: {
    id: string
    name: string
  }
}

type Question = {
  id: number
  text: string
  factor: 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism'
}

const QUESTIONS: Question[] = [
  { id: 1, text: '新しいアイデアに興味を持つ方だ', factor: 'openness' },
  { id: 2, text: '芸術や創造的な活動に関心がある', factor: 'openness' },
  { id: 3, text: '慣れた方法より新しい方法を試したい', factor: 'openness' },
  { id: 4, text: '様々な価値観を受け入れることが得意だ', factor: 'openness' },
  { id: 5, text: '計画を立てて物事を進めるのが好きだ', factor: 'conscientiousness' },
  { id: 6, text: '細かい作業でもきちんとやり遂げる', factor: 'conscientiousness' },
  { id: 7, text: '締め切りや約束は必ず守る', factor: 'conscientiousness' },
  { id: 8, text: '仕事では正確さを重視する', factor: 'conscientiousness' },
  { id: 9, text: '初対面の人とでもすぐに打ち解けられる', factor: 'extraversion' },
  { id: 10, text: 'チームで作業する方が一人より好きだ', factor: 'extraversion' },
  { id: 11, text: '社交的な場でエネルギーをもらえる', factor: 'extraversion' },
  { id: 12, text: '自分から積極的に発言する方だ', factor: 'extraversion' },
  { id: 13, text: '他人の意見を尊重して行動できる', factor: 'agreeableness' },
  { id: 14, text: 'チーム内の調和を大切にする', factor: 'agreeableness' },
  { id: 15, text: '困っている人を見るとすぐに手助けしたくなる', factor: 'agreeableness' },
  { id: 16, text: '対立よりも協力を選ぶ方だ', factor: 'agreeableness' },
  { id: 17, text: 'プレッシャーがかかっても冷静に対処できる', factor: 'neuroticism' },
  { id: 18, text: '気分の浮き沈みが少ない方だ', factor: 'neuroticism' },
  { id: 19, text: '困難な状況でも前向きでいられる', factor: 'neuroticism' },
  { id: 20, text: 'ストレスを感じても引きずらない方だ', factor: 'neuroticism' },
]

const SCALE_LABELS = [
  '全く当てはまらない',
  'ほとんど当てはまらない',
  'あまり当てはまらない',
  'どちらでもない',
  'やや当てはまる',
  'かなり当てはまる',
  '非常に当てはまる',
]

export default function SurveyPage() {
  const params = useParams()
  const slug = params.slug as string
  const supabase = createClient()

  const [survey, setSurvey] = useState<SurveyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inactive, setInactive] = useState(false)

  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [freeText, setFreeText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSurvey() {
      setLoading(true)
      setError(null)
      setInactive(false)

      const { data, error: fetchError } = await supabase
        .from('culture_surveys')
        .select(`
          id,
          department,
          employment_type,
          is_active,
          company:companies!culture_surveys_company_id_fkey (
            id,
            name
          )
        `)
        .eq('survey_url_slug', slug)
        .single()

      if (fetchError || !data) {
        setError('アンケートが見つかりません')
        setLoading(false)
        return
      }

      if (!data.is_active) {
        setInactive(true)
        setLoading(false)
        return
      }

      const companyData = Array.isArray(data.company) ? data.company[0] : data.company
      setSurvey({
        id: data.id,
        department: data.department,
        employment_type: data.employment_type,
        is_active: data.is_active,
        company: {
          id: companyData?.id || '',
          name: companyData?.name || '',
        },
      })
      setLoading(false)
    }

    if (slug) fetchSurvey()
  }, [slug])

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers])
  const progress = useMemo(() => (answeredCount / QUESTIONS.length) * 100, [answeredCount])

  const handleAnswer = (questionId: number, value: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    setValidationError(null)
  }

  const calculateFactorScore = (factor: Question['factor']): number => {
    const factorQuestions = QUESTIONS.filter((q) => q.factor === factor)
    const factorAnswers = factorQuestions.map((q) => answers[q.id]).filter((a) => a !== undefined)
    if (factorAnswers.length === 0) return 0
    const avg = factorAnswers.reduce((sum, a) => sum + a, 0) / factorAnswers.length
    return Math.round((avg / 7) * 10 * 10) / 10
  }

  const handleSubmit = async () => {
    if (answeredCount < QUESTIONS.length) {
      setValidationError('すべての質問にお答えください')
      return
    }

    setSubmitting(true)
    setValidationError(null)

    const opennessScore = calculateFactorScore('openness')
    const conscientiousnessScore = calculateFactorScore('conscientiousness')
    const extraversionScore = calculateFactorScore('extraversion')
    const agreeablenessScore = calculateFactorScore('agreeableness')
    const neuroticismScore = calculateFactorScore('neuroticism')

    const { error: insertError } = await supabase.from('culture_survey_responses').insert({
      survey_id: survey!.id,
      openness_score: opennessScore,
      conscientiousness_score: conscientiousnessScore,
      extraversion_score: extraversionScore,
      agreeableness_score: agreeablenessScore,
      neuroticism_score: neuroticismScore,
      free_text: freeText.trim() || null,
    })

    if (insertError) {
      setValidationError('送信に失敗しました。もう一度お試しください。')
      setSubmitting(false)
      return
    }

    await updateCultureProfile()
    setSubmitting(false)
    setSubmitted(true)
  }

  const updateCultureProfile = async () => {
    if (!survey) return

    const { data: responses } = await supabase
      .from('culture_survey_responses')
      .select('openness_score, conscientiousness_score, extraversion_score, agreeableness_score, neuroticism_score')
      .eq('survey_id', survey.id)

    if (!responses || responses.length === 0) return

    const count = responses.length

    const { data: existingProfile } = await supabase
      .from('culture_profiles')
      .select('id')
      .eq('company_id', survey.company.id)
      .eq('department', survey.department)
      .eq('employment_type', survey.employment_type)
      .single()

    if (count < 3) {
      if (existingProfile) {
        await supabase
          .from('culture_profiles')
          .update({
            response_count: count,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingProfile.id)
      }
      return
    }

    const avgOpenness = Math.round((responses.reduce((s, r) => s + Number(r.openness_score), 0) / count) * 10) / 10
    const avgConscientiousness = Math.round((responses.reduce((s, r) => s + Number(r.conscientiousness_score), 0) / count) * 10) / 10
    const avgExtraversion = Math.round((responses.reduce((s, r) => s + Number(r.extraversion_score), 0) / count) * 10) / 10
    const avgAgreeableness = Math.round((responses.reduce((s, r) => s + Number(r.agreeableness_score), 0) / count) * 10) / 10
    const avgNeuroticism = Math.round((responses.reduce((s, r) => s + Number(r.neuroticism_score), 0) / count) * 10) / 10

    if (existingProfile) {
      await supabase
        .from('culture_profiles')
        .update({
          avg_openness: avgOpenness,
          avg_conscientiousness: avgConscientiousness,
          avg_extraversion: avgExtraversion,
          avg_agreeableness: avgAgreeableness,
          avg_neuroticism: avgNeuroticism,
          response_count: count,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingProfile.id)
    } else {
      await supabase.from('culture_profiles').insert({
        company_id: survey.company.id,
        department: survey.department,
        employment_type: survey.employment_type,
        avg_openness: avgOpenness,
        avg_conscientiousness: avgConscientiousness,
        avg_extraversion: avgExtraversion,
        avg_agreeableness: avgAgreeableness,
        avg_neuroticism: avgNeuroticism,
        response_count: count,
      })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">エラー</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    )
  }

  if (inactive) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 mb-4">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">受付停止中</h1>
          <p className="text-slate-600">このアンケートは現在受付を停止しています</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">ご回答ありがとうございました</h1>
          <p className="text-slate-600 leading-relaxed">
            あなたの回答は匿名で社風分析に活用されます。
            <br />
            このページを閉じてください。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* プログレスバー */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
            <span>回答済み: {answeredCount} / {QUESTIONS.length}問</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* ① ヘッダー */}
        <div className="text-center mb-8">
          <p className="text-blue-600 font-semibold text-sm mb-1">{survey?.company.name}</p>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">社風アンケート</h1>
          <p className="text-slate-500">
            {survey?.department} / {survey?.employment_type}
          </p>
        </div>

        {/* ② 説明文 */}
        <div className="bg-slate-50 rounded-xl p-4 mb-8 text-sm text-slate-600 leading-relaxed">
          このアンケートは、採用活動における社風マッチング分析に活用されます。
          回答は匿名で処理され、個人が特定されることはありません。
          <span className="block mt-2 font-medium text-slate-700">所要時間：約5〜10分</span>
        </div>

        {/* ③ 質問20問 */}
        <div className="space-y-6 mb-10">
          {QUESTIONS.map((q, idx) => (
            <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                  {idx + 1}
                </span>
                <p className="text-slate-900 font-medium leading-relaxed pt-1">{q.text}</p>
              </div>

              <div className="flex flex-nowrap justify-between gap-1 sm:gap-2 sm:justify-center">
                {[1, 2, 3, 4, 5, 6, 7].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleAnswer(q.id, val)}
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg text-sm font-medium transition-all ${
                      answers[q.id] === val
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title={SCALE_LABELS[val - 1]}
                  >
                    {val}
                  </button>
                ))}
              </div>

              <div className="flex justify-between text-xs text-slate-400 mt-3 px-1">
                <span>全く当てはまらない</span>
                <span>非常に当てはまる</span>
              </div>
            </div>
          ))}
        </div>

        {/* ④ 自由記述 */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8">
          <label className="block mb-3">
            <span className="flex items-center gap-3">
              <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                21
              </span>
              <span className="text-slate-900 font-medium">
                あなたの職場の雰囲気を一言で表すと？（任意）
              </span>
            </span>
          </label>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            rows={3}
            placeholder="例: 活気があって風通しが良い"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          />
        </div>

        {/* バリデーションエラー */}
        {validationError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {validationError}
          </div>
        )}

        {/* ⑤ 送信ボタン */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full px-6 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
          {submitting ? '送信中...' : '回答を送信する'}
        </button>

        <p className="text-center text-xs text-slate-400 mt-4">
          送信後は回答を変更できません
        </p>
      </div>
    </div>
  )
}

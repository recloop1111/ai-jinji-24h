'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'
import {
  ClipboardCopy,
  Plus,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

type Survey = {
  id: string
  department: string
  employment_type: string
  survey_url_slug: string
  is_active: boolean
  created_at: string
  response_count: number
}

type CultureProfile = {
  id: string
  department: string
  employment_type: string
  avg_openness: number
  avg_conscientiousness: number
  avg_extraversion: number
  avg_agreeableness: number
  avg_neuroticism: number
  response_count: number
  generated_description: string | null
}

const EMPLOYMENT_TYPES = ['正社員', '契約社員', 'パート・アルバイト', 'インターン'] as const

function generateSlug(companySlug: string, department: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let random = ''
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  const deptSlug = department.replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '').slice(0, 20)
  return `${companySlug}-${deptSlug}-${random}`
}

function CultureAnalysisContent() {
  const { companyId, loading: companyIdLoading } = useCompanyId()
  const supabase = createClient()

  const [enabled, setEnabled] = useState(false)
  const [companySlug, setCompanySlug] = useState('')
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [profiles, setProfiles] = useState<CultureProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalDept, setModalDept] = useState('')
  const [modalEmpType, setModalEmpType] = useState<string>(EMPLOYMENT_TYPES[0])
  const [creating, setCreating] = useState(false)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const fetchData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)

    const { data: company } = await supabase
      .from('companies')
      .select('culture_analysis_enabled, interview_slug')
      .eq('id', companyId)
      .single()

    setEnabled(company?.culture_analysis_enabled ?? false)
    setCompanySlug(company?.interview_slug ?? 'company')

    const { data: surveyRows } = await supabase
      .from('culture_surveys')
      .select('id, department, employment_type, survey_url_slug, is_active, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (surveyRows) {
      const withCounts: Survey[] = await Promise.all(
        surveyRows.map(async (s) => {
          const { count } = await supabase
            .from('culture_survey_responses')
            .select('id', { count: 'exact', head: true })
            .eq('survey_id', s.id)
          return { ...s, response_count: count ?? 0 }
        })
      )
      setSurveys(withCounts)
    }

    const { data: profileRows } = await supabase
      .from('culture_profiles')
      .select('*')
      .eq('company_id', companyId)

    if (profileRows) setProfiles(profileRows as CultureProfile[])
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    if (!companyIdLoading && companyId) fetchData()
    if (!companyIdLoading && !companyId) setLoading(false)
  }, [companyId, companyIdLoading, fetchData])

  const handleToggle = async () => {
    if (!companyId) return
    setToggling(true)
    const newVal = !enabled
    await supabase
      .from('companies')
      .update({ culture_analysis_enabled: newVal, updated_at: new Date().toISOString() })
      .eq('id', companyId)
    setEnabled(newVal)
    setToggling(false)
  }

  const handleCreateSurvey = async () => {
    if (!companyId || !modalDept.trim()) return
    setCreating(true)
    const slug = generateSlug(companySlug, modalDept.trim())
    await supabase.from('culture_surveys').insert({
      company_id: companyId,
      department: modalDept.trim(),
      employment_type: modalEmpType,
      survey_url_slug: slug,
    })
    setShowModal(false)
    setModalDept('')
    setModalEmpType(EMPLOYMENT_TYPES[0])
    setCreating(false)
    fetchData()
  }

  const handleCopy = async (slug: string) => {
    const url = `${baseUrl}/survey/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedSlug(slug)
      setTimeout(() => setCopiedSlug(null), 2000)
    } catch { /* fallback */ }
  }

  if (loading || companyIdLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">社風分析</h1>
        <p className="text-sm text-slate-500 mt-1">
          BIG FIVE性格特性理論（Goldberg, 1990）およびPerson-Organization Fit理論（Chatman, 1989）に基づく社風マッチング分析
        </p>
      </div>

      {/* ① トグル */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              社風マッチング分析を有効にする
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              有効にすると、社員アンケートを通じて社風プロファイルを構築し、応募者とのカルチャーフィットを分析します。
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className="shrink-0 ml-4"
            aria-label={enabled ? '無効にする' : '有効にする'}
          >
            {enabled ? (
              <ToggleRight className="w-12 h-12 text-blue-600" />
            ) : (
              <ToggleLeft className="w-12 h-12 text-slate-300" />
            )}
          </button>
        </div>
      </div>

      {/* OFFの場合 */}
      {!enabled && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
            <ToggleLeft className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700">
            社風マッチング分析はオフになっています
          </h3>
          <p className="text-sm text-slate-500 mt-2">
            上のスイッチをONにすると、社風分析機能をご利用いただけます。
          </p>
        </div>
      )}

      {/* ONの場合 */}
      {enabled && (
        <>
          {/* ② 注意バナー */}
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              社風分析を有効にするには、最低3名の社員アンケート回答が必要です。
              3名以上の回答が集まると、応募者のカルチャーフィットスコアが自動で算出されます。
            </p>
          </div>

          {/* ③ アンケート管理セクション */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900">アンケート管理</h2>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                新しいアンケートを作成
              </button>
            </div>

            {surveys.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p className="text-sm">まだアンケートがありません。</p>
                <p className="text-xs mt-1">「新しいアンケートを作成」ボタンからアンケートを追加してください。</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-medium text-slate-600">部署名</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">雇用形態</th>
                      <th className="text-center py-3 px-4 font-medium text-slate-600">回答数</th>
                      <th className="text-center py-3 px-4 font-medium text-slate-600">ステータス</th>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">アンケートURL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surveys.map((survey) => (
                      <tr key={survey.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900">{survey.department}</td>
                        <td className="py-3 px-4 text-slate-600">{survey.employment_type}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-medium ${
                              survey.response_count >= 3
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {survey.response_count}
                            </span>
                            {survey.response_count < 3 && (
                              <span className="text-xs text-red-500 whitespace-nowrap">
                                あと{3 - survey.response_count}名で分析有効
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            survey.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {survey.is_active ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded truncate max-w-[240px]">
                              {baseUrl}/survey/{survey.survey_url_slug}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopy(survey.survey_url_slug)}
                              className="shrink-0 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                              title="URLをコピー"
                            >
                              {copiedSlug === survey.survey_url_slug ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <ClipboardCopy className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ④ 社風プロファイル表示セクション */}
          {profiles.filter((p) => p.response_count >= 3).length > 0 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-slate-900">社風プロファイル</h2>
              {profiles
                .filter((p) => p.response_count >= 3)
                .map((profile) => {
                  const radarData = [
                    { factor: '開放性', value: profile.avg_openness, fullMark: 10 },
                    { factor: '誠実性', value: profile.avg_conscientiousness, fullMark: 10 },
                    { factor: '外向性', value: profile.avg_extraversion, fullMark: 10 },
                    { factor: '協調性', value: profile.avg_agreeableness, fullMark: 10 },
                    { factor: '情緒安定性', value: 10 - profile.avg_neuroticism, fullMark: 10 },
                  ]
                  return (
                    <div
                      key={profile.id}
                      className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-base font-semibold text-slate-900">
                          {profile.department}
                        </h3>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                          {profile.employment_type}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                          回答数: {profile.response_count}名
                        </span>
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="flex items-center justify-center">
                          <ResponsiveContainer width="100%" height={320}>
                            <RadarChart data={radarData}>
                              <PolarGrid stroke="#e2e8f0" />
                              <PolarAngleAxis
                                dataKey="factor"
                                tick={{ fill: '#475569', fontSize: 13 }}
                              />
                              <PolarRadiusAxis
                                angle={90}
                                domain={[0, 10]}
                                tick={{ fill: '#94a3b8', fontSize: 11 }}
                              />
                              <Radar
                                name="社風"
                                dataKey="value"
                                stroke="#2563eb"
                                fill="#2563eb"
                                fillOpacity={0.2}
                                strokeWidth={2}
                              />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="space-y-4">
                          {radarData.map((d) => (
                            <div key={d.factor}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-slate-700">{d.factor}</span>
                                <span className="text-sm font-semibold text-slate-900">
                                  {d.value.toFixed(1)}
                                </span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${(d.value / 10) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}

                          {profile.generated_description && (
                            <p className="text-sm text-slate-600 mt-4 leading-relaxed border-t border-slate-100 pt-4">
                              {profile.generated_description}
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 mt-4">
                        この分析はBIG FIVE性格特性理論（Goldberg, 1990）に基づいています
                      </p>
                    </div>
                  )
                })}
            </div>
          )}

          {/* ⑤ 学術根拠 */}
          <p className="text-xs text-slate-400 text-center pb-4">
            本分析はBIG FIVE性格特性理論（Goldberg, 1990）およびPerson-Organization Fit理論（Chatman,
            1989）に基づく統合分析です。
          </p>
        </>
      )}

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !creating && setShowModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900">新しいアンケートを作成</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={creating}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">部署名</label>
                <input
                  type="text"
                  value={modalDept}
                  onChange={(e) => setModalDept(e.target.value)}
                  placeholder="例: 営業部"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">雇用形態</label>
                <select
                  value={modalEmpType}
                  onChange={(e) => setModalEmpType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCreateSurvey}
                disabled={creating || !modalDept.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                作成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CultureAnalysisPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-500">読み込み中...</div></div>}>
      <CultureAnalysisContent />
    </Suspense>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft as ChevronLeftIcon, Play as PlayIcon } from 'lucide-react'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer } from 'recharts'

const DUMMY = {
  aiSummary: {
    profile: '飲食業界で5年の店長経験を持つ、数値管理と現場改善に強い実行力重視の人材。',
    career: '大学卒業後、大手飲食チェーンに入社し、入社2年目で副店長、3年目で店長に昇進。担当店舗では月間売上を前年比115%に改善し、人手不足の状況下で3ヶ月間に5名の新規採用を実現した。8名のスタッフのシフト管理・教育にも携わり、現場マネジメントの実務経験が豊富。',
    impression: '質問の意図を正確に汲み取り、具体的な数値を交えて簡潔に回答する傾向がある。特に過去の実績に関する質問では、課題→施策→結果の構造で論理的に語れており、説得力が高い。一方で、想定外の質問にはやや回答に時間がかかる場面が見られた。',
    strengthsAndConcerns: '最大の強みは、現場で培った問題解決力と数値に基づく説明力。即戦力としてマネジメント業務への適性が高い。懸念点は、3〜5年後のキャリアビジョンが漠然としており、長期定着への確信が持ちにくい点。また、チームワークに関する具体的なエピソードが少なく、協調性の実態は面接だけでは判断しきれない。',
  },
  recommendGrade: 'B',
  recommendReason: '実務経験とコミュニケーションが高く即戦力として期待できる。キャリアビジョンの明確化が課題。',
  radarAxis: [
    { label: 'コミュニケーション', value: 78 },
    { label: '論理的思考', value: 65 },
    { label: '仕事意欲', value: 85 },
    { label: 'カルチャーフィット', value: 80 },
    { label: '課題対応力', value: 58 },
    { label: '成長可能性', value: 70 },
  ],
  conversationLog: [
    { number: 1, question: 'これまでのご経歴を簡単に教えてください。', answer: '大学卒業後、大手飲食チェーンに入社し5年間勤務しております。入社2年目で副店長、3年目で店長に昇進しました。', answerDuration: '2分30秒' },
    { number: 2, question: 'なぜ当社に応募されたのですか。', answer: '現職での店舗運営経験を活かし、より大きな組織でマネジメントに関わりたいと考えました。', answerDuration: '1分45秒' },
    { number: 3, question: '最も成果を上げた経験を教えてください。', answer: '人手不足で売上が低迷していた店舗に配属された際、採用プロセスを見直し3ヶ月で5名の採用に成功しました。', answerDuration: '2分15秒' },
  ],
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '未対応' },
  { value: 'considering', label: '検討中' },
  { value: 'second_pass', label: '二次選考' },
  { value: 'rejected', label: '不採用' },
  { value: 'hired', label: '内定' },
]

const RECOMMEND_LEGEND = [
  { grade: 'A', label: '強く推奨', desc: '即戦力として高く評価' },
  { grade: 'B', label: '推奨', desc: '基本的な要件を満たし活躍が期待できる' },
  { grade: 'C', label: '条件付き推奨', desc: '一部課題があるが育成次第で可能性あり' },
  { grade: 'D', label: '非推奨', desc: '現時点では要件を満たしていない' },
] as const

type TabKey = 'summary' | 'detail' | 'conversation' | 'recording' | 'questions' | 'rawdata' | 'selection'

function CurrentStatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; className: string }> = {
    '準備中': { label: '準備中', className: 'bg-gray-600 text-gray-100' },
    '完了': { label: '完了', className: 'bg-emerald-600 text-white' },
    '途中離脱': { label: '途中離脱', className: 'bg-amber-600 text-white' },
  }
  const config = statusMap[status] || { label: status, className: 'bg-gray-600 text-gray-100' }
  return (
    <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide ${config.className}`}>
      {config.label}
    </span>
  )
}

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-emerald-500 text-white',
  B: 'bg-sky-500 text-white',
  C: 'bg-amber-500 text-white',
  D: 'bg-rose-500 text-white',
}

function GradeBadge({ grade, size = 'md' }: { grade: string; size?: 'sm' | 'md' }) {
  const isSm = size === 'sm'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 ${GRADE_STYLES[grade] || 'bg-gray-500 text-white'} ${
        isSm ? 'w-7 h-7 text-xs' : 'w-16 h-16 text-2xl'
      }`}
    >
      {grade}
    </span>
  )
}

function RecommendLegendDark() {
  return (
    <div className="mt-5 rounded-2xl bg-gray-800 border border-gray-700 px-5 py-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">採用推奨度の目安</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {RECOMMEND_LEGEND.map(({ grade, label, desc }) => (
          <div key={grade} className="flex items-start gap-3 rounded-xl bg-gray-700/50 px-3 py-2.5 border border-gray-600">
            <span className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${GRADE_STYLES[grade]}`}>
              {grade}
            </span>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-gray-200">{label}</dt>
              <dd className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  )
}

export default function AdminApplicantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [applicant, setApplicant] = useState<any>(null)
  const [interviewResult, setInterviewResult] = useState<any>(null)
  const [cultureProfile, setCultureProfile] = useState<any>(null)
  const [cultureAnalysisEnabled, setCultureAnalysisEnabled] = useState<boolean>(false)
  const [companyName, setCompanyName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [selectionStatus, setSelectionStatus] = useState<string>('pending')
  const [selectionMemo, setSelectionMemo] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '概要' },
    { key: 'detail', label: '詳細評価' },
    { key: 'conversation', label: '会話ログ' },
    { key: 'recording', label: '録画再生' },
    { key: 'questions', label: '質問別評価' },
    { key: 'rawdata', label: '生データ' },
    { key: 'selection', label: '選考管理' },
  ]

  useEffect(() => {
    async function fetchData() {
      if (!id) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const { data: applicantData, error: applicantError } = await supabase
          .from('applicants')
          .select('*')
          .eq('id', id)
          .single()

        if (applicantError) {
          console.error('[AdminApplicantDetail] Applicant fetch error:', applicantError.message)
          setApplicant(null)
        } else if (applicantData) {
          setApplicant(applicantData)
          setSelectionStatus(applicantData.selection_status || 'pending')
          setSelectionMemo(applicantData.selection_memo || '')

          const { data: irData } = await supabase
            .from('interview_results')
            .select('*')
            .eq('applicant_id', id)
            .maybeSingle()
          if (irData) {
            setInterviewResult(irData)
          }

          if (applicantData.company_id) {
            const { data: companyData } = await supabase
              .from('companies')
              .select('name, culture_analysis_enabled')
              .eq('id', applicantData.company_id)
              .maybeSingle()
            if (companyData) {
              setCompanyName(companyData.name || '')
              setCultureAnalysisEnabled(companyData.culture_analysis_enabled === true)
            }

            const { data: profileData } = await supabase
              .from('culture_profiles')
              .select('*')
              .eq('company_id', applicantData.company_id)
              .limit(1)
              .maybeSingle()
            if (profileData) {
              setCultureProfile(profileData)
            }
          }
        }
      } catch (err: any) {
        console.error('[AdminApplicantDetail] Error:', err?.message || err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id, supabase])

  const handleSaveSelection = async () => {
    if (!id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('applicants')
        .update({
          selection_status: selectionStatus,
          selection_memo: selectionMemo,
        })
        .eq('id', id)
      if (error) {
        console.error('[AdminApplicantDetail] Save error:', error.message)
        setToast('保存に失敗しました')
      } else {
        setToast('保存しました')
      }
    } catch (err: any) {
      console.error('[AdminApplicantDetail] Save error:', err?.message || err)
      setToast('保存に失敗しました')
    } finally {
      setSaving(false)
      setTimeout(() => setToast(''), 2500)
    }
  }

  const cx = 100
  const cy = 100
  const maxR = 72
  const getPoint = (i: number, r: number) => {
    const angle = (-90 + i * 60) * (Math.PI / 180)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  const radarPoints = DUMMY.radarAxis.map((d, i) => getPoint(i, (d.value / 100) * maxR))
  const radarPath = radarPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
      </div>
    )
  }

  if (!applicant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">応募者が見つかりませんでした</p>
        <Link href="/admin/applicants" className="text-indigo-400 hover:underline">
          応募者一覧に戻る
        </Link>
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10 sm:pb-12">
      <div className="rounded-2xl bg-gray-800/50 border border-gray-700 p-4 sm:p-6 min-h-[200px]">
        <div className="space-y-6 sm:space-y-8">
          {/* ヘッダー */}
          <div>
            <Link
              href="/admin/applicants"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-indigo-400 font-medium mb-4 transition-colors rounded-lg hover:bg-gray-700/50 px-2 py-1 -mx-2 -my-1"
            >
              <ChevronLeftIcon className="w-4 h-4 shrink-0" />
              応募者一覧に戻る
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-100 truncate tracking-tight">
                    {applicant.name}
                  </h1>
                  <CurrentStatusBadge status={applicant.status} />
                </div>
                <p className="text-sm text-gray-400 mt-1">{companyName}</p>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-300">
                  <div className="flex gap-2 min-w-0">
                    <dt className="text-gray-500 shrink-0">メール</dt>
                    <dd className="truncate">{applicant.email}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">電話</dt>
                    <dd>{applicant.phone}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">面接日時</dt>
                    <dd>{applicant.interview_scheduled_at ? new Date(applicant.interview_scheduled_at).toLocaleString('ja-JP') : '-'}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* タブバー */}
          <div className="rounded-2xl bg-gray-800 border border-gray-700 p-1.5 overflow-x-auto">
            <nav className="flex gap-1 min-w-max" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.key
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* タブ1: 概要 */}
          {activeTab === 'summary' && (
            <div className="space-y-8">
              {(applicant?.status === '途中離脱' || applicant?.status === '準備中') ? (
                <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                  <p className="text-gray-400 font-medium">面接が完了していないため、AI分析レポートは生成されていません</p>
                </div>
              ) : (
                <>
                  {/* AIサマリー */}
                  <div className="rounded-2xl bg-indigo-900/30 border-l-4 border-indigo-500 p-6 sm:p-7 border border-indigo-800/50">
                    <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-5">AI 面接分析</h2>
                    <div className="space-y-5 text-sm sm:text-base text-gray-300 leading-relaxed">
                      <section>
                        <p className="font-semibold text-gray-200 mb-1">人物像</p>
                        <p className="font-bold text-gray-100">{DUMMY.aiSummary.profile}</p>
                      </section>
                      <section>
                        <p className="font-semibold text-gray-200 mb-1.5">経歴・実績</p>
                        <p>{DUMMY.aiSummary.career}</p>
                      </section>
                      <section>
                        <p className="font-semibold text-gray-200 mb-1.5">面接での印象</p>
                        <p>{DUMMY.aiSummary.impression}</p>
                      </section>
                      <section>
                        <p className="font-semibold text-gray-200 mb-1.5">強みと懸念点</p>
                        <p>{DUMMY.aiSummary.strengthsAndConcerns}</p>
                      </section>
                    </div>
                  </div>

                  {/* 推薦度バッジ */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-start gap-6 p-5 rounded-2xl bg-gray-800 border border-gray-700">
                      <span className={`inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl text-4xl font-bold shrink-0 ${GRADE_STYLES[interviewResult?.detail_json?.recommendation_rank || DUMMY.recommendGrade]}`}>
                        {interviewResult?.detail_json?.recommendation_rank || DUMMY.recommendGrade}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-100">推奨</p>
                        <p className="text-sm text-gray-400 mt-1 max-w-xl leading-relaxed">{DUMMY.recommendReason}</p>
                        {interviewResult?.total_score != null && (
                          <div className="mt-4 pt-4 border-t border-gray-700">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                              <div>
                                <span className="text-sm text-gray-500">AI面接スコア: </span>
                                <span className="text-lg font-semibold text-gray-100">{interviewResult.total_score}</span>
                                <span className="text-sm text-gray-500"> / 100</span>
                              </div>
                              <div>
                                <span className="text-sm text-gray-500">カルチャーフィット: </span>
                                {interviewResult?.culture_fit_score != null ? (
                                  <span className="text-lg font-semibold text-gray-100">{interviewResult.culture_fit_score}%</span>
                                ) : (
                                  <span className="text-gray-500">-（社風分析未設定）</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <RecommendLegendDark />
                  </div>

                  {/* レーダーチャート */}
                  <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 sm:p-7 shrink-0">
                      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">6軸レーダーチャート</h2>
                      <div className="flex justify-center p-4 bg-gray-900/50 rounded-2xl">
                        <svg viewBox="0 0 200 200" className="w-48 h-48 sm:w-56 sm:h-56">
                          <defs>
                            <linearGradient id="radarFillAdmin" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.35" />
                            </linearGradient>
                          </defs>
                          {[1, 2, 3, 4, 5].map((l) => {
                            const r = (l / 5) * maxR
                            const pts = [0, 1, 2, 3, 4, 5].map((i) => getPoint(i, r))
                            const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                            return <path key={l} d={path} fill="none" stroke="#4B5563" strokeWidth="1.2" />
                          })}
                          {[0, 1, 2, 3, 4, 5].map((i) => {
                            const p = getPoint(i, maxR)
                            return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#4B5563" strokeWidth="1.2" />
                          })}
                          <path d={radarPath} fill="url(#radarFillAdmin)" stroke="#0ea5e9" strokeWidth="2.5" />
                          {DUMMY.radarAxis.map((d, i) => {
                            const p = getPoint(i, maxR + 14)
                            return (
                              <text key={i} x={p.x} y={p.y} textAnchor="middle" fill="#D1D5DB" fontSize="11" fontWeight="600">
                                {d.label}
                              </text>
                            )
                          })}
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-4">
                      {DUMMY.radarAxis.map((d, i) => (
                        <div key={i} className="bg-gray-800 rounded-2xl border border-gray-700 p-4">
                          <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-sm font-medium text-gray-200">{d.label}</span>
                            <span className="text-sm font-bold text-gray-100 tabular-nums">{d.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* タブ2: 詳細評価 */}
          {activeTab === 'detail' && (
            <div className="space-y-6">
              {(applicant?.status === '途中離脱' || applicant?.status === '準備中') ? (
                <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                  <p className="text-gray-400 font-medium">面接が完了していないため、詳細評価は生成されていません</p>
                </div>
              ) : (
                <>
                  {/* セクション1: AI面接評価 */}
                  <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                    <div className="p-6 sm:p-7">
                      <h3 className="text-base font-bold text-gray-100 mb-6">AI面接評価</h3>
                      
                      {interviewResult?.total_score != null && (
                        <div className="mb-6">
                          <p className="text-sm text-gray-500 mb-1">総合スコア</p>
                          <p className="text-3xl font-bold text-gray-100">
                            {interviewResult.total_score}<span className="text-lg font-normal text-gray-500"> / 100</span>
                          </p>
                        </div>
                      )}

                      {interviewResult?.detail_json?.recommendation_rank && (
                        <div className="mb-6">
                          <p className="text-sm text-gray-500 mb-1">推薦度</p>
                          <p className="text-lg font-semibold text-gray-100">{interviewResult.detail_json.recommendation_rank}</p>
                        </div>
                      )}

                      {interviewResult?.personality_type && (
                        <div className="mb-6">
                          <p className="text-sm text-gray-500 mb-2">性格タイプ</p>
                          <span className="inline-block px-3 py-1.5 text-sm font-medium text-indigo-300 bg-indigo-900/50 border border-indigo-700 rounded-full">
                            {interviewResult.personality_type}
                          </span>
                        </div>
                      )}

                      {interviewResult?.personality_description && (
                        <div className="mb-6">
                          <p className="text-sm text-gray-500 mb-1">性格説明</p>
                          <p className="text-sm text-gray-400 leading-relaxed">{interviewResult.personality_description}</p>
                        </div>
                      )}

                      {interviewResult?.strengths && Array.isArray(interviewResult.strengths) && interviewResult.strengths.length > 0 && (
                        <div className="mb-6">
                          <p className="text-sm text-gray-500 mb-2">強み</p>
                          <ul className="list-disc list-inside space-y-1">
                            {interviewResult.strengths.map((s: string, idx: number) => (
                              <li key={idx} className="text-sm text-gray-300">{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {interviewResult?.improvement_points && Array.isArray(interviewResult.improvement_points) && interviewResult.improvement_points.length > 0 && (
                        <div className="mb-6">
                          <p className="text-sm text-gray-500 mb-2">改善点</p>
                          <ul className="list-disc list-inside space-y-1">
                            {interviewResult.improvement_points.map((p: string, idx: number) => (
                              <li key={idx} className="text-sm text-gray-300">{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {interviewResult?.summary_text && (
                        <div className="mb-6">
                          <p className="text-sm text-gray-500 mb-2">総合所見</p>
                          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                            <p className="text-sm text-gray-300 leading-relaxed">{interviewResult.summary_text}</p>
                          </div>
                        </div>
                      )}

                      {interviewResult?.feedback_text && (
                        <div>
                          <p className="text-sm text-gray-500 mb-2">フィードバック</p>
                          <p className="text-sm text-gray-300 leading-relaxed">{interviewResult.feedback_text}</p>
                        </div>
                      )}

                      {!interviewResult?.total_score && !interviewResult?.detail_json?.recommendation_rank && !interviewResult?.personality_type && (
                        <p className="text-sm text-gray-500">AI面接評価データがありません</p>
                      )}
                    </div>
                  </div>

                  <hr className="my-8 border-gray-700" />

                  {/* セクション2: カルチャーフィット詳細分析セクション */}
                  {cultureAnalysisEnabled && interviewResult?.culture_fit_score != null && interviewResult?.big_five_scores && cultureProfile && applicant?.status === '完了' && (
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                      <div className="p-6 sm:p-7">
                        <h3 className="text-base font-bold text-gray-100 mb-1">カルチャーフィット詳細分析</h3>
                        <p className="text-xs text-gray-500 mb-6">
                          BIG FIVE性格特性理論（Goldberg, 1990）およびPerson-Organization Fit理論（Chatman, 1989）に基づく分析
                        </p>
                        
                        {/* マッチング度 */}
                        <div className="mb-8">
                          <p className="text-3xl font-bold text-gray-100 mb-2">{interviewResult.culture_fit_score}%</p>
                          <div className="relative">
                            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all bg-gradient-to-r ${
                                  interviewResult.culture_fit_score >= 80 ? 'from-green-400 to-green-500' :
                                  interviewResult.culture_fit_score >= 70 ? 'from-blue-400 to-blue-500' :
                                  interviewResult.culture_fit_score >= 50 ? 'from-yellow-400 to-yellow-500' :
                                  'from-red-400 to-red-500'
                                }`}
                                style={{ width: `${interviewResult.culture_fit_score}%` }}
                              />
                            </div>
                            <div className="absolute top-0 left-[50%] h-3 w-px bg-gray-500" />
                            <div className="absolute top-0 left-[70%] h-3 w-px bg-gray-500" />
                            <div className="absolute top-0 left-[80%] h-3 w-px bg-gray-500" />
                            <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-0.5">
                              <span>0%</span>
                              <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>50%</span>
                              <span style={{ position: 'absolute', left: '70%', transform: 'translateX(-50%)' }}>70%</span>
                              <span style={{ position: 'absolute', left: '80%', transform: 'translateX(-50%)' }}>80%</span>
                              <span>100%</span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-400 mt-3">
                            {interviewResult.culture_fit_score >= 80 ? '非常に高いマッチング' :
                             interviewResult.culture_fit_score >= 70 ? '良好なマッチング' :
                             interviewResult.culture_fit_score >= 50 ? '中程度のマッチング' : 'マッチングに課題あり'}
                          </p>
                        </div>

                        {/* BIG FIVE 比較レーダーチャート */}
                        <div className="mb-8">
                          <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart data={[
                                { subject: '開放性', applicant: interviewResult.big_five_scores.openness, company: cultureProfile.avg_openness },
                                { subject: '誠実性', applicant: interviewResult.big_five_scores.conscientiousness, company: cultureProfile.avg_conscientiousness },
                                { subject: '外向性', applicant: interviewResult.big_five_scores.extraversion, company: cultureProfile.avg_extraversion },
                                { subject: '協調性', applicant: interviewResult.big_five_scores.agreeableness, company: cultureProfile.avg_agreeableness },
                                { subject: '情緒安定性', applicant: 10 - interviewResult.big_five_scores.neuroticism, company: 10 - cultureProfile.avg_neuroticism },
                              ]}>
                                <PolarGrid stroke="#4B5563" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#D1D5DB', fontSize: 12 }} />
                                <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                                <Radar name="応募者" dataKey="applicant" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                                <Radar name={`企業平均（${cultureProfile.department || '全社'}/${cultureProfile.employment_type || '全職種'}）`} dataKey="company" stroke="#6B7280" fill="#6B7280" fillOpacity={0.05} strokeDasharray="5 5" strokeWidth={2} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* 因子別詳細テーブル */}
                        <div className="mb-8">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm border border-gray-700 rounded-lg overflow-hidden">
                              <thead>
                                <tr className="bg-gray-900 border-b border-gray-700">
                                  <th className="py-2.5 px-4 text-left font-medium text-gray-400">因子名</th>
                                  <th className="py-2.5 px-4 text-center font-medium text-gray-400">応募者</th>
                                  <th className="py-2.5 px-4 text-center font-medium text-gray-400">企業平均</th>
                                  <th className="py-2.5 px-4 text-center font-medium text-gray-400">差異</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-700">
                                {[
                                  { label: '開放性', key: 'openness', avgKey: 'avg_openness' },
                                  { label: '誠実性', key: 'conscientiousness', avgKey: 'avg_conscientiousness' },
                                  { label: '外向性', key: 'extraversion', avgKey: 'avg_extraversion' },
                                  { label: '協調性', key: 'agreeableness', avgKey: 'avg_agreeableness' },
                                  { label: '情緒安定性', key: 'neuroticism', avgKey: 'avg_neuroticism', invert: true },
                                ].map((factor: any) => {
                                  const applicantValue = factor.invert 
                                    ? (10 - interviewResult.big_five_scores[factor.key]).toFixed(1)
                                    : interviewResult.big_five_scores[factor.key].toFixed(1)
                                  const companyValue = factor.invert
                                    ? (10 - cultureProfile[factor.avgKey]).toFixed(1)
                                    : cultureProfile[factor.avgKey].toFixed(1)
                                  const diff = (Number(applicantValue) - Number(companyValue)).toFixed(1)
                                  const diffNum = Number(diff)
                                  const absDiff = Math.abs(diffNum)
                                  const diffStyle = absDiff >= 1.0 ? 'text-red-400 font-bold' :
                                                    absDiff >= 0.5 ? 'text-yellow-400 font-medium' : 'text-gray-300'
                                  return (
                                    <tr key={factor.key}>
                                      <td className="py-2.5 px-4 text-gray-300">{factor.label}</td>
                                      <td className="py-2.5 px-4 text-center text-gray-100">{applicantValue}</td>
                                      <td className="py-2.5 px-4 text-center text-gray-400">{companyValue}</td>
                                      <td className={`py-2.5 px-4 text-center ${diffStyle}`}>
                                        {diffNum > 0 ? '+' : ''}{diffNum === 0 ? '±0.0' : diff}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* 総合所見 */}
                        {interviewResult.culture_fit_detail?.summary && (
                          <div className="mb-6">
                            <p className="text-sm text-gray-300 leading-relaxed bg-gray-900 rounded-lg p-4 border border-gray-700">
                              {interviewResult.culture_fit_detail.summary}
                            </p>
                          </div>
                        )}

                        {/* 注記 */}
                        <p className="text-xs text-gray-500">
                          ※ 本分析はBIG FIVE性格特性理論（Goldberg, 1990）およびPerson-Organization Fit理論（Chatman, 1989）に基づく参考指標です。最終的な採用判断は面接内容と合わせて総合的にご判断ください。
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* タブ3: 会話ログ */}
          {activeTab === 'conversation' && (
            <div className="space-y-6">
              {applicant?.status === '準備中' ? (
                <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                  <p className="text-gray-400 font-medium">面接がまだ開始されていません</p>
                </div>
              ) : DUMMY.conversationLog.length === 0 ? (
                <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                  <p className="text-gray-400 font-medium">会話ログデータがありません</p>
                </div>
              ) : (
                DUMMY.conversationLog.map((log, i) => (
                  <div key={i} className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                    <div className="p-6 sm:p-7 border-b border-gray-700 bg-gray-900/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-100">質問 {log.number}</span>
                        <span className="text-xs text-gray-500">{log.answerDuration}</span>
                      </div>
                    </div>
                    <div className="p-6 sm:p-7 space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">質問</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{log.question}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">回答</p>
                        <p className="text-sm text-gray-200 leading-relaxed bg-gray-900/50 rounded-xl p-4 border border-gray-700">
                          {log.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* タブ4: 録画再生 */}
          {activeTab === 'recording' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">面接録画</h2>
                <div className="aspect-video bg-gray-900 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-700">
                  <button
                    type="button"
                    className="w-20 h-20 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/50"
                    aria-label="再生"
                  >
                    <PlayIcon className="w-10 h-10 ml-1" />
                  </button>
                </div>
                <p className="mt-4 text-sm text-gray-400">録画データがありません</p>
              </div>
            </div>
          )}

          {/* タブ5: 質問別評価（運営専用） */}
          {activeTab === 'questions' && (
            <div className="space-y-6">
              {interviewResult?.detail_json?.questions && Array.isArray(interviewResult.detail_json.questions) && interviewResult.detail_json.questions.length > 0 ? (
                interviewResult.detail_json.questions.map((q: any, i: number) => (
                  <div key={i} className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                    <div className="p-6 sm:p-7 border-b border-gray-700 bg-gray-900/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-100">質問 {i + 1}</span>
                        {q.score != null && (
                          <span className="text-sm font-bold text-indigo-400">{q.score}点</span>
                        )}
                      </div>
                    </div>
                    <div className="p-6 sm:p-7 space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">質問内容</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{q.question || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">回答</p>
                        <p className="text-sm text-gray-200 leading-relaxed bg-gray-900/50 rounded-xl p-4 border border-gray-700">
                          {q.answer || '-'}
                        </p>
                      </div>
                      {q.evaluation && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">評価コメント</p>
                          <p className="text-sm text-gray-400 leading-relaxed">{q.evaluation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                  <p className="text-gray-400 font-medium">質問別評価データがありません</p>
                </div>
              )}
            </div>
          )}

          {/* タブ6: 生データ（運営専用） */}
          {activeTab === 'rawdata' && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                <div className="p-6 sm:p-7">
                  <h3 className="text-sm font-bold text-gray-100 mb-4">interview_results 全カラム</h3>
                  {interviewResult ? (
                    <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-auto text-xs max-h-[600px]">
                      {JSON.stringify(interviewResult, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-gray-500 text-sm">interview_results データがありません</p>
                  )}
                </div>
              </div>
              <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                <div className="p-6 sm:p-7">
                  <h3 className="text-sm font-bold text-gray-100 mb-4">applicants 全カラム</h3>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-auto text-xs max-h-[600px]">
                    {JSON.stringify(applicant, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* タブ7: 選考管理（運営専用） */}
          {activeTab === 'selection' && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                <div className="p-6 sm:p-7">
                  <h3 className="text-sm font-bold text-gray-100 mb-6">選考ステータス管理</h3>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">選考ステータス</label>
                      <select
                        value={selectionStatus}
                        onChange={(e) => setSelectionStatus(e.target.value)}
                        className="w-full max-w-xs px-3 py-2.5 border border-gray-600 bg-gray-900 text-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">選考メモ</label>
                      <textarea
                        value={selectionMemo}
                        onChange={(e) => setSelectionMemo(e.target.value)}
                        rows={5}
                        className="w-full px-3 py-2.5 border border-gray-600 bg-gray-900 text-gray-100 placeholder-gray-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none"
                        placeholder="選考メモを入力..."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSelection}
                      disabled={saving}
                      className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800 transition-all disabled:opacity-50"
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 animate-fade-in ${
          toast === '保存しました' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast}
        </div>
      )}
    </div>
  )
}

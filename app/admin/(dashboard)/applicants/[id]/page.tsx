'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { deriveDisplayStatusJa } from '@/lib/applicants/displayStatus'
import { ChevronLeft as ChevronLeftIcon, Play as PlayIcon } from 'lucide-react'

// EBCA（Evidence-based Competency Analysis）の1軸。score=null は「判断材料不足」。
type EvalAxis = {
  label: string
  score: number | null
  rank: string | null
  evidence: string[]
  confidence: 'high' | 'medium' | 'low' | null
  insufficientReason: string | null
}

const CONFIDENCE_LABELS: Record<'high' | 'medium' | 'low', string> = { high: '高', medium: '中', low: '低' }

// 経歴要約の表示用ラベル（不明な値は生値をそのまま表示）
const EDUCATION_LABELS: Record<string, string> = {
  junior_high: '中学校卒業', high_school: '高校卒業', vocational: '専門学校卒業',
  junior_college: '短期大学卒業', university: '大学卒業', graduate: '大学院卒業', other: 'その他',
}
const INDUSTRY_EXP_LABELS: Record<string, string> = { experienced: '経験あり', inexperienced: '未経験' }

// 6評価軸キー → 日本語ラベル（evaluation_axes が label を持たない場合のフォールバック）
const AXIS_LABELS: Record<string, string> = {
  communication: 'コミュニケーション',
  logical_thinking: '論理的思考',
  initiative: '主体性・行動力',
  desire: '仕事意欲',
  stress_tolerance: 'ストレス耐性・柔軟性',
  integrity: '誠実性・一貫性',
}

// interview_results.evaluation_axes を安全に正規化（EBCA形式）。
// 配列 [{axis,label,score,rank,evidence[],confidence,insufficient_reason}] が主。
// 旧形式 [{label,value}] / オブジェクト {key:number} にも最低限対応。
// 重要: score=null（判断材料不足）は 0 に変換せず null のまま保持する。想定外/空/null は [] を返す（DUMMY補完なし）。
function normalizeEvaluationAxes(raw: unknown): EvalAxis[] {
  if (!raw || typeof raw !== 'object') return []
  const toAxis = (
    label: string, scoreRaw: unknown, rankRaw: unknown,
    evidenceRaw: unknown, confRaw: unknown, insuffRaw: unknown,
  ): EvalAxis => {
    const score = typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? scoreRaw : null
    const rank = typeof rankRaw === 'string' && rankRaw ? rankRaw : null
    const evidence = Array.isArray(evidenceRaw)
      ? evidenceRaw.filter((e): e is string => typeof e === 'string' && e.length > 0)
      : []
    const confidence = confRaw === 'high' || confRaw === 'medium' || confRaw === 'low' ? confRaw : null
    const insufficientReason = typeof insuffRaw === 'string' && insuffRaw ? insuffRaw : null
    return { label, score, rank, evidence, confidence, insufficientReason }
  }
  const out: EvalAxis[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const keyStr = typeof obj.axis === 'string' ? obj.axis : typeof obj.key === 'string' ? obj.key : ''
      const labelRaw = obj.label ?? obj.name
      const label = typeof labelRaw === 'string' && labelRaw ? labelRaw : AXIS_LABELS[keyStr] ?? (keyStr || '評価軸')
      out.push(toAxis(label, obj.score ?? obj.value, obj.rank, obj.evidence, obj.confidence, obj.insufficient_reason))
    }
  } else {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      out.push(toAxis(AXIS_LABELS[key] ?? key, val, undefined, undefined, undefined, undefined))
    }
  }
  return out
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

type TabKey = 'summary' | 'resume' | 'detail' | 'conversation' | 'recording' | 'questions' | 'rawdata' | 'selection'

function CurrentStatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; className: string }> = {
    '準備中': { label: '準備中', className: 'bg-gray-600 text-gray-100' },
    '面接中': { label: '面接中', className: 'bg-blue-600 text-white' },
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
  const id = params.id as string
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [applicant, setApplicant] = useState<any>(null)
  const [interviewResult, setInterviewResult] = useState<any>(null)
  const [latestInterviewStatus, setLatestInterviewStatus] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [selectionStatus, setSelectionStatus] = useState<string>('pending')
  const [selectionMemo, setSelectionMemo] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '概要' },
    { key: 'resume', label: '履歴書' },
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
          .select('*, jobs(title)')
          .eq('id', id)
          .single()

        if (applicantError) {
          setApplicant(null)
        } else if (applicantData) {
          setApplicant(applicantData)
          setSelectionStatus(applicantData.selection_status || 'pending')
          setSelectionMemo(applicantData.selection_memo || '')

          // 最新 interview.status（面接中/途中離脱/完了 の導出用・DBには保存しない）
          const { data: ivRows } = await supabase
            .from('interviews')
            .select('status, created_at')
            .eq('applicant_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
          setLatestInterviewStatus((ivRows ?? [])[0]?.status ?? null)

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
              .select('name')
              .eq('id', applicantData.company_id)
              .maybeSingle()
            if (companyData) {
              setCompanyName(companyData.name || '')
            }
          }
        }
      } catch {
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
        setToast('保存に失敗しました')
      } else {
        setToast('保存しました')
      }
    } catch {
      setToast('保存に失敗しました')
    } finally {
      setSaving(false)
      setTimeout(() => setToast(''), 2500)
    }
  }

  // 評価軸は interview_results.evaluation_axes の実データのみ（DUMMY補完なし）。空なら空状態。
  const evalAxes = normalizeEvaluationAxes(interviewResult?.evaluation_axes)
  // レーダーは判定済み（score≠null）の軸のみで描画。判断材料不足の軸は除外（0点として描かない）。
  const scoredAxes = evalAxes.filter((a) => a.score != null)
  const axisCount = scoredAxes.length
  const cx = 100
  const cy = 100
  const maxR = 72
  const getPoint = (i: number, r: number) => {
    const step = axisCount > 0 ? 360 / axisCount : 60
    const angle = (-90 + i * step) * (Math.PI / 180)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  // score は 0〜20。20点満点で正規化。
  const radarPoints = scoredAxes.map((d, i) => getPoint(i, (Math.max(0, Math.min(20, d.score ?? 0)) / 20) * maxR))
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
                    {`${applicant.last_name || ''} ${applicant.first_name || ''}`.trim() || '名前未設定'}
                  </h1>
                  <CurrentStatusBadge status={deriveDisplayStatusJa(applicant.status, latestInterviewStatus)} />
                </div>
                <p className="text-sm text-gray-400 mt-1">{companyName}</p>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-300">
                  <div className="flex gap-2 min-w-0">
                    <dt className="text-gray-500 shrink-0">メール</dt>
                    <dd className="truncate">{applicant.email}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500 shrink-0">電話</dt>
                    <dd>{applicant.phone_number || '-'}</dd>
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

          {/* 履歴書タブ */}
          {activeTab === 'resume' && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-6">履歴書情報</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">氏名</dt>
                    <dd className="text-sm text-gray-100">{applicant?.last_name || applicant?.first_name ? `${applicant.last_name || ''} ${applicant.first_name || ''}`.trim() : '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">フリガナ</dt>
                    <dd className="text-sm text-gray-100">{applicant?.last_name_kana || applicant?.first_name_kana ? `${applicant.last_name_kana || ''} ${applicant.first_name_kana || ''}`.trim() : '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">年齢</dt>
                    <dd className="text-sm text-gray-100">{applicant?.age != null ? `${applicant.age}歳` : '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">性別</dt>
                    <dd className="text-sm text-gray-100">{applicant?.gender || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">電話番号</dt>
                    <dd className="text-sm text-gray-100">{applicant?.phone_number || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">メールアドレス</dt>
                    <dd className="text-sm text-gray-100">{applicant?.email || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">居住都道府県</dt>
                    <dd className="text-sm text-gray-100">{applicant?.prefecture || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">最終学歴</dt>
                    <dd className="text-sm text-gray-100">{applicant?.education || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">応募職種</dt>
                    <dd className="text-sm text-gray-100">{applicant?.jobs?.title || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">就業形態</dt>
                    <dd className="text-sm text-gray-100">{applicant?.employment_type || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">業界経験</dt>
                    <dd className="text-sm text-gray-100">{applicant?.industry_experience || '未入力'}</dd>
                  </div>
                </dl>
                <div className="mt-6 space-y-5">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">職歴・業種</dt>
                    <dd className="text-sm text-gray-100 bg-gray-900/50 rounded-xl p-4 border border-gray-700 whitespace-pre-wrap">{applicant?.work_history || '未入力'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 mb-1">保有資格</dt>
                    <dd className="text-sm text-gray-100 bg-gray-900/50 rounded-xl p-4 border border-gray-700 whitespace-pre-wrap">{applicant?.qualifications || '未入力'}</dd>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* タブ1: 概要 */}
          {activeTab === 'summary' && (
            <div className="space-y-8">
              {(applicant?.status === '途中離脱' || applicant?.status === '準備中') ? (
                <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                  <p className="text-gray-400 font-medium">面接が完了していないため、AI分析レポートは生成されていません</p>
                </div>
              ) : (
                !interviewResult ? (
                  <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                    <p className="text-gray-400 font-medium">AI評価レポートはまだ生成されていません</p>
                  </div>
                ) : (
                  <>
                    {/* 人物概要（profile_summary.persona 優先 / 無ければ既存DB項目で代替） */}
                    {(interviewResult.detail_json?.profile_summary?.persona || interviewResult.personality_type || interviewResult.summary_text || interviewResult.feedback_text) && (
                      <div className="rounded-2xl bg-indigo-900/30 border-l-4 border-indigo-500 p-6 sm:p-7 border border-indigo-800/50">
                        <h2 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-5">人物概要</h2>
                        <div className="space-y-5 text-sm sm:text-base text-gray-300 leading-relaxed">
                          {interviewResult.detail_json?.profile_summary?.persona ? (
                            <section>
                              <p className="font-bold text-gray-100 whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.persona}</p>
                            </section>
                          ) : (
                            <>
                              {interviewResult.personality_type && (
                                <section>
                                  <p className="font-semibold text-gray-200 mb-1">人物像</p>
                                  <p className="font-bold text-gray-100">{interviewResult.personality_type}</p>
                                  {interviewResult.personality_description && (
                                    <p className="mt-1.5">{interviewResult.personality_description}</p>
                                  )}
                                </section>
                              )}
                              {interviewResult.summary_text && (
                                <section>
                                  <p className="font-semibold text-gray-200 mb-1.5">総評</p>
                                  <p>{interviewResult.summary_text}</p>
                                </section>
                              )}
                            </>
                          )}
                          {interviewResult.feedback_text && (
                            <section>
                              <p className="font-semibold text-gray-200 mb-1.5">面接での印象</p>
                              <p>{interviewResult.feedback_text}</p>
                            </section>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 経歴要約（profile_summary.career 優先 / 無ければ応募者の職歴・業界経験・学歴で代替） */}
                    <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6 sm:p-7">
                      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">経歴要約</h2>
                      {interviewResult.detail_json?.profile_summary?.career ? (
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.career}</p>
                      ) : (applicant?.work_history || applicant?.industry_experience || applicant?.education) ? (
                        <dl className="space-y-3">
                          {applicant?.work_history && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500 mb-1">職務経歴</dt>
                              <dd className="text-sm text-gray-200 whitespace-pre-wrap">{applicant.work_history}</dd>
                            </div>
                          )}
                          {applicant?.industry_experience && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500 mb-1">業界経験</dt>
                              <dd className="text-sm text-gray-200">{INDUSTRY_EXP_LABELS[applicant.industry_experience] ?? applicant.industry_experience}</dd>
                            </div>
                          )}
                          {applicant?.education && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500 mb-1">最終学歴</dt>
                              <dd className="text-sm text-gray-200">{EDUCATION_LABELS[applicant.education] ?? applicant.education}</dd>
                            </div>
                          )}
                        </dl>
                      ) : (
                        <p className="text-sm text-gray-400">経歴情報はまだありません。</p>
                      )}
                    </div>

                    {/* 強み */}
                    {Array.isArray(interviewResult.strengths) && interviewResult.strengths.length > 0 && (
                      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6 sm:p-7">
                        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">強み</h2>
                        <ul className="space-y-3">
                          {interviewResult.strengths.map((s: string, idx: number) => (
                            <li key={idx} className="pl-4 border-l-2 border-emerald-500/40 text-sm text-gray-300 leading-relaxed">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 推薦度バッジ（実データ recommendation_rank がある場合のみ） */}
                    {interviewResult.detail_json?.recommendation_rank && (
                      <div>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-6 p-5 rounded-2xl bg-gray-800 border border-gray-700">
                          <span className={`inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl text-4xl font-bold shrink-0 ${GRADE_STYLES[interviewResult.detail_json.recommendation_rank] || 'bg-gray-600 text-white'}`}>
                            {interviewResult.detail_json.recommendation_rank}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-100">推奨</p>
                            {interviewResult.feedback_text && (
                              <p className="text-sm text-gray-400 mt-1 max-w-xl leading-relaxed">{interviewResult.feedback_text}</p>
                            )}
                            {interviewResult.total_score != null && (
                              <div className="mt-4 pt-4 border-t border-gray-700">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                                  <div>
                                    <span className="text-sm text-gray-500">AI面接スコア: </span>
                                    <span className="text-lg font-semibold text-gray-100">{interviewResult.total_score}</span>
                                    <span className="text-sm text-gray-500"> / 100</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <RecommendLegendDark />
                      </div>
                    )}

                    {/* 評価軸（EBCA）。score=null は「判断材料不足」。レーダーは判定済み軸のみ。無ければ空状態 */}
                    {evalAxes.length > 0 ? (
                      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 sm:p-7 shrink-0">
                          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-5">評価軸レーダーチャート</h2>
                          {scoredAxes.length > 0 ? (
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
                                  const pts = scoredAxes.map((_, i) => getPoint(i, r))
                                  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                                  return <path key={l} d={path} fill="none" stroke="#4B5563" strokeWidth="1.2" />
                                })}
                                {scoredAxes.map((_, i) => {
                                  const p = getPoint(i, maxR)
                                  return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#4B5563" strokeWidth="1.2" />
                                })}
                                <path d={radarPath} fill="url(#radarFillAdmin)" stroke="#0ea5e9" strokeWidth="2.5" />
                                {scoredAxes.map((d, i) => {
                                  const p = getPoint(i, maxR + 14)
                                  return (
                                    <text key={i} x={p.x} y={p.y} textAnchor="middle" fill="#D1D5DB" fontSize="11" fontWeight="600">
                                      {d.label}
                                    </text>
                                  )
                                })}
                              </svg>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 p-4">レーダー表示できる評価軸がありません（全軸が判断材料不足）</p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-4">
                          {evalAxes.map((d, i) => (
                            <div key={i} className="bg-gray-800 rounded-2xl border border-gray-700 p-4">
                              <div className="flex justify-between items-baseline gap-3 mb-1.5">
                                <span className="text-sm font-medium text-gray-200">{d.label}</span>
                                {d.score != null ? (
                                  <span className="text-sm font-bold text-gray-100 tabular-nums whitespace-nowrap">
                                    {d.score}<span className="text-xs font-normal text-gray-500"> / 20</span>
                                    {d.rank && <span className="ml-2 text-xs font-semibold text-sky-400">{d.rank}</span>}
                                  </span>
                                ) : (
                                  <span className="text-xs font-semibold text-amber-400 whitespace-nowrap">判断材料不足</span>
                                )}
                              </div>
                              {d.confidence && (
                                <p className="text-xs text-gray-500 mb-1">信頼度: {CONFIDENCE_LABELS[d.confidence]}</p>
                              )}
                              {d.score == null && d.insufficientReason && (
                                <p className="text-xs text-amber-300/80 mb-1">{d.insufficientReason}</p>
                              )}
                              {d.evidence.length > 0 && (
                                <ul className="mt-1.5 space-y-1">
                                  {d.evidence.map((e, j) => (
                                    <li key={j} className="text-xs text-gray-400 leading-relaxed border-l-2 border-gray-600 pl-2.5">{e}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-800 rounded-2xl border border-gray-700 p-8 text-center">
                        <p className="text-gray-400 font-medium">評価軸データはまだありません</p>
                      </div>
                    )}

                    {/* 懸念点・追加確認ポイント（改善点 ＋ EBCAの判断材料不足軸を統合） */}
                    {((Array.isArray(interviewResult.improvement_points) && interviewResult.improvement_points.length > 0) ||
                      evalAxes.filter((a) => a.score == null).length > 0) && (
                      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6 sm:p-7">
                        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">懸念点・追加確認ポイント</h2>
                        {Array.isArray(interviewResult.improvement_points) && interviewResult.improvement_points.length > 0 && (
                          <ul className="space-y-3">
                            {interviewResult.improvement_points.map((w: string, idx: number) => (
                              <li key={idx} className="pl-4 border-l-2 border-amber-500/40 text-sm text-gray-300 leading-relaxed">{w}</li>
                            ))}
                          </ul>
                        )}
                        {evalAxes.filter((a) => a.score == null).length > 0 && (
                          <div className="mt-5 pt-4 border-t border-gray-700">
                            <p className="text-xs font-semibold text-amber-400 mb-2">判断材料不足・次回確認ポイント</p>
                            <ul className="space-y-2">
                              {evalAxes.filter((a) => a.score == null).map((a, idx) => (
                                <li key={idx} className="pl-4 border-l-2 border-amber-500/40 text-sm text-gray-300 leading-relaxed">
                                  <span className="font-medium">{a.label}</span>{a.insufficientReason ? `：${a.insufficientReason}` : '：判断材料が不足しています'}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 面接官向けメモ（profile_summary.interviewer_notes があれば表示） */}
                    {interviewResult.detail_json?.profile_summary?.interviewer_notes && (
                      <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6 sm:p-7">
                        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">面接官向けメモ</h2>
                        <p className="text-xs text-gray-500 mb-4">採用判断で特に見るべきポイント</p>
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.interviewer_notes}</p>
                      </div>
                    )}
                  </>
                )
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
              ) : (
                // 会話ログ（interview_logs）は録画/文字起こしパイプライン（P-10）導入後に表示
                <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 text-center">
                  <p className="text-gray-400 font-medium">会話ログデータがありません</p>
                </div>
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

'use client'

import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClientBrowserClient } from '@/lib/supabase/client'
import { useCompanyPermissions } from '@/lib/rbac/useCompanyPermissions'
import { resultKeyToValue, MAX_SELECTION_MEMO_LENGTH, type SelectionResultKey } from '@/lib/applicants/selectionResult'
import { deriveCurrentStatus, CURRENT_STATUS_LABEL } from '@/lib/applicants/displayStatus'
import TranscriptLog from '@/components/interview/TranscriptLog'
import {
  TRANSCRIPT_DISPLAY_COLUMNS,
  resolveTranscriptFetchState,
  type TranscriptFetchState,
} from '@/lib/interview/transcript-company-read'
import {
  normalizeEvaluationAxesForDisplay,
  resolveEvaluationDisplayState,
  sortAxesForDisplay,
  confidenceText,
  CONFIDENCE_DISPLAY_LABEL,
  CONFIDENCE_HINT,
  type DisplayAxis,
} from '@/lib/evaluation/evaluation-view'
import {
  formatInterviewDuration,
  formatAnsweredProgress,
  isAnsweredProgressAvailable,
  endReasonLabel,
  interviewBillingLabel,
  aiEvaluationAbsenceMessage,
} from '@/lib/interview/interview-summary-display'
import {
  genderLabel, employmentTypeLabel, industryExperienceLabel, schoolTypeLabel, graduationStatusLabel,
  formatYearMonth, formatBirthDate, formatPostalCode, joinResumeAddress, resumeSectionMode, resolveDisplayAge,
  type ResumeEducationView, type ResumeWorkView, type ResumeLicenseView, type ResumeChildStatus,
} from '@/lib/resume/resume-view'
import { ChevronLeft as ChevronLeftIcon, ChevronDown as ChevronDownIcon, Download, Mail, LinkIcon, Copy, Check } from 'lucide-react'


const STATUS_OPTIONS = [
  { value: 'pending', label: '未対応' },
  { value: 'considering', label: '検討中' },
  { value: 'second_pass', label: '二次通過' },
  { value: 'rejected', label: '不採用' },
]

// 選考メモ最終更新日時の表示（YYYY/MM/DD HH:mm）。actor UUID は画面に出さない（氏名整備は E-5-3）。
function formatMemoUpdatedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const RECOMMEND_LEGEND = [
  { grade: 'A', label: '強く推奨', desc: '即戦力として高く評価' },
  { grade: 'B', label: '推奨', desc: '基本的な要件を満たし活躍が期待できる' },
  { grade: 'C', label: '条件付き推奨', desc: '一部課題があるが育成次第で可能性あり' },
  { grade: 'D', label: '非推奨', desc: '現時点では要件を満たしていない' },
] as const

type TabKey = 'summary' | 'detail' | 'conversation' | 'recording' | 'share' | 'resume'

// 画面で参照する実DBカラムに合わせた最小型（supabase の戻り値を受ける。全面型生成はしない）
type ApplicantRow = {
  last_name?: string | null
  first_name?: string | null
  last_name_kana?: string | null
  first_name_kana?: string | null
  email?: string | null
  phone_number?: string | null
  age?: number | null
  education?: string | null
  employment_type?: string | null
  gender?: string | null
  industry_experience?: string | null
  prefecture?: string | null
  qualifications?: string | null
  status?: string | null
  work_history?: string | null
  company_id?: string | null
  result?: string | null
  jobs?: { title?: string } | null
  // デジタル履歴書 v1 の追加列（applicants への additive・SELECT * で取得済み）
  birth_date?: string | null
  postal_code?: string | null
  city?: string | null
  town?: string | null
  address_line?: string | null
  building?: string | null
  motivation?: string | null
  self_pr?: string | null
  personal_requests?: string | null
  resume_updated_at?: string | null
}

type InterviewRow = {
  id?: string | null
  status?: string | null
  started_at?: string | null
  ended_at?: string | null
  recording_url?: string | null
  total_questions?: number | null
  answered_questions?: number | null
  duration_seconds?: number | null
  end_reason?: string | null
  is_billable?: boolean | null
}

type InterviewResultRow = {
  total_score?: number | null
  detail_json?: {
    recommendation_rank?: string
    // P-10 OpenAI writer が面接全体から生成（無ければ既存DB項目で代替表示）
    profile_summary?: {
      persona?: string | null
      career?: string | null
      interviewer_notes?: string | null
    } | null
  } | null
  summary_text?: string | null
  feedback_text?: string | null
  personality_type?: string | null
  personality_description?: string | null
  strengths?: string[] | null
  improvement_points?: string[] | null
  evaluation_axes?: unknown
}

// EBCA 6軸の正規化・表示ロジックは lib/evaluation/evaluation-view.ts（SoT）へ集約（新旧 evidence 両対応・null≠0）。

// 経歴要約の表示用ラベル（不明な値は生値をそのまま表示）
const EDUCATION_LABELS: Record<string, string> = {
  junior_high: '中学校卒業', high_school: '高校卒業', vocational: '専門学校卒業',
  junior_college: '短期大学卒業', university: '大学卒業', graduate: '大学院卒業', other: 'その他',
}
const INDUSTRY_EXP_LABELS: Record<string, string> = { experienced: '経験あり', inexperienced: '未経験' }

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25',
  B: 'bg-sky-500 text-white shadow-md shadow-sky-500/25',
  C: 'bg-amber-500 text-white shadow-md shadow-amber-500/25',
  D: 'bg-rose-500 text-white shadow-md shadow-rose-500/25',
}

// ── デジタル履歴書タブの表示用小コンポーネント ──
function ResumeSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">{title}</h3>
      {children}
    </div>
  )
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500 mb-1">{label}</dt>
      <dd className="text-sm text-slate-900 whitespace-pre-wrap break-words">{value.trim() ? value : '未入力'}</dd>
    </div>
  )
}
function LongTextBlock({ value }: { value: string | null | undefined }) {
  const v = value ?? ''
  return (
    <dd className="text-sm text-slate-900 bg-slate-50 rounded-xl p-4 border border-slate-200/80 whitespace-pre-wrap break-words">
      {v.trim() ? v : '未入力'}
    </dd>
  )
}
function ResumeErrorNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      履歴書情報を取得できませんでした。時間をおいて再度お試しください。
    </div>
  )
}
function ResumeMuted({ text }: { text: string }) {
  return <p className="text-sm text-slate-400">{text}</p>
}

function RecommendLegend() {
  return (
    <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200/90 px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">採用推奨度の目安</p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {RECOMMEND_LEGEND.map(({ grade, label, desc }) => (
          <div key={grade} className="flex items-start gap-3 rounded-xl bg-white/80 px-3 py-2.5 border border-slate-100">
            <span className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${GRADE_STYLES[grade]}`}>
              {grade}
            </span>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-slate-700">{label}</dt>
              <dd className="text-xs text-slate-500 mt-0.5 leading-snug">{desc}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  )
}


export default function ApplicantDetailPage() {
  const params = useParams()
  const id = params.id as string
  // createClientBrowserClient() を毎レンダー生成するとデータ取得 effect の依存(supabase)が
  // 毎回変わり再取得ループ（画面チカチカ）になるため useMemo で安定化する（billing ページと同方式・6620f8f）。
  const supabase = useMemo(() => createClientBrowserClient(), [])
  // 企業RBAC（Phase E-5-2）: VIEWER には write/export 操作を出さない。security の正はサーバ/RLS。
  const { can } = useCompanyPermissions()


  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  // 選考メモ（applicants.selection_memo）＋最終更新日時。fetch 効果より前に宣言（use-before-declare 回避）。
  const [selectionMemo, setSelectionMemo] = useState('')
  const [selectionMemoUpdatedAt, setSelectionMemoUpdatedAt] = useState<string | null>(null)
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
  const [applicant, setApplicant] = useState<ApplicantRow | null>(null)
  const [interview, setInterview] = useState<InterviewRow | null>(null)
  const [interviewResult, setInterviewResult] = useState<InterviewResultRow | null>(null)
  const [loading, setLoading] = useState(true)
  // 利用計上表示用の demo 判定（DB 権威 companies.is_demo）。service-role API 経由（自社のみ・鍵は server）。
  //   tri-state: null=未取得/判定不能（→「利用計上：—」・false へ決めつけない）。client の is_demo/query/mode は使わない。
  const [isDemoCompany, setIsDemoCompany] = useState<boolean | null>(null)
  // P3: 会話ログ（Transcript）。この応募者の最新 interview を browser Supabase(RLS) で取得。
  //   4状態（ready/empty/schema_pending/error）を区別。missing-schema のみ safe empty へ縮退。
  const [transcriptState, setTranscriptState] = useState<TranscriptFetchState>({ status: 'empty', items: [] })
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  // デジタル履歴書 v1: 構造化子テーブル（RLS で自社のみ）。error≠「0件（未入力）」を区別する。
  const [resumeEducations, setResumeEducations] = useState<ResumeEducationView[]>([])
  const [resumeWork, setResumeWork] = useState<ResumeWorkView[]>([])
  const [resumeLicenses, setResumeLicenses] = useState<ResumeLicenseView[]>([])
  const [resumeChildStatus, setResumeChildStatus] = useState<ResumeChildStatus>('loading')
  // 履歴書PDF ダウンロード（都度生成・二重クリック防止・失敗時は簡潔なエラー表示）
  const [resumePdfLoading, setResumePdfLoading] = useState(false)
  const [resumePdfError, setResumePdfError] = useState(false)
  // AI面接結果レポートPDF ダウンロード（interview_results 存在時のみ有効）
  const [reportPdfLoading, setReportPdfLoading] = useState(false)
  const [reportPdfError, setReportPdfError] = useState(false)

  // Supabaseから応募者データと面接データを取得
  useEffect(() => {
    async function fetchApplicant() {
      if (!id) {
        setLoading(false)
        return
      }
      
      setLoading(true)
      // 履歴書子テーブルの状態を id 切替ごとにリセット（前応募者の残像を出さない）。
      setResumeChildStatus('loading'); setResumeEducations([]); setResumeWork([]); setResumeLicenses([])

      try {
        // 応募者データを取得
        const { data: applicantData, error: applicantError } = await supabase
          .from('applicants')
          .select('*, jobs(title)')
          .eq('id', id)
          .single()


        if (applicantError) {
          setApplicant(null)
          setResumeChildStatus('error') // 応募者本体が取れない＝履歴書も取得不可（未入力と偽装しない）
        } else if (applicantData) {
          setApplicant(applicantData)
          setSelectedStatus(applicantData.result === '未対応' ? null : applicantData.result === '検討中' ? 'considering' : applicantData.result === '二次通過' ? 'second_pass' : applicantData.result === '不採用' ? 'rejected' : null)
          // 選考メモ（applicants.selection_memo）を state へロード（未入力は ''）。
          //   selection_memo_updated_at は actor 列 migration 適用後のみ存在（未適用時は undefined → 非表示）。
          setSelectionMemo((applicantData as { selection_memo?: string | null }).selection_memo ?? '')
          setSelectionMemoUpdatedAt((applicantData as { selection_memo_updated_at?: string | null }).selection_memo_updated_at ?? null)

          // デジタル履歴書 v1: 学歴/職歴/資格の子3テーブルを並列取得（自社のみ RLS・明示列・sort_order ASC）。
          //   取得エラーは 0件（未入力）と偽装せず 'error' として区別（画面に安全なエラー表示）。
          try {
            const [eduRes, workRes, licRes] = await Promise.all([
              supabase.from('applicant_educations')
                .select('school_type, school_name, faculty_department, entered_year_month, graduated_year_month, graduation_status, sort_order')
                .eq('applicant_id', id).order('sort_order', { ascending: true }),
              supabase.from('applicant_work_experiences')
                .select('company_name, department, position, employment_type, joined_year_month, left_year_month, is_current, description, sort_order')
                .eq('applicant_id', id).order('sort_order', { ascending: true }),
              supabase.from('applicant_licenses')
                .select('name, acquired_year_month, sort_order')
                .eq('applicant_id', id).order('sort_order', { ascending: true }),
            ])
            if (eduRes.error || workRes.error || licRes.error) {
              setResumeChildStatus('error')
            } else {
              setResumeEducations((eduRes.data ?? []) as ResumeEducationView[])
              setResumeWork((workRes.data ?? []) as ResumeWorkView[])
              setResumeLicenses((licRes.data ?? []) as ResumeLicenseView[])
              setResumeChildStatus('ready')
            }
          } catch {
            setResumeChildStatus('error')
          }

          // interview_resultsを取得
          const { data: irData } = await supabase
            .from('interview_results')
            .select('*')
            .eq('applicant_id', id)
            .maybeSingle()
          if (irData) {
            setInterviewResult(irData)
          }

          // 面接データを取得（最新の1件）
          const { data: interviewData, error: interviewError } = await supabase
            .from('interviews')
            .select('*')
            .eq('applicant_id', id)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!interviewError && interviewData) {
            setInterview(interviewData)
          } else {
            setInterview(null)
          }
        } else {
          setApplicant(null)
          setResumeChildStatus('error')
        }
      } catch {
        setApplicant(null)
        setResumeChildStatus('error')
      }
      setLoading(false)
    }
    fetchApplicant()
  }, [id, supabase])

  // 利用計上の demo 判定を DB 権威で取得（自社のみ・service-role API）。取得失敗は false（安全側）。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/client/company-flags')
        const json = await res.json().catch(() => null)
        // tri-state: boolean のときだけ確定。それ以外（null/失敗）は unknown のまま（利用計上：—）。
        if (!cancelled && res.ok && json && typeof json.is_demo === 'boolean') setIsDemoCompany(json.is_demo)
      } catch {
        /* noop: demo 判定不能は null のまま（利用計上：—・false へ決めつけない） */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // P3: 会話ログ取得。最新 interview の transcript を RLS(company_select_interview_transcripts)＋
  //   interview_id 絞り込みで取得（service-role をブラウザに出さない・companyId をブラウザから信用しない）。
  //   最小列のみ SELECT・seq 昇順。missing-schema/permission/unknown は resolveTranscriptFetchState が区別。
  useEffect(() => {
    const interviewId = interview?.id
    let cancelled = false
    async function loadTranscript() {
      if (!interviewId) {
        setTranscriptState({ status: 'empty', items: [] })
        setTranscriptLoading(false)
        return
      }
      setTranscriptLoading(true)
      const res = await supabase
        .from('interview_transcripts')
        .select(TRANSCRIPT_DISPLAY_COLUMNS)
        .eq('interview_id', interviewId)
        .order('seq', { ascending: true })
      if (cancelled) return
      setTranscriptState(resolveTranscriptFetchState(res))
      setTranscriptLoading(false)
    }
    loadTranscript()
    return () => {
      cancelled = true
    }
  }, [interview?.id, supabase])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusSaveError, setStatusSaveError] = useState('')
  const [toast, setToast] = useState('')
  // 共有タブ用
  const [shareEmail, setShareEmail] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  // メールで共有（応募者総合レポートPDF 添付）
  const [shareSending, setShareSending] = useState(false)
  const [shareError, setShareError] = useState('')
  const [shareSuccess, setShareSuccess] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '概要' },
    { key: 'resume', label: '履歴書' },
    { key: 'detail', label: '詳細評価' },
    { key: 'conversation', label: '会話ログ' },
    { key: 'recording', label: '録画再生' },
    { key: 'share', label: '共有' },
  ]

  // 履歴書PDF を都度生成してダウンロード（server が最新 DB から生成）。PII は blob 経由で扱い URL に載せない。
  async function downloadResumePdf() {
    if (resumePdfLoading) return
    setResumePdfLoading(true)
    setResumePdfError(false)
    try {
      const res = await fetch(`/api/client/applicants/${id}/resume-pdf`)
      if (!res.ok) throw new Error('failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `resume_${id.slice(0, 8)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setResumePdfError(true)
      setTimeout(() => setResumePdfError(false), 4000)
    } finally {
      setResumePdfLoading(false)
    }
  }

  // 選考結果（applicants.result）＋選考メモ（applicants.selection_memo）を server route 経由で1回のUPDATEで永続化。
  //   API 成功時のみ「保存しました」。失敗時は成功表示せず入力（selectedStatus/selectionMemo）を保持。
  //   二重クリックは savingStatus で防止。2000文字超は送信前に中断。
  async function saveSelectionResult() {
    if (savingStatus) return
    if (selectionMemo.length > MAX_SELECTION_MEMO_LENGTH) {
      setStatusSaveError(`選考メモは${MAX_SELECTION_MEMO_LENGTH}文字以内で入力してください。`)
      return
    }
    setSavingStatus(true)
    setStatusSaveError('')
    try {
      const res = await fetch(`/api/client/applicants/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: resultKeyToValue(selectedStatus as SelectionResultKey),
          selection_memo: selectionMemo,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json || json.updated === undefined) {
        setStatusSaveError('選考結果を保存できませんでした。時間をおいて再度お試しください。')
        return
      }
      if (typeof json.selection_memo_updated_at === 'string') setSelectionMemoUpdatedAt(json.selection_memo_updated_at)
      setToast('保存しました')
      setTimeout(() => setToast(''), 2500)
    } catch {
      setStatusSaveError('選考結果を保存できませんでした。時間をおいて再度お試しください。')
    } finally {
      setSavingStatus(false)
    }
  }

  // 応募者総合レポートPDF（履歴書＋AI面接評価）を都度生成してダウンロード（評価が無ければ button disabled のため到達しない）。
  async function downloadReportPdf() {
    if (reportPdfLoading || !interviewResult) return
    setReportPdfLoading(true)
    setReportPdfError(false)
    try {
      const res = await fetch(`/api/client/applicants/${id}/applicant-report-pdf`)
      if (!res.ok) throw new Error('failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `applicant-report_${id.slice(0, 8)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setReportPdfError(true)
      setTimeout(() => setReportPdfError(false), 4000)
    } finally {
      setReportPdfLoading(false)
    }
  }

  // 応募者総合レポートをメールで共有（PDF 添付）。provider 成功時のみ成功表示・失敗時は入力保持。
  async function sendShareEmail() {
    if (shareSending || !interviewResult) return
    setShareError('')
    setShareSuccess(false)
    const email = shareEmail.trim()
    if (!email) { setShareError('送信先メールアドレスを入力してください'); return }
    if (email.length > 254 || /[\r\n]/.test(email) || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) {
      setShareError('メールアドレスの形式が正しくありません'); return
    }
    if (shareMessage.trim().length > 1000) { setShareError('メッセージは1000文字以内で入力してください'); return }
    setShareSending(true)
    try {
      const res = await fetch(`/api/client/applicants/${id}/share-report-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message: shareMessage.trim() || undefined }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.sent) {
        // 送信できていないのに成功表示しない。入力は保持して再送可能に。
        setShareError(json?.error?.message || 'メールを送信できませんでした。もう一度お試しください。')
        setShareSending(false)
        return
      }
      // provider 成功時のみ成功表示。誤再送防止のため入力をクリア。
      setShareSuccess(true)
      setShareEmail('')
      setShareMessage('')
      setTimeout(() => setShareSuccess(false), 4000)
    } catch {
      setShareError('メールを送信できませんでした。もう一度お試しください。')
    } finally {
      setShareSending(false)
    }
  }

  // 基本情報は applicants の実データのみ（取得できない場合は空状態）
  const displayName = applicant ? `${applicant.last_name || ''} ${applicant.first_name || ''}`.trim() || '名前未設定' : '—'
  const displayEmail = applicant?.email || '—'
  const displayPhone = applicant?.phone_number || '—'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <span className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10 sm:pb-12">
      <div className="rounded-2xl bg-slate-50/70 sm:bg-slate-50/50 border border-slate-200/60 p-4 sm:p-6 shadow-inner min-h-[200px]">
        <div className="space-y-6 sm:space-y-8">
          {/* ヘッダー */}
          <div>
            <Link
              href="/client/applicants"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 font-medium mb-4 transition-colors rounded-lg hover:bg-white/60 px-2 py-1 -mx-2 -my-1"
            >
              <ChevronLeftIcon className="w-4 h-4 shrink-0" />
              応募者一覧に戻る
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate tracking-tight">{displayName}</h1>
                  {(() => {
                    const cs = deriveCurrentStatus(applicant?.status, interview?.status ?? null)
                    const cls = cs === 'preparing' ? 'bg-slate-100 text-slate-600'
                      : cs === 'in_progress' ? 'bg-blue-100 text-blue-600'
                      : cs === 'completed' ? 'bg-green-100 text-green-600'
                      : 'bg-red-100 text-red-600'
                    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>{CURRENT_STATUS_LABEL[cs]}</span>
                  })()}
                  {can('selection.manage') && (
                  <div ref={statusDropdownRef} className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity ${
                        selectedStatus == null || selectedStatus === 'pending' ? 'bg-gray-100 text-gray-600' :
                        selectedStatus === 'considering' ? 'bg-amber-50 text-amber-700 border border-amber-200/80' :
                        selectedStatus === 'second_pass' ? 'bg-sky-50 text-sky-700 border border-sky-200/80' :
                        'bg-rose-50 text-rose-700 border border-rose-200/80'
                      }`}
                    >
                      {selectedStatus == null || selectedStatus === 'pending' ? '未対応' : selectedStatus === 'considering' ? '検討中' : selectedStatus === 'second_pass' ? '二次通過' : '不採用'}
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    {statusDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[120px] py-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStatus(null)
                            setStatusDropdownOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          未対応
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStatus('considering')
                            setStatusDropdownOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          検討中
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStatus('second_pass')
                            setStatusDropdownOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          二次通過
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStatus('rejected')
                            setStatusDropdownOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          不採用
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600">
                  <div className="flex gap-2 min-w-0">
                    <dt className="text-slate-500 shrink-0">メール</dt>
                    <dd className="truncate">{displayEmail}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-500 shrink-0">電話</dt>
                    <dd>{displayPhone}</dd>
                  </div>
                </dl>
              </div>
              {/* 選考ステータス（VIEWER は変更不可＝非表示。RBAC） */}
              {can('selection.manage') && (
              <div className="w-full sm:w-72 shrink-0 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-md shadow-slate-200/50">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">選考結果</h3>
                <div className="space-y-3">
                  <select
                    value={selectedStatus ?? 'pending'}
                    onChange={(e) => setSelectedStatus(e.target.value === 'pending' ? null : e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <div>
                    <textarea
                      value={selectionMemo}
                      onChange={(e) => setSelectionMemo(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none"
                      placeholder="選考メモを入力..."
                    />
                    <p className={`mt-1 text-right text-xs ${selectionMemo.length > MAX_SELECTION_MEMO_LENGTH ? 'text-red-600' : 'text-slate-400'}`}>
                      {selectionMemo.length} / {MAX_SELECTION_MEMO_LENGTH}
                    </p>
                  </div>
                  {selectionMemoUpdatedAt && (
                    <p className="text-xs text-slate-400">最終更新：{formatMemoUpdatedAt(selectionMemoUpdatedAt)}</p>
                  )}
                  {statusSaveError && <p className="text-sm text-red-600">{statusSaveError}</p>}
                  <button
                    type="button"
                    onClick={saveSelectionResult}
                    disabled={savingStatus || selectionMemo.length > MAX_SELECTION_MEMO_LENGTH}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-md shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingStatus ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
              )}
              {/* VIEWER（選考変更権限なし）: 選考メモを read-only 表示（改行保持・React 既定エスケープ）。 */}
              {!can('selection.manage') && (
              <div className="w-full sm:w-72 shrink-0 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-md shadow-slate-200/50">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">選考メモ</h3>
                {selectionMemo.trim() ? (
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{selectionMemo}</p>
                ) : (
                  <p className="text-sm text-slate-400">メモはありません</p>
                )}
                {selectionMemoUpdatedAt && (
                  <p className="mt-3 text-xs text-slate-400">最終更新：{formatMemoUpdatedAt(selectionMemoUpdatedAt)}</p>
                )}
              </div>
              )}
            </div>
          </div>


          {/* ステータス別バナー */}
          {applicant?.status === '途中離脱' && (
            <div className="rounded-2xl bg-red-50 border-l-4 border-red-500 p-6 shadow-md shadow-red-200/50 border border-red-100">
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-red-900 mb-2">この応募者は面接を途中で離脱しました</h2>
                  {/* technical failure と本人都合を区別（本人がやめたと断定しない） */}
                  <p className="text-sm text-red-800 mb-4">{aiEvaluationAbsenceMessage(interview?.status, interview?.end_reason)}</p>

                  {/* 面接情報（既存データのみ・presentation 整形。回答進捗は null と 0 を区別） */}
                  {interview && (
                    <div className="bg-white/60 rounded-xl p-4 border border-red-100">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">離脱日時</dt>
                          <dd className="text-slate-700">
                            {interview.ended_at ? new Date(interview.ended_at).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">面接時間</dt>
                          <dd className="text-slate-700">
                            {formatInterviewDuration({
                              durationSeconds: interview.duration_seconds,
                              startedAt: interview.started_at,
                              endedAt: interview.ended_at,
                            }) ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">回答進捗</dt>
                          <dd className="text-slate-700">
                            {formatAnsweredProgress({ answered: interview.answered_questions, total: interview.total_questions })}
                          </dd>
                          {!isAnsweredProgressAvailable({ answered: interview.answered_questions, total: interview.total_questions }) && (
                            <p className="text-[11px] text-slate-400 mt-0.5">回答進捗データ未取得</p>
                          )}
                        </div>
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">終了理由</dt>
                          <dd className="text-slate-700">{endReasonLabel(interview.end_reason)}</dd>
                        </div>
                        <div>
                          <dt className="text-red-600 font-semibold mb-1">利用計上</dt>
                          <dd className="text-slate-700">{interviewBillingLabel(interview.is_billable, isDemoCompany)}</dd>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {applicant?.status === '準備中' && (
            <div className="rounded-2xl bg-gray-50 border-l-4 border-gray-400 p-6 shadow-md shadow-gray-200/50 border border-gray-100">
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 mb-2">この応募者はまだ面接を開始していません</h2>
                  <p className="text-sm text-gray-700">面接が開始され次第、レポートが生成されます。</p>
                </div>
              </div>
            </div>
          )}

          {/* タブバー */}
          <div className="rounded-2xl bg-white/80 border border-slate-200/80 p-1.5 shadow-sm overflow-x-auto">
            <nav className="flex gap-1 min-w-max" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab.key
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

      {/* 履歴書タブ（デジタル履歴書 v1・実データ表示） */}
      {activeTab === 'resume' && (() => {
        const fullName = `${applicant?.last_name || ''} ${applicant?.first_name || ''}`.trim()
        const fullKana = `${applicant?.last_name_kana || ''} ${applicant?.first_name_kana || ''}`.trim()
        const birthJp = formatBirthDate(applicant?.birth_date)
        const address = joinResumeAddress({
          prefecture: applicant?.prefecture, city: applicant?.city, town: applicant?.town,
          address_line: applicant?.address_line, building: applicant?.building,
        })
        const postal = formatPostalCode(applicant?.postal_code)
        const displayAge = resolveDisplayAge(applicant?.birth_date, applicant?.age)
        const hasLegacyEdu = !!(applicant?.education && applicant.education.trim())
        const hasLegacyWork = !!(applicant?.work_history && applicant.work_history.trim())
        const hasLegacyLic = !!(applicant?.qualifications && applicant.qualifications.trim())
        const eduMode = resumeSectionMode(resumeChildStatus, resumeEducations.length, hasLegacyEdu)
        const workMode = resumeSectionMode(resumeChildStatus, resumeWork.length, hasLegacyWork)
        const licMode = resumeSectionMode(resumeChildStatus, resumeLicenses.length, hasLegacyLic)
        return (
        <div className="space-y-6">
          {/* 履歴書ヘッダー（右側は Phase E で「PDF履歴書を出力」を置く余地・今は空） */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">履歴書</h2>
            {/* PDF 出力ボタン設置スロット（Phase E）。VIEWER には export を出さない（RBAC）。 */}
            {can('resume.pdf.download') && (
              <div data-slot="resume-pdf-action" className="flex shrink-0 flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={downloadResumePdf}
                  disabled={resumePdfLoading || !applicant}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  {resumePdfLoading ? 'PDFを生成中…' : '履歴書PDFをダウンロード'}
                </button>
                {resumePdfError && (
                  <span className="text-xs text-red-600">PDFの生成に失敗しました。時間をおいて再度お試しください。</span>
                )}
              </div>
            )}
          </div>

          {/* 1. 基本情報 */}
          <ResumeSectionCard title="基本情報">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              <KV label="氏名" value={fullName} />
              <KV label="フリガナ" value={fullKana} />
              <KV label="生年月日" value={birthJp} />
              <KV label="年齢" value={displayAge != null ? `${displayAge}歳` : ''} />
              <KV label="性別" value={genderLabel(applicant?.gender)} />
              <KV label="電話番号" value={applicant?.phone_number || ''} />
              <KV label="メールアドレス" value={applicant?.email || ''} />
            </dl>
          </ResumeSectionCard>

          {/* 2. 住所 */}
          <ResumeSectionCard title="住所">
            <dl className="grid grid-cols-1 gap-y-2">
              {postal && (
                <div className="min-w-0">
                  <dd className="text-sm text-slate-900">{postal}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dd className="text-sm text-slate-900 whitespace-pre-wrap break-words">{address || '未入力'}</dd>
              </div>
            </dl>
          </ResumeSectionCard>

          {/* 3. 応募情報 */}
          <ResumeSectionCard title="応募情報">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              <KV label="応募職種" value={applicant?.jobs?.title || ''} />
              <KV label="就業形態" value={employmentTypeLabel(applicant?.employment_type)} />
              <KV label="業界経験" value={industryExperienceLabel(applicant?.industry_experience)} />
            </dl>
          </ResumeSectionCard>

          {/* 4. 学歴 */}
          <ResumeSectionCard title="学歴">
            {eduMode === 'loading' && <ResumeMuted text="読み込み中…" />}
            {eduMode === 'error' && <ResumeErrorNotice />}
            {eduMode === 'empty' && <ResumeMuted text="未入力" />}
            {eduMode === 'legacy' && (
              <p className="text-sm text-slate-900">{applicant?.education ? (EDUCATION_LABELS[applicant.education] ?? applicant.education) : '未入力'}</p>
            )}
            {eduMode === 'structured' && (
              <ul className="space-y-4">
                {resumeEducations.map((e, i) => {
                  const period = [formatYearMonth(e.entered_year_month), formatYearMonth(e.graduated_year_month)].filter((x) => x).join(' 〜 ')
                  const status = graduationStatusLabel(e.graduation_status)
                  return (
                    <li key={i} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <p className="text-sm font-semibold text-slate-900 break-words">
                        {[schoolTypeLabel(e.school_type), (e.school_name || '').trim()].filter((x) => x).join('　') || '未入力'}
                      </p>
                      {e.faculty_department && e.faculty_department.trim() && (
                        <p className="mt-1 text-sm text-slate-700 break-words">{e.faculty_department}</p>
                      )}
                      {(period || status) && (
                        <p className="mt-1 text-xs text-slate-500">{period}{status ? `（${status}）` : ''}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </ResumeSectionCard>

          {/* 4. 職歴 */}
          <ResumeSectionCard title="職歴">
            {workMode === 'loading' && <ResumeMuted text="読み込み中…" />}
            {workMode === 'error' && <ResumeErrorNotice />}
            {workMode === 'empty' && <ResumeMuted text="未入力" />}
            {workMode === 'legacy' && (
              <dd className="text-sm text-slate-900 bg-slate-50 rounded-xl p-4 border border-slate-200/80 whitespace-pre-wrap break-words">{applicant?.work_history || '未入力'}</dd>
            )}
            {workMode === 'structured' && (
              <ul className="space-y-4">
                {resumeWork.map((w, i) => {
                  const period = [formatYearMonth(w.joined_year_month), w.is_current ? '現在' : formatYearMonth(w.left_year_month)].filter((x) => x).join(' 〜 ')
                  const sub = [(w.department || '').trim(), (w.position || '').trim(), (w.employment_type || '').trim()].filter((x) => x).join('・')
                  return (
                    <li key={i} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 break-words">{(w.company_name || '').trim() || '未入力'}</p>
                        {w.is_current && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">在職中</span>}
                      </div>
                      {sub && <p className="mt-1 text-sm text-slate-700 break-words">{sub}</p>}
                      {period && <p className="mt-1 text-xs text-slate-500">{period}</p>}
                      {w.description && w.description.trim() && (
                        <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap break-words">{w.description}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </ResumeSectionCard>

          {/* 5. 資格・免許 */}
          <ResumeSectionCard title="資格・免許">
            {licMode === 'loading' && <ResumeMuted text="読み込み中…" />}
            {licMode === 'error' && <ResumeErrorNotice />}
            {licMode === 'empty' && <ResumeMuted text="未入力" />}
            {licMode === 'legacy' && (
              <dd className="text-sm text-slate-900 bg-slate-50 rounded-xl p-4 border border-slate-200/80 whitespace-pre-wrap break-words">{applicant?.qualifications || '未入力'}</dd>
            )}
            {licMode === 'structured' && (
              <ul className="space-y-2">
                {resumeLicenses.map((l, i) => {
                  const acquired = formatYearMonth(l.acquired_year_month)
                  return (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3 text-sm text-slate-900">
                      <span className="font-medium break-words">{(l.name || '').trim() || '未入力'}</span>
                      {acquired && <span className="text-xs text-slate-500">取得: {acquired}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </ResumeSectionCard>

          {/* 6. 志望動機 / 7. 自己PR / 8. 本人希望欄 */}
          <ResumeSectionCard title="志望動機">
            <LongTextBlock value={applicant?.motivation} />
          </ResumeSectionCard>
          <ResumeSectionCard title="自己PR">
            <LongTextBlock value={applicant?.self_pr} />
          </ResumeSectionCard>
          <ResumeSectionCard title="本人希望欄">
            <LongTextBlock value={applicant?.personal_requests} />
          </ResumeSectionCard>
        </div>
        )
      })()}

      {/* タブ1: 概要 */}
      {activeTab === 'summary' && (
        <div className="space-y-8">
          {(applicant?.status === '途中離脱' || applicant?.status === '準備中') ? (
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600 font-medium">面接が完了していないため、AI分析レポートは生成されていません</p>
            </div>
          ) : !interviewResult ? (
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600 font-medium">AI評価レポートはまだ生成されていません</p>
            </div>
          ) : (
            <>
              {/* 人物概要（profile_summary.persona 優先 / 無ければ既存DB項目で代替） */}
              <div className="rounded-2xl bg-blue-50/90 border-l-4 border-blue-500 p-6 sm:p-7 shadow-md shadow-slate-200/50 border border-blue-100/50">
                <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-5">人物概要</h2>
                <div className="space-y-5 text-sm sm:text-base text-slate-700 leading-relaxed">
                  {interviewResult.detail_json?.profile_summary?.persona ? (
                    <section>
                      <p className="font-bold text-slate-800 whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.persona}</p>
                    </section>
                  ) : (
                    interviewResult.summary_text && (
                      <section>
                        <p className="font-semibold text-gray-700 mb-1">人物像・サマリー</p>
                        <p className="font-bold text-slate-800">{interviewResult.summary_text}</p>
                      </section>
                    )
                  )}
                  {interviewResult.feedback_text && (
                    <section>
                      <p className="font-semibold text-gray-700 mb-1.5">講評</p>
                      <p>{interviewResult.feedback_text}</p>
                    </section>
                  )}
                  {!interviewResult.detail_json?.profile_summary?.persona && !interviewResult.summary_text && !interviewResult.feedback_text && (
                    <p className="text-sm text-slate-500">人物概要データはまだありません。</p>
                  )}
                </div>
              </div>

              {/* 経歴要約（profile_summary.career 優先 / 無ければ応募者の職歴・業界経験・学歴で代替） */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">経歴要約</h2>
                {interviewResult.detail_json?.profile_summary?.career ? (
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.career}</p>
                ) : (applicant?.work_history || applicant?.industry_experience || applicant?.education) ? (
                  <dl className="space-y-3">
                    {applicant?.work_history && (
                      <div>
                        <dt className="text-xs font-medium text-slate-500 mb-1">職務経歴</dt>
                        <dd className="text-sm text-slate-800 whitespace-pre-wrap">{applicant.work_history}</dd>
                      </div>
                    )}
                    {applicant?.industry_experience && (
                      <div>
                        <dt className="text-xs font-medium text-slate-500 mb-1">業界経験</dt>
                        <dd className="text-sm text-slate-800">{INDUSTRY_EXP_LABELS[applicant.industry_experience] ?? applicant.industry_experience}</dd>
                      </div>
                    )}
                    {applicant?.education && (
                      <div>
                        <dt className="text-xs font-medium text-slate-500 mb-1">最終学歴</dt>
                        <dd className="text-sm text-slate-800">{EDUCATION_LABELS[applicant.education] ?? applicant.education}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-sm text-slate-500">経歴情報はまだありません。</p>
                )}
              </div>

              {/* 推薦度バッジ */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-start gap-6 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-md shadow-slate-200/50">
                  <span
                    className={`inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl text-4xl font-bold shrink-0 ${GRADE_STYLES[interviewResult.detail_json?.recommendation_rank || ''] || 'bg-slate-100 text-slate-500'}`}
                  >
                    {interviewResult.detail_json?.recommendation_rank || '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">推奨</p>
                    {interviewResult.feedback_text && (
                      <p className="text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">{interviewResult.feedback_text}</p>
                    )}
                    {/* AI面接スコア */}
                    {interviewResult?.total_score != null && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                          <div>
                            <span className="text-sm text-gray-500">AI面接スコア: </span>
                            <span className="text-lg font-semibold text-gray-800">{interviewResult.total_score}</span>
                            <span className="text-sm text-gray-500"> / 100</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <RecommendLegend />
              </div>

              {/* 総合スコア */}
              {interviewResult.total_score != null && (
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-900">総合スコア</span>
                    <span className="text-2xl font-extrabold text-blue-600 tabular-nums">{interviewResult.total_score}<span className="text-sm font-normal text-slate-400"> / 100</span></span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${interviewResult.total_score}%` }} />
                  </div>
                </div>
              )}

              {/* 評価軸スコア（EBCA: Evidence-based Competency Analysis）。score=null は「判断材料不足」＝0点ではない。DUMMY補完なし */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">評価軸スコア</h2>
                {(() => {
                  const hasLegacyEvaluation = !!(interviewResult.personality_type || interviewResult.personality_description)
                  const state = resolveEvaluationDisplayState({ evaluationAxes: interviewResult.evaluation_axes, hasLegacyEvaluation })
                  // Task 8: 状態を同一 empty state にしない（内部エラーコードは出さない）。
                  if (state.kind === 'not_evaluated') {
                    return <p className="text-sm text-slate-500">この面接の評価はまだありません。面接が完了すると評価が表示されます。</p>
                  }
                  if (state.kind === 'legacy_only') {
                    return <p className="text-sm text-slate-500">この応募者には6軸コンピテンシー評価がありません（過去形式の評価のみ）。</p>
                  }
                  if (state.kind === 'malformed') {
                    return <p className="text-sm text-slate-500">評価データを表示できませんでした。再評価が必要な可能性があります。</p>
                  }
                  const axes = sortAxesForDisplay(state.axes)
                  return (
                    <div className="space-y-4">
                      {state.kind === 'all_insufficient' && (
                        <div role="status" className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800">
                          今回の面接では、いずれの軸も判定に十分な発言が得られませんでした（判断材料不足）。
                        </div>
                      )}
                      {state.kind === 'partial' && (
                        <div role="status" className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600">
                          一部の軸は判定に十分な発言が得られませんでした（判断材料不足）。点数のある軸のみ評価が確定しています。
                        </div>
                      )}
                      {axes.map((d: DisplayAxis, i: number) => (
                        <div key={i} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                          <div className="flex justify-between items-baseline gap-3 mb-1.5">
                            <span className="text-sm font-medium text-slate-800">{d.label}</span>
                            {d.score != null ? (
                              <span className="text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                {d.score}<span className="text-xs font-normal text-slate-400"> / 20</span>
                                {d.rank && <span className="ml-2 text-xs font-semibold text-blue-600">{d.rank}</span>}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 whitespace-nowrap">
                                <span aria-hidden>—</span>判断材料不足
                              </span>
                            )}
                          </div>
                          {d.score != null && (
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5" role="presentation">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(Math.max(0, Math.min(20, d.score)) / 20) * 100}%` }} />
                            </div>
                          )}
                          {d.confidence && (
                            <p className="text-xs text-slate-500 mb-1">{CONFIDENCE_DISPLAY_LABEL}: {confidenceText(d.confidence)}</p>
                          )}
                          {d.score == null && d.insufficientReason && (
                            <p className="text-xs text-amber-700/80 mb-1 break-words">{d.insufficientReason}</p>
                          )}
                          {d.evidence.length > 0 && (
                            <ul className="mt-1.5 space-y-1.5">
                              {d.evidence.map((e, j) => (
                                <li key={j} className="text-xs text-slate-600 leading-relaxed border-l-2 border-slate-300 pl-2.5 break-words">
                                  {e.seq != null && (
                                    <span className="inline-block mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 align-middle">
                                      発話 #{e.seq}
                                    </span>
                                  )}
                                  <span className="align-middle">「{e.quote}」</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                      <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                        各軸は0〜20点。「判断材料不足」は点数化できるだけの発言が得られなかった軸で、0点ではありません。{CONFIDENCE_HINT}根拠は面接での実際の発言に基づきます（会話ログは「会話ログ」タブで確認できます）。
                      </p>
                    </div>
                  )
                })()}
              </div>

              {/* パーソナリティタイプ（旧レポートタブから統合） */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">パーソナリティタイプ</h2>
                {interviewResult.personality_type && <p className="text-lg font-bold text-slate-900 mb-3 tracking-tight">{interviewResult.personality_type}</p>}
                {interviewResult.personality_description && <p className="text-sm text-slate-600 leading-relaxed">{interviewResult.personality_description}</p>}
                {!interviewResult.personality_type && !interviewResult.personality_description && (
                  <p className="text-sm text-slate-500">パーソナリティデータはまだありません。</p>
                )}
              </div>

              {/* 強み */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">強み</h2>
                <ul className="space-y-5">
                  {(Array.isArray(interviewResult.strengths) ? interviewResult.strengths : []).map((s: string, i: number) => (
                    <li key={i} className="pl-4 border-l-2 border-emerald-200">
                      <p className="text-sm text-slate-700 leading-relaxed">{s}</p>
                    </li>
                  ))}
                  {(!Array.isArray(interviewResult.strengths) || interviewResult.strengths.length === 0) && (
                    <li className="text-sm text-slate-500">強みデータはまだありません。</li>
                  )}
                </ul>
              </div>

              {/* 懸念点・追加確認ポイント（改善点 ＋ EBCAの判断材料不足軸を統合） */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">懸念点・追加確認ポイント</h2>
                <p className="text-xs text-slate-500 mb-4">応募者には見せない企業専用の情報</p>
                <ul className="space-y-5">
                  {(Array.isArray(interviewResult.improvement_points) ? interviewResult.improvement_points : []).map((w: string, i: number) => (
                    <li key={i} className="pl-4 border-l-2 border-amber-200">
                      <p className="text-sm text-slate-700 leading-relaxed">{w}</p>
                    </li>
                  ))}
                </ul>
                {(() => {
                  // EBCA で判断材料不足（score=null）の軸を「次回面接で確認すべき点」として提示
                  const insufficient = normalizeEvaluationAxesForDisplay(interviewResult.evaluation_axes).filter((a) => a.score == null)
                  if (insufficient.length === 0) return null
                  return (
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <p className="text-xs font-semibold text-amber-700 mb-2">判断材料不足・次回確認ポイント</p>
                      <ul className="space-y-2">
                        {insufficient.map((a, i) => (
                          <li key={i} className="pl-4 border-l-2 border-amber-300">
                            <p className="text-sm text-slate-700 leading-relaxed">
                              <span className="font-medium">{a.label}</span>
                              {a.insufficientReason ? `：${a.insufficientReason}` : '：判断材料が不足しています'}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })()}
                {(!Array.isArray(interviewResult.improvement_points) || interviewResult.improvement_points.length === 0) &&
                  normalizeEvaluationAxesForDisplay(interviewResult.evaluation_axes).filter((a) => a.score == null).length === 0 && (
                    <p className="text-sm text-slate-500">懸念点・追加確認データはまだありません。</p>
                  )}
              </div>

              {/* 面接官向けメモ（profile_summary.interviewer_notes があれば表示） */}
              {interviewResult.detail_json?.profile_summary?.interviewer_notes && (
                <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">面接官向けメモ</h2>
                  <p className="text-xs text-slate-500 mb-4">採用判断で特に見るべきポイント</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{interviewResult.detail_json.profile_summary.interviewer_notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* タブ2: 詳細評価 */}
      {activeTab === 'detail' && (
        <div className="space-y-6">
          {(applicant?.status === '途中離脱' || applicant?.status === '準備中') ? (
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600 font-medium">面接が完了していないため、詳細評価は生成されていません</p>
            </div>
          ) : (
            <>
              {/* セクション1: AI面接評価 */}
              <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 overflow-hidden">
                <div className="p-6 sm:p-7">
                  <h3 className="text-base font-bold text-slate-900 mb-6">AI面接評価</h3>
                  
                  {/* 総合スコア */}
                  {interviewResult?.total_score != null && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-1">総合スコア</p>
                      <p className="text-3xl font-bold text-slate-900">
                        {interviewResult.total_score}<span className="text-lg font-normal text-slate-400"> / 100</span>
                      </p>
                    </div>
                  )}

                  {/* 推薦度 */}
                  {interviewResult?.detail_json?.recommendation_rank && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-1">推薦度</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {interviewResult.detail_json.recommendation_rank}
                      </p>
                    </div>
                  )}

                  {/* 性格タイプ */}
                  {interviewResult?.personality_type && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">性格タイプ</p>
                      <span className="inline-block px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full">
                        {interviewResult.personality_type}
                      </span>
                    </div>
                  )}

                  {/* 性格説明 */}
                  {interviewResult?.personality_description && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-1">性格説明</p>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {interviewResult.personality_description}
                      </p>
                    </div>
                  )}

                  {/* 強み */}
                  {interviewResult?.strengths && Array.isArray(interviewResult.strengths) && interviewResult.strengths.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">強み</p>
                      <ul className="list-disc list-inside space-y-1">
                        {interviewResult.strengths.map((s: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-700">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 改善点 */}
                  {interviewResult?.improvement_points && Array.isArray(interviewResult.improvement_points) && interviewResult.improvement_points.length > 0 && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">改善点</p>
                      <ul className="list-disc list-inside space-y-1">
                        {interviewResult.improvement_points.map((p: string, idx: number) => (
                          <li key={idx} className="text-sm text-slate-700">{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 総合所見 */}
                  {interviewResult?.summary_text && (
                    <div className="mb-6">
                      <p className="text-sm text-slate-500 mb-2">総合所見</p>
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                        <p className="text-sm text-slate-700 leading-relaxed">{interviewResult.summary_text}</p>
                      </div>
                    </div>
                  )}

                  {/* フィードバック */}
                  {interviewResult?.feedback_text && (
                    <div>
                      <p className="text-sm text-slate-500 mb-2">フィードバック</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{interviewResult.feedback_text}</p>
                    </div>
                  )}

                  {/* データがない場合のフォールバック */}
                  {!interviewResult?.total_score && !interviewResult?.detail_json?.recommendation_rank && !interviewResult?.personality_type && (
                    <p className="text-sm text-slate-400">AI面接評価データがありません</p>
                  )}
                </div>
              </div>

            </>
          )}
        </div>
      )}

      {/* タブ3: 会話ログ（P3: 実 interview_transcripts を RLS 経由で表示。4状態を区別） */}
      {activeTab === 'conversation' && (
        <div className="space-y-6">
          {applicant?.status === '準備中' && !interview ? (
            // 面接前（interview 無し）は準備中メッセージ（会話ログ取得の前段）
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600">回答ログはありません</p>
              <p className="text-sm text-slate-500 mt-2">面接が開始され次第、回答ログが表示されます。</p>
            </div>
          ) : (
            <TranscriptLog
              status={transcriptState.status}
              items={transcriptState.items}
              loading={transcriptLoading}
            />
          )}
        </div>
      )}

      {/* タブ4: 録画再生 */}
      {activeTab === 'recording' && (
        <div className="space-y-6">
          {applicant?.status === '準備中' ? (
            // 準備中時はメッセージ表示
            <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
              <p className="text-slate-600">録画データはありません</p>
              <p className="text-sm text-slate-500 mt-2">面接が開始され次第、録画データが表示されます。</p>
            </div>
          ) : (
            <>
              {/* 将来: Cloudflare R2 の録画URL（interview.recording_url）が入ったら再生プレーヤーを実装する。
                  実データが無い間はダミー表示せず「録画データはありません」を出す（fake data fallback 廃止）。 */}
              <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center">
                <p className="text-slate-600">録画データはありません</p>
                <p className="text-sm text-slate-500 mt-2">
                  {applicant?.status === '途中離脱'
                    ? '面接が途中で終了したため、録画データが保存されていません。'
                    : '録画データが保存されていません。'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* タブ5: 共有 */}
      {activeTab === 'share' && (
        <div className="space-y-6">
          {/* VIEWER は共有/エクスポート操作を持たない（閲覧のみ）。RBAC でカードを非表示にする。 */}
          {!can('applicant_report.pdf.download') && !can('applicant_report.email_share') && !can('share_link.manage') && (
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
              <p className="text-sm text-slate-500">この応募者は閲覧のみ可能です。レポートの共有・エクスポートには権限が必要です。</p>
            </div>
          )}
          {/* レポートPDFダウンロード */}
          {can('applicant_report.pdf.download') && (
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">応募者総合レポート</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              履歴書情報とAI面接評価をまとめたPDFをダウンロードできます。社内共有や印刷用にご利用ください。
            </p>
            <button
              type="button"
              onClick={downloadReportPdf}
              disabled={!interviewResult || reportPdfLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              {reportPdfLoading ? 'PDFを生成中…' : '総合レポートをダウンロード'}
            </button>
            {!interviewResult && (
              <p className="mt-3 text-sm text-slate-500">
                AI評価の生成後にダウンロードできます。履歴書のみは「履歴書」タブからダウンロードできます。
              </p>
            )}
            {reportPdfError && (
              <p className="mt-3 text-sm text-red-600">PDFの生成に失敗しました。時間をおいて再度お試しください。</p>
            )}
          </div>
          )}

          {/* メール送信フォーム */}
          {can('applicant_report.email_share') && (
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">メールで共有</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              応募者総合レポートPDFをメールに添付して送信します。
            </p>
            <div className="space-y-4 max-w-lg">
              <div>
                <label htmlFor="share-email" className="block text-sm font-medium text-slate-700 mb-1">送信先メールアドレス</label>
                <input
                  id="share-email"
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="example@company.com"
                  className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                />
              </div>
              <div>
                <label htmlFor="share-message" className="block text-sm font-medium text-slate-700 mb-1">メッセージ（任意）</label>
                <textarea
                  id="share-message"
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  rows={3}
                  placeholder="補足メッセージを入力..."
                  className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all resize-none"
                />
              </div>
              <button
                type="button"
                onClick={sendShareEmail}
                disabled={!interviewResult || shareSending}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Mail className="w-4 h-4" />
                {shareSending ? '送信中…' : '送信する'}
              </button>
              {!interviewResult && (
                <p className="text-sm text-slate-500">AI評価の生成後に共有できます。</p>
              )}
              {shareError && <p className="text-sm text-red-600">{shareError}</p>}
              {shareSuccess && <p className="text-sm text-emerald-600">メールを送信しました。</p>}
            </div>
          </div>
          )}

          {/* 共有リンク生成 */}
          {can('share_link.manage') && (
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">共有リンク</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              閲覧専用の共有リンクを生成します。リンクは7日間有効です。
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
              <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 overflow-hidden">
                <LinkIcon className="w-4 h-4 shrink-0 text-slate-400" />
                <span className="truncate">https://ai-jinji-24h.vercel.app/share/report/{id}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  // TODO: Phase 4 共有リンク生成APIを実装
                  navigator.clipboard.writeText(`https://ai-jinji-24h.vercel.app/share/report/${id}`)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                  setToast('リンクをコピーしました')
                  setTimeout(() => setToast(''), 2500)
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-900 transition-colors shrink-0"
              >
                {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {linkCopied ? 'コピー済み' : 'リンクをコピー'}
              </button>
            </div>
          </div>
          )}
        </div>
      )}
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

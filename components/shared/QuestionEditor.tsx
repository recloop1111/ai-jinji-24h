'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, FileText, Check, ChevronUp, ChevronDown, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const CURRENT_COMPANY_ID = '7a58cc1b-9f81-4da5-ae2c-fd3abea05c33'

type Question = {
  id: string
  question: string
}

type CommonQuestionItem = { id: string; label: string; category: string; question: string }

const DEFAULT_COMMON_QUESTIONS: { icebreakers: CommonQuestionItem[]; closing: CommonQuestionItem[] } = {
  icebreakers: [
    { id: 'ice-1', label: '冒頭1', category: 'アイスブレイク', question: '本日はお時間をいただきありがとうございます。これから約30〜40分の面接を行います。途中で聞き取りにくい点があれば遠慮なくお知らせください。本日の体調は問題ありませんか？' },
    { id: 'ice-2', label: '冒頭2', category: 'アイスブレイク', question: 'ありがとうございます。面接を始める前に、最近あった嬉しかったことや、ちょっとした楽しみにしていることがあれば気軽に教えてください。' },
  ],
  closing: [
    { id: 'close-1', label: 'クロージング', category: 'クロージング', question: '面接は以上となります。最後に、何かご質問や伝えておきたいことはありますか？本日はお忙しい中、ありがとうございました。' },
  ],
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  fulltime: '正社員',
  contract: '契約社員',
  temporary: '派遣社員',
  parttime: 'パート・アルバイト',
  freelance: '業務委託',
  intern: 'インターン',
  other: 'その他',
}

function getPatternTabs(employmentType: string): { label: string; patternKey: string }[] {
  const prefix = employmentType || 'other'
  switch (prefix) {
    case 'fulltime':
      return [
        { label: '新卒', patternKey: 'fulltime-new-graduate' },
        { label: '中途（経験者）', patternKey: 'fulltime-mid-career-experienced' },
        { label: '中途（未経験）', patternKey: 'fulltime-mid-career-inexperienced' },
      ]
    case 'parttime':
      return [
        { label: '経験者', patternKey: 'parttime-experienced' },
        { label: '未経験', patternKey: 'parttime-inexperienced' },
      ]
    case 'contract':
      return [
        { label: '新卒', patternKey: 'contract-new-graduate' },
        { label: '中途（経験者）', patternKey: 'contract-mid-career-experienced' },
        { label: '中途（未経験）', patternKey: 'contract-mid-career-inexperienced' },
      ]
    case 'temporary':
      return [
        { label: '新卒', patternKey: 'temporary-new-graduate' },
        { label: '中途（経験者）', patternKey: 'temporary-mid-career-experienced' },
        { label: '中途（未経験）', patternKey: 'temporary-mid-career-inexperienced' },
      ]
    case 'freelance':
      return [
        { label: '経験者', patternKey: 'freelance-experienced' },
        { label: '未経験', patternKey: 'freelance-inexperienced' },
      ]
    case 'intern':
      return [
        { label: '経験者', patternKey: 'intern-experienced' },
        { label: '未経験', patternKey: 'intern-inexperienced' },
      ]
    case 'other':
    default:
      return [
        { label: '経験者', patternKey: 'other-experienced' },
        { label: '未経験', patternKey: 'other-inexperienced' },
      ]
  }
}

type Job = {
  id: string
  title: string
  employment_type: string
  employmentTypeLabel: string
}

const JOB_TYPES = ['営業', '事務', '経理・財務', '人事・総務', '企画・マーケティング', 'エンジニア・技術職', 'デザイナー', '販売・接客', '製造・工場', '物流・配送', '医療・介護', '教育・講師', '飲食・調理', '建設・施工管理', 'カスタマーサポート', 'その他'] as const
type JobTypeKey = (typeof JOB_TYPES)[number]

const JOB_TYPE_TEMPLATES: Record<JobTypeKey, { name: string; questions: string[] }> = {
  '営業': { name: '営業', questions: ['これまでの営業経験について教えてください。どのような商材を扱い、どのような成果を上げましたか？', '目標を達成できなかった経験はありますか？その時どのように対処しましたか？', 'お客様との信頼関係を構築するために、普段どのようなことを心がけていますか？', 'チームで営業に取り組んだ経験があれば教えてください。あなたの役割は何でしたか？', '新規開拓で工夫していることを教えてください。'] },
  '事務': { name: '事務', questions: ['これまでの事務経験について教えてください。', 'パソコンの基本操作（Word、Excel）はどの程度できますか？', '電話対応や来客対応の経験はありますか？', '複数の業務を同時にお願いすることもありますが、優先順位をつけて作業するのは得意ですか？', '書類作成やデータ入力で心がけていることを教えてください。'] },
  '経理・財務': { name: '経理・財務', questions: ['経理・財務の業務経験について教えてください。', '会計ソフトや経理システムの使用経験はありますか？', '月次決算や年次決算の業務経験があれば教えてください。', '数字の正確性を保つために、どのような工夫をしていますか？', '税務や法規制の知識について、どの程度理解していますか？'] },
  '人事・総務': { name: '人事・総務', questions: ['人事・総務の業務経験について教えてください。', '採用活動や面接の経験はありますか？', '社内規程の作成や管理の経験があれば教えてください。', '従業員からの相談や問い合わせ対応で心がけていることを教えてください。', '労務管理や給与計算の経験はありますか？'] },
  '企画・マーケティング': { name: '企画・マーケティング', questions: ['これまでの企画・マーケティング経験について教えてください。', 'キャンペーンやプロモーションの企画・実行経験があれば教えてください。', '市場調査や競合分析でどのようなことを行ってきましたか？', 'データを分析して施策を改善した経験を教えてください。', 'クリエイティブな発想をどのように生み出していますか？'] },
  'エンジニア・技術職': { name: 'エンジニア・技術職', questions: ['プログラミングを始めたきっかけと、これまでに学んだ言語やフレームワークを教えてください。', 'これまでの開発経験や、取り組んできたプロジェクトを教えてください。', 'チームで開発した経験はありますか？その中であなたはどのような役割を担いましたか？', '技術的に難しい課題に直面した時、どのように解決しましたか？', '新しい技術をどのように習得していますか？'] },
  'デザイナー': { name: 'デザイナー', questions: ['デザインを始めたきっかけと、これまでに取り組んできた作品について教えてください。', '使用しているデザインツールやソフトウェアを教えてください。', 'クライアントの要望をデザインに落とし込む際のプロセスを教えてください。', 'デザインのトレンドをどのようにキャッチアップしていますか？', 'ポートフォリオの中で最も力を入れた作品と、その理由を教えてください。'] },
  '販売・接客': { name: '販売・接客', questions: ['これまでの販売・接客経験について教えてください。', 'お客様に商品を勧める際に心がけていることは何ですか？', '接客中に困った経験と、その時の対応を教えてください。', '売上目標に向けてどのように取り組んでいますか？', 'お客様に満足いただくために工夫していることを教えてください。'] },
  '製造・工場': { name: '製造・工場', questions: ['製造業での業務経験について教えてください。', '品質管理で心がけていることを教えてください。', '安全対策で特に気をつけていることを教えてください。', '生産ラインで改善した経験があれば教えてください。', 'チームで目標達成に向けて取り組んだ経験を教えてください。'] },
  '物流・配送': { name: '物流・配送', questions: ['物流・配送の業務経験について教えてください。', '荷物の積み下ろしや配達ルートで効率化した経験はありますか？', '配達中のトラブルや遅延が発生した時、どのように対応しますか？', '安全運転や事故防止で心がけていることを教えてください。', '体力的にきついと感じる場面はありますか。どのように乗り越えていますか？'] },
  '医療・介護': { name: '医療・介護', questions: ['医療・介護の仕事を志した理由を教えてください。', '利用者様や患者様との信頼関係をどのように築いていますか？', '体力的・精神的な負担がある中で、どのようにセルフケアをしていますか？', 'チーム医療・多職種連携で大切にしていることを教えてください。', '今後この仕事で実現したいことはありますか？'] },
  '教育・講師': { name: '教育・講師', questions: ['教育の仕事を志した理由を教えてください。', '生徒や保護者とのコミュニケーションで心がけていることは何ですか？', '授業や指導で工夫していることを教えてください。', '生徒が理解できない時のフォロー方法を教えてください。', '自分自身の学びや研鑽で続けていることはありますか？'] },
  '飲食・調理': { name: '飲食・調理', questions: ['飲食業で働いてみようと思ったきっかけを教えてください。', '忙しい時間帯での接客で心がけていることを教えてください。', '食品の衛生管理で意識している点はありますか？', 'クレーム対応で工夫していることがあれば教えてください。', 'チームで働く上で大切にしていることを教えてください。'] },
  '建設・施工管理': { name: '建設・施工管理', questions: ['建設業・不動産業に興味を持ったきっかけを教えてください。', '安全対策で特に気をつけていることを教えてください。', '現場でのトラブル発生時、どのように対応しますか？', '図面や仕様書の読み方について、これまでの経験を教えてください。', '3年後、5年後にどのようなスキルを身につけたいですか？'] },
  'カスタマーサポート': { name: 'カスタマーサポート', questions: ['これまでの顧客対応経験を教えてください。', 'クレーム対応で心がけていることを教えてください。', '難しい要望にどう対応しますか？', 'チームでの情報共有で工夫していることを教えてください。', 'ストレス管理の方法を教えてください。'] },
  'その他': { name: 'その他', questions: ['これまでのご経歴を簡単に教えてください。', '志望動機を教えてください。', 'あなたの強みと弱みを教えてください。', 'チームで働いた経験を教えてください。', '5年後のキャリアプランを教えてください。'] },
}

type QuestionEditorProps = {
  companyId: string
  theme: 'light' | 'dark'
  onNavigateToJobs?: () => void
}

export default function QuestionEditor({ companyId, theme, onNavigateToJobs }: QuestionEditorProps) {
  const searchParams = useSearchParams()
  const initialJobId = searchParams.get('jobId')
  const supabase = createClient()
  const resolvedCompanyId = companyId === 'current' ? CURRENT_COMPANY_ID : companyId

  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [patternTabs, setPatternTabs] = useState<{ label: string; patternKey: string }[]>([])
  const [activePattern, setActivePattern] = useState<string>('')
  const [patternQuestions, setPatternQuestions] = useState<Question[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [commonQuestionsIcebreak, setCommonQuestionsIcebreak] = useState<CommonQuestionItem[]>(DEFAULT_COMMON_QUESTIONS.icebreakers.map((x) => ({ ...x })))
  const [commonQuestionsClosing, setCommonQuestionsClosing] = useState<CommonQuestionItem[]>(DEFAULT_COMMON_QUESTIONS.closing.map((x) => ({ ...x })))
  const [editingCommonId, setEditingCommonId] = useState<string | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [selectedTemplateQuestionIds, setSelectedTemplateQuestionIds] = useState<Set<number>>(new Set())
  const [insertAt, setInsertAt] = useState(0)
  const [toast, setToast] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isDark = theme === 'dark'

  const cn = {
    title: isDark ? 'text-white' : 'text-slate-900',
    subtext: isDark ? 'text-gray-400' : 'text-slate-500',
    card: isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-slate-50 border-slate-200',
    innerCard: isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-white border-slate-200',
    btnTemplate: isDark ? 'bg-white/[0.05] hover:bg-white/[0.08] border-white/[0.08] text-gray-400 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50',
    btnAdd: isDark ? 'bg-white/[0.03] border-dashed border-white/[0.08] text-gray-400 hover:bg-white/[0.05] hover:border-white/15' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300',
    btnSave: isDark ? 'from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-500' : 'bg-blue-600 hover:bg-blue-700',
    input: isDark ? 'bg-white/[0.05] border-white/[0.08] text-white placeholder-gray-500 focus:ring-blue-500/30' : 'border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:ring-blue-500/30',
    label: isDark ? 'text-gray-500' : 'text-slate-500',
    select: isDark ? 'bg-white/[0.05] border-white/[0.08] text-white focus:ring-blue-500/50' : 'border-slate-200 text-slate-900 bg-white focus:ring-blue-500',
    modal: isDark ? 'bg-gray-900 border-white/10' : 'bg-white',
    modalText: isDark ? 'text-gray-400' : 'text-slate-600',
    modalStrong: isDark ? 'text-white' : 'text-slate-900',
    emptyCard: isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-white border-slate-200',
    linkBtn: isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700',
    tabActive: isDark ? 'border-blue-500 text-blue-400' : 'border-blue-500 text-blue-600',
    tabInactive: isDark ? 'border-transparent text-gray-500 hover:text-gray-300' : 'border-transparent text-gray-500 hover:text-gray-700',
  }

  useEffect(() => {
    if (!resolvedCompanyId) {
      setJobsLoading(false)
      return
    }
    async function fetchJobs() {
      setJobsLoading(true)
      try {
        const { data, error } = await supabase
          .from('jobs')
          .select('*')
          .eq('company_id', resolvedCompanyId)
          .eq('is_active', true)
          .order('created_at')

        if (error) throw error
        if (data && data.length > 0) {
          const mapped = data.map((j: { id: string; title: string; employment_type: string; description?: string }) => ({
            id: j.id,
            title: j.title || '',
            employment_type: j.employment_type || '',
            employmentTypeLabel: j.employment_type === 'other' && j.description ? j.description : (EMPLOYMENT_TYPE_LABELS[j.employment_type] ?? j.employment_type),
          }))
          setJobs(mapped)
          if (initialJobId && data.some((d: { id: string }) => d.id === initialJobId)) {
            setSelectedJobId(initialJobId)
            const job = mapped.find((j: Job) => j.id === initialJobId)
            if (job) setSelectedJob(job)
          }
        } else {
          setJobs([])
        }
      } catch (err) {
        console.error('求人取得エラー:', err)
        setJobs([])
      } finally {
        setJobsLoading(false)
      }
    }
    fetchJobs()
  }, [resolvedCompanyId, initialJobId, supabase])

  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find((j) => j.id === selectedJobId) || null
      setSelectedJob(job)
      if (job) {
        const tabs = getPatternTabs(job.employment_type)
        setPatternTabs(tabs)
        setActivePattern(tabs[0]?.patternKey || '')
      } else {
        setPatternTabs([])
        setActivePattern('')
      }
    } else {
      setSelectedJob(null)
      setPatternTabs([])
      setActivePattern('')
      setPatternQuestions([])
    }
  }, [selectedJobId, jobs])

  useEffect(() => {
    async function fetchCommonQuestions() {
      try {
        const { data, error } = await supabase.from('common_questions').select('*').order('category').order('sort_order')
        if (error || !data || data.length === 0) return
        const ice = data.filter((r: { category: string }) => r.category === 'icebreakers').map((r: { id: string; label?: string; question?: string; question_text?: string }) => ({
          id: r.id,
          label: r.label || 'アイスブレイク',
          category: 'アイスブレイク',
          question: r.question ?? r.question_text ?? '',
        }))
        const close = data.filter((r: { category: string }) => r.category === 'closing').map((r: { id: string; label?: string; question?: string; question_text?: string }) => ({
          id: r.id,
          label: r.label || 'クロージング',
          category: 'クロージング',
          question: r.question ?? r.question_text ?? '',
        }))
        if (ice.length > 0) setCommonQuestionsIcebreak(ice)
        if (close.length > 0) setCommonQuestionsClosing(close)
      } catch {
        // デフォルトのまま
      }
    }
    fetchCommonQuestions()
  }, [supabase])

  useEffect(() => {
    if (!selectedJobId || !activePattern) {
      setPatternQuestions([])
      return
    }
    async function fetchJobQuestions() {
      setQuestionsLoading(true)
      try {
        const { data, error } = await supabase
          .from('job_questions')
          .select('*')
          .eq('job_id', selectedJobId)
          .eq('pattern_key', activePattern)
          .order('sort_order', { ascending: true })

        if (error) throw error
        if (data && data.length > 0) {
          setPatternQuestions(
            data.map((r: { id: string; question?: string; question_text?: string }) => ({
              id: r.id,
              question: r.question ?? r.question_text ?? '',
            }))
          )
        } else {
          setPatternQuestions([])
        }
      } catch (err) {
        console.error('質問取得エラー:', err)
        setPatternQuestions([])
      } finally {
        setQuestionsLoading(false)
      }
    }
    fetchJobQuestions()
  }, [selectedJobId, activePattern, supabase])

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }

  const handleCommonQuestionChange = (id: string, value: string, type: 'icebreakers' | 'closing') => {
    if (type === 'icebreakers') {
      setCommonQuestionsIcebreak((prev) => {
        const idx = prev.findIndex((x) => x.id === id)
        if (idx < 0) return prev
        return prev.map((item, i) => (i === idx ? { ...item, question: value } : item))
      })
    } else {
      setCommonQuestionsClosing((prev) => {
        const idx = prev.findIndex((x) => x.id === id)
        if (idx < 0) return prev
        return prev.map((item, i) => (i === idx ? { ...item, question: value } : item))
      })
    }
  }

  const handleAddQuestion = () => {
    if (!selectedJobId) return
    const newQuestion: Question = { id: `temp-${Date.now()}`, question: '' }
    setPatternQuestions((prev) => [...prev, newQuestion])
  }

  const handleDeleteQuestion = (id: string) => {
    if (!selectedJobId) return
    setPatternQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  const handleQuestionChange = (id: string, value: string) => {
    setPatternQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, question: value } : q)))
  }

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= patternQuestions.length) return
    const next = [...patternQuestions]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    setPatternQuestions(next)
  }

  const openTemplateModal = () => {
    if (!selectedJob) return
    setTemplateModalOpen(true)
    setSelectedTemplateQuestionIds(new Set())
    setInsertAt(0)
  }

  const toggleTemplateQuestion = (idx: number) => {
    setSelectedTemplateQuestionIds((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleAddSelectedQuestions = () => {
    if (!selectedJob) return
    const templateKey = JOB_TYPES.includes(selectedJob.title as JobTypeKey) ? (selectedJob.title as JobTypeKey) : 'その他'
    const template = JOB_TYPE_TEMPLATES[templateKey]
    const toAdd = template.questions.filter((_, i) => selectedTemplateQuestionIds.has(i))
    if (toAdd.length === 0) return
    const insertIdx = Math.min(Math.max(0, insertAt), patternQuestions.length)
    const newQs: Question[] = toAdd.map((q, i) => ({ id: `temp-${Date.now()}-${i}`, question: q }))
    setPatternQuestions((prev) => [...prev.slice(0, insertIdx), ...newQs, ...prev.slice(insertIdx)])
    setTemplateModalOpen(false)
    setSelectedTemplateQuestionIds(new Set())
    showToast(`${toAdd.length}件の質問を追加しました`)
  }

  const handleReplaceAllWithTemplate = () => {
    if (!selectedJob) return
    if (!window.confirm('現在の質問を全てテンプレートに置き換えますか？')) return
    const templateKey = JOB_TYPES.includes(selectedJob.title as JobTypeKey) ? (selectedJob.title as JobTypeKey) : 'その他'
    const template = JOB_TYPE_TEMPLATES[templateKey]
    const newQuestions: Question[] = template.questions.map((q, i) => ({ id: `temp-${Date.now()}-${i}`, question: q }))
    setPatternQuestions(newQuestions)
    setTemplateModalOpen(false)
    setSelectedTemplateQuestionIds(new Set())
    showToast(`${template.name}テンプレートで全て置き換えました`)
  }

  const handleSaveQuestions = async () => {
    if (!selectedJobId || !activePattern) return
    setIsLoading(true)
    try {
      const { data: existing } = await supabase
        .from('job_questions')
        .select('id')
        .eq('job_id', selectedJobId)
        .eq('pattern_key', activePattern)

      const existingIds = new Set((existing || []).map((r: { id: string }) => r.id))
      const currentRealIds = patternQuestions.filter((q) => !q.id.startsWith('temp-')).map((q) => q.id)
      const toDeleteIds = [...existingIds].filter((id) => !currentRealIds.includes(id))

      for (const id of toDeleteIds) {
        await supabase.from('job_questions').delete().eq('id', id)
      }

      for (let i = 0; i < patternQuestions.length; i++) {
        const q = patternQuestions[i]
        if (q.id.startsWith('temp-')) {
          await supabase.from('job_questions').insert({
            job_id: selectedJobId,
            pattern_key: activePattern,
            question_text: q.question,
            sort_order: i,
          })
        } else {
          await supabase
            .from('job_questions')
            .update({ question_text: q.question, sort_order: i })
            .eq('id', q.id)
        }
      }

      showToast('質問を保存しました')
    } catch (err) {
      console.error('質問保存エラー:', err)
      showToast('質問の保存に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  const JobsLink = () => {
    if (onNavigateToJobs) {
      return (
        <button type="button" onClick={onNavigateToJobs} className={`inline-flex items-center gap-2 px-4 py-2 ${cn.linkBtn} text-white text-sm font-medium rounded-xl transition-colors`}>
          求人管理へ
        </button>
      )
    }
    return (
      <Link href="/client/jobs" className={`inline-flex items-center gap-2 px-4 py-2 ${cn.linkBtn} text-white text-sm font-medium rounded-xl transition-colors`}>
        求人管理へ
      </Link>
    )
  }

  if (jobsLoading) {
    return (
      <div className="min-w-0 max-w-[100vw] pb-10 flex items-center justify-center py-16">
        <svg className={`animate-spin h-10 w-10 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10">
      <div className="flex flex-col gap-4 mb-6">
        <h1 className={`text-2xl font-bold ${cn.title}`}>面接質問設定</h1>
        <p className={`text-sm ${cn.subtext}`}>求人ごとに面接で使用する質問を設定できます。</p>
      </div>

      <div className="mb-6">
        <label className={`block text-sm font-medium mb-2 ${cn.label}`}>求人を選択</label>
        {jobs.length === 0 ? (
          <div className={`rounded-xl border p-6 text-center ${cn.emptyCard}`}>
            <p className={`mb-4 ${cn.subtext}`}>募集中の求人がありません。先に求人管理で求人を作成し、募集を開始してください。</p>
            <JobsLink />
          </div>
        ) : (
          <select
            value={selectedJobId}
            onChange={(e) => {
              const id = e.target.value
              setSelectedJobId(id)
              const job = jobs.find((j) => j.id === id) || null
              setSelectedJob(job)
              if (job) {
                const tabs = getPatternTabs(job.employment_type)
                setPatternTabs(tabs)
                setActivePattern(tabs[0]?.patternKey || '')
              }
            }}
            className={`w-full md:w-auto min-w-[300px] px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:border-transparent outline-none ${cn.select}`}
          >
            <option value="">求人を選択してください</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title} × {job.employmentTypeLabel}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedJobId && selectedJob ? (
        <>
          <div className={`mb-8 rounded-xl border p-6 ${cn.card}`}>
            <h2 className={`text-base font-semibold mb-2 ${cn.title}`}>共通質問（アイスブレイク）</h2>
            <p className={`text-sm mb-4 ${cn.subtext}`}>すべての面接で冒頭に自動挿入されます。</p>
            <div className="space-y-4">
              {commonQuestionsIcebreak.map((cq) => (
                <div key={cq.id} className={`rounded-xl border p-4 ${cn.innerCard}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className={`text-xs font-semibold ${cn.label}`}>{cq.label}（{cq.category}）</p>
                    {editingCommonId === cq.id ? (
                      <button type="button" onClick={() => setEditingCommonId(null)} className={`text-xs font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>保存</button>
                    ) : (
                      <button type="button" onClick={() => setEditingCommonId(cq.id)} className={`inline-flex items-center gap-1 text-xs ${cn.subtext} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`}>
                        <Pencil className="w-3 h-3" />編集
                      </button>
                    )}
                  </div>
                  {editingCommonId === cq.id ? (
                    <textarea value={cq.question} onChange={(e) => handleCommonQuestionChange(cq.id, e.target.value, 'icebreakers')} rows={3} className={`w-full px-4 py-2.5 border rounded-xl text-sm resize-none focus:ring-2 focus:outline-none ${cn.input}`} onBlur={() => setEditingCommonId(null)} />
                  ) : (
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-slate-800'}`}>{cq.question}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={`mb-8 rounded-xl border p-6 ${cn.card}`}>
            <h2 className={`text-base font-semibold mb-4 ${cn.title}`}>求人別質問</h2>
            <div className={`flex border-b mb-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              {patternTabs.map((tab) => (
                <button
                  key={tab.patternKey}
                  type="button"
                  onClick={() => setActivePattern(tab.patternKey)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activePattern === tab.patternKey ? cn.tabActive : cn.tabInactive
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {questionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <svg className={`animate-spin h-8 w-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {patternQuestions.map((q, i) => (
                    <div key={q.id} className={`rounded-xl border p-5 transition-all ${cn.innerCard} ${!isDark && 'shadow-sm hover:shadow-md'}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button type="button" onClick={() => handleMoveQuestion(i, 'up')} disabled={i === 0} className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'text-gray-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}><ChevronUp className="w-5 h-5" /></button>
                          <button type="button" onClick={() => handleMoveQuestion(i, 'down')} disabled={i === patternQuestions.length - 1} className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'text-gray-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}><ChevronDown className="w-5 h-5" /></button>
                        </div>
                        <span className={`shrink-0 mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${isDark ? 'bg-white/10 text-gray-300' : 'bg-blue-100 text-blue-700'}`}>{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <textarea value={q.question} onChange={(e) => handleQuestionChange(q.id, e.target.value)} placeholder="質問文を入力してください" rows={2} className={`w-full px-4 py-2.5 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 ${cn.input}`} />
                        </div>
                        <button type="button" onClick={() => handleDeleteQuestion(q.id)} className={`shrink-0 p-2 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`} aria-label="削除">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button type="button" onClick={handleAddQuestion} className={`mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed text-sm font-medium rounded-xl transition-colors ${cn.btnAdd}`}>
                  <Plus className="w-5 h-5" />質問を追加
                </button>
              </>
            )}
          </div>

          <div className={`mb-8 rounded-xl border p-6 ${cn.card}`}>
            <h2 className={`text-base font-semibold mb-2 ${cn.title}`}>共通質問（クロージング）</h2>
            <p className={`text-sm mb-4 ${cn.subtext}`}>すべての面接の終了時に自動挿入されます。</p>
            <div className="space-y-4">
              {commonQuestionsClosing.map((cq) => (
                <div key={cq.id} className={`rounded-xl border p-4 ${cn.innerCard}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className={`text-xs font-semibold ${cn.label}`}>{cq.label}（{cq.category}）</p>
                    {editingCommonId === cq.id ? (
                      <button type="button" onClick={() => setEditingCommonId(null)} className={`text-xs font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>保存</button>
                    ) : (
                      <button type="button" onClick={() => setEditingCommonId(cq.id)} className={`inline-flex items-center gap-1 text-xs ${cn.subtext} ${isDark ? 'hover:text-white' : 'hover:text-slate-900'}`}>
                        <Pencil className="w-3 h-3" />編集
                      </button>
                    )}
                  </div>
                  {editingCommonId === cq.id ? (
                    <textarea value={cq.question} onChange={(e) => handleCommonQuestionChange(cq.id, e.target.value, 'closing')} rows={3} className={`w-full px-4 py-2.5 border rounded-xl text-sm resize-none focus:ring-2 focus:outline-none ${cn.input}`} onBlur={() => setEditingCommonId(null)} />
                  ) : (
                    <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-slate-800'}`}>{cq.question}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={openTemplateModal} className={`inline-flex items-center gap-2 px-4 py-2 border text-sm font-medium rounded-xl transition-colors ${cn.btnTemplate}`}>
              <FileText className="w-4 h-4" />テンプレートから読み込み
            </button>
            <button type="button" onClick={handleSaveQuestions} disabled={questionsLoading || isLoading} className={`px-6 py-2.5 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? `bg-gradient-to-r ${cn.btnSave} shadow-[0_4px_16px_rgba(59,130,246,0.3)]` : cn.btnSave}`}>
              変更を保存
            </button>
            <JobsLink />
          </div>

          {templateModalOpen && selectedJob && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={(e) => e.target === e.currentTarget && (setTemplateModalOpen(false), setSelectedTemplateQuestionIds(new Set()))}>
              <div className={`rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border ${cn.modal}`} onClick={(e) => e.stopPropagation()}>
                <h3 className={`text-lg font-bold mb-4 ${cn.title}`}>テンプレートから読み込み</h3>
                <p className={`text-sm mb-2 ${cn.modalText}`}>現在選択中: <strong className={cn.modalStrong}>{selectedJob.title} × {selectedJob.employmentTypeLabel}</strong></p>
                <p className={`text-sm mb-4 ${cn.modalText}`}>質問を選択してください（複数選択可）</p>
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {(JOB_TYPE_TEMPLATES[JOB_TYPES.includes(selectedJob.title as JobTypeKey) ? (selectedJob.title as JobTypeKey) : 'その他']).questions.map((q, idx) => (
                    <label key={idx} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${isDark ? 'border-white/[0.06] hover:bg-white/[0.04]' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={selectedTemplateQuestionIds.has(idx)} onChange={() => toggleTemplateQuestion(idx)} className={`mt-1 rounded ${isDark ? 'border-gray-500 text-blue-500 focus:ring-blue-500' : 'border-gray-300 text-blue-600 focus:ring-blue-500'}`} />
                      <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{q}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-2 mb-4">
                  <label className={`block text-sm font-medium ${cn.label}`}>挿入位置</label>
                  <select value={insertAt} onChange={(e) => setInsertAt(Number(e.target.value))} className={`w-full px-4 py-2 border rounded-lg text-sm ${cn.select}`}>
                    <option value={0}>先頭</option>
                    {patternQuestions.map((_, i) => (<option key={i} value={i + 1}>{`${i + 1}番目の後`}</option>))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleAddSelectedQuestions} disabled={selectedTemplateQuestionIds.size === 0} className={`inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl ${isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                    <Check className="w-4 h-4" />選択した質問を追加（{selectedTemplateQuestionIds.size}件）
                  </button>
                  <button type="button" onClick={handleReplaceAllWithTemplate} className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-xl ${isDark ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}>全て置換</button>
                </div>
                <div className="mt-6 flex justify-end">
                  <button type="button" onClick={() => (setTemplateModalOpen(false), setSelectedTemplateQuestionIds(new Set()))} className={`px-4 py-2 text-sm font-medium rounded-xl ${isDark ? 'text-gray-400 bg-white/[0.05] hover:bg-white/[0.08]' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}>キャンセル</button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : selectedJobId === '' && jobs.length > 0 ? (
        <div className={`rounded-xl border p-12 text-center ${cn.emptyCard}`}>
          <p className={cn.subtext}>求人を選択してください</p>
        </div>
      ) : null}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

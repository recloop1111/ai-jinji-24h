'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus, FileText, Check, ChevronUp, ChevronDown, Pencil, X, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'
import { CULTURE_FIT_QUESTIONS, distributeQuestionsSimple } from '@/lib/constants/questions'

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
  '営業': { name: '営業', questions: ['これまでの営業経験について教えてください。どのような商材を扱い、どのような成果を上げましたか？', '目標を達成できなかった経験はありますか？その時どのように対処しましたか？', 'お客様との信頼関係を構築するために、普段どのようなことを心がけていますか？', 'チームで営業に取り組んだ経験があれば教えてください。あなたの役割は何でしたか？', '新規開拓で工夫していることを教えてください。', '競合他社との差別化をどのようにアピールしていますか？', 'これまでで最も難しかった商談と、その結果を教えてください。', '当社を志望した理由を教えてください。'] },
  '事務': { name: '事務', questions: ['これまでの事務経験について教えてください。', 'パソコンの基本操作（Word、Excel）はどの程度できますか？', '電話対応や来客対応の経験はありますか？', '複数の業務を同時にお願いすることもありますが、優先順位をつけて作業するのは得意ですか？', '書類作成やデータ入力で心がけていることを教えてください。', 'ミスを防ぐために工夫していることはありますか？', '業務改善の提案をした経験があれば教えてください。', '当社を志望した理由を教えてください。'] },
  '経理・財務': { name: '経理・財務', questions: ['経理・財務の業務経験について教えてください。', '会計ソフトや経理システムの使用経験はありますか？', '月次決算や年次決算の業務経験があれば教えてください。', '数字の正確性を保つために、どのような工夫をしていますか？', '税務や法規制の知識について、どの程度理解していますか？', '監査対応の経験はありますか？', '業務効率化のために取り組んだことを教えてください。', '当社を志望した理由を教えてください。'] },
  '人事・総務': { name: '人事・総務', questions: ['人事・総務の業務経験について教えてください。', '採用活動や面接の経験はありますか？', '社内規程の作成や管理の経験があれば教えてください。', '従業員からの相談や問い合わせ対応で心がけていることを教えてください。', '労務管理や給与計算の経験はありますか？', '社内イベントや研修の企画経験があれば教えてください。', '機密情報の取り扱いで気をつけていることを教えてください。', '当社を志望した理由を教えてください。'] },
  '企画・マーケティング': { name: '企画・マーケティング', questions: ['これまでの企画・マーケティング経験について教えてください。', 'キャンペーンやプロモーションの企画・実行経験があれば教えてください。', '市場調査や競合分析でどのようなことを行ってきましたか？', 'データを分析して施策を改善した経験を教えてください。', 'クリエイティブな発想をどのように生み出していますか？', 'プロジェクトの予算管理の経験はありますか？', '失敗した企画とその学びを教えてください。', '当社を志望した理由を教えてください。'] },
  'エンジニア・技術職': { name: 'エンジニア・技術職', questions: ['プログラミングを始めたきっかけと、これまでに学んだ言語やフレームワークを教えてください。', 'これまでの開発経験や、取り組んできたプロジェクトを教えてください。', 'チームで開発した経験はありますか？その中であなたはどのような役割を担いましたか？', '技術的に難しい課題に直面した時、どのように解決しましたか？', '新しい技術をどのように習得していますか？', 'コードレビューで心がけていることを教えてください。', '本番環境でのトラブル対応経験があれば教えてください。', '当社を志望した理由を教えてください。'] },
  'デザイナー': { name: 'デザイナー', questions: ['デザインを始めたきっかけと、これまでに取り組んできた作品について教えてください。', '使用しているデザインツールやソフトウェアを教えてください。', 'クライアントの要望をデザインに落とし込む際のプロセスを教えてください。', 'デザインのトレンドをどのようにキャッチアップしていますか？', 'ポートフォリオの中で最も力を入れた作品と、その理由を教えてください。', 'フィードバックを受けた時、どのように対応しますか？', 'デザインと使いやすさのバランスをどのように考えていますか？', '当社を志望した理由を教えてください。'] },
  '販売・接客': { name: '販売・接客', questions: ['これまでの販売・接客経験について教えてください。', 'お客様に商品を勧める際に心がけていることは何ですか？', '接客中に困った経験と、その時の対応を教えてください。', '売上目標に向けてどのように取り組んでいますか？', 'お客様に満足いただくために工夫していることを教えてください。', 'クレーム対応で心がけていることを教えてください。', 'チームワークを大切にするために意識していることはありますか？', '当社を志望した理由を教えてください。'] },
  '製造・工場': { name: '製造・工場', questions: ['製造業での業務経験について教えてください。', '品質管理で心がけていることを教えてください。', '安全対策で特に気をつけていることを教えてください。', '生産ラインで改善した経験があれば教えてください。', 'チームで目標達成に向けて取り組んだ経験を教えてください。', '機械の操作やメンテナンスの経験はありますか？', '納期に追われた時、どのように対応しましたか？', '当社を志望した理由を教えてください。'] },
  '物流・配送': { name: '物流・配送', questions: ['物流・配送の業務経験について教えてください。', '荷物の積み下ろしや配達ルートで効率化した経験はありますか？', '配達中のトラブルや遅延が発生した時、どのように対応しますか？', '安全運転や事故防止で心がけていることを教えてください。', '体力的にきついと感じる場面はありますか。どのように乗り越えていますか？', 'お客様との対面でのコミュニケーションで心がけていることはありますか？', '時間管理で工夫していることを教えてください。', '当社を志望した理由を教えてください。'] },
  '医療・介護': { name: '医療・介護', questions: ['医療・介護の仕事を志した理由を教えてください。', '利用者様や患者様との信頼関係をどのように築いていますか？', '体力的・精神的な負担がある中で、どのようにセルフケアをしていますか？', 'チーム医療・多職種連携で大切にしていることを教えてください。', '今後この仕事で実現したいことはありますか？', '緊急時の対応経験があれば教えてください。', 'ご家族への対応で心がけていることを教えてください。', '当社を志望した理由を教えてください。'] },
  '教育・講師': { name: '教育・講師', questions: ['教育の仕事を志した理由を教えてください。', '生徒や保護者とのコミュニケーションで心がけていることは何ですか？', '授業や指導で工夫していることを教えてください。', '生徒が理解できない時のフォロー方法を教えてください。', '自分自身の学びや研鑽で続けていることはありますか？', '問題のある生徒への対応経験を教えてください。', '授業の準備にどの程度時間をかけていますか？', '当社を志望した理由を教えてください。'] },
  '飲食・調理': { name: '飲食・調理', questions: ['飲食業で働いてみようと思ったきっかけを教えてください。', '忙しい時間帯での接客で心がけていることを教えてください。', '食品の衛生管理で意識している点はありますか？', 'クレーム対応で工夫していることがあれば教えてください。', 'チームで働く上で大切にしていることを教えてください。', 'メニュー開発や提案の経験はありますか？', 'お店の売上向上のために取り組んだことはありますか？', '当社を志望した理由を教えてください。'] },
  '建設・施工管理': { name: '建設・施工管理', questions: ['建設業・不動産業に興味を持ったきっかけを教えてください。', '安全対策で特に気をつけていることを教えてください。', '現場でのトラブル発生時、どのように対応しますか？', '図面や仕様書の読み方について、これまでの経験を教えてください。', '3年後、5年後にどのようなスキルを身につけたいですか？', '協力業者とのコミュニケーションで心がけていることを教えてください。', '工期短縮やコスト削減の工夫をした経験はありますか？', '当社を志望した理由を教えてください。'] },
  'カスタマーサポート': { name: 'カスタマーサポート', questions: ['これまでの顧客対応経験を教えてください。', 'クレーム対応で心がけていることを教えてください。', '難しい要望にどう対応しますか？', 'チームでの情報共有で工夫していることを教えてください。', 'ストレス管理の方法を教えてください。', 'お客様満足度向上のために取り組んだことを教えてください。', '電話・メール・チャットなど、対応媒体の得意分野はありますか？', '当社を志望した理由を教えてください。'] },
  'その他': { name: 'その他', questions: ['これまでのご経歴を簡単に教えてください。', '志望動機を教えてください。', 'あなたの強みと弱みを教えてください。', 'チームで働いた経験を教えてください。', '5年後のキャリアプランを教えてください。', '仕事で最もやりがいを感じた経験を教えてください。', '困難な状況をどのように乗り越えましたか？', '当社でどのように貢献したいですか？'] },
}

const DEFAULT_CUSTOM_QUESTIONS_WITH_CULTURE = 5
const DEFAULT_CUSTOM_QUESTIONS_WITHOUT_CULTURE = 8

type QuestionEditorProps = {
  companyId: string
  theme: 'light' | 'dark'
  onNavigateToJobs?: () => void
}

export default function QuestionEditor({ companyId: companyIdProp, theme, onNavigateToJobs }: QuestionEditorProps) {
  const searchParams = useSearchParams()
  const initialJobId = searchParams.get('jobId')
  const { companyId: currentCompanyId, loading: companyIdLoading, error: companyIdError } = useCompanyId()
  // Supabaseクライアント: createBrowserClientを使用（lib/supabase/client.ts経由）
  const supabase = useMemo(() => createClient(), [])
  const resolvedCompanyId = companyIdProp === 'current' ? currentCompanyId : companyIdProp

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
  const [cultureAnalysisEnabled, setCultureAnalysisEnabled] = useState(false)

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
    if (!resolvedCompanyId) {
      setCultureAnalysisEnabled(false)
      return
    }
    async function fetchCultureAnalysisFlag() {
      const { data } = await supabase
        .from('companies')
        .select('culture_analysis_enabled')
        .eq('id', resolvedCompanyId)
        .single()
      setCultureAnalysisEnabled(data?.culture_analysis_enabled ?? false)
    }
    fetchCultureAnalysisFlag()
  }, [resolvedCompanyId, supabase])

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

  const fetchCommonQuestions = async (companyId: string | null) => {
    if (!companyId) {
      console.log('[QuestionEditor 共通質問読み込み] company_idなし - スキップ')
      return
    }
    try {
      console.log('[QuestionEditor 共通質問読み込み] テーブル: common_questions 条件: company_id=', companyId, '取得カラム: *')
      const { data, error } = await supabase
        .from('common_questions')
        .select('*')
        .eq('company_id', companyId)
        .order('category')
        .order('sort_order')

      console.log('[QuestionEditor 共通質問読み込み] 取得件数=', data?.length || 0, 'data=', data, 'error=', error)

      if (error) {
        console.error('[QuestionEditor 共通質問読み込み] エラー:', error)
        return
      }

      if (!data || data.length === 0) {
        console.log('[QuestionEditor 共通質問読み込み] データなし - デフォルト値を使用')
        return
      }

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

      console.log('[QuestionEditor 共通質問読み込み] マッピング後 アイスブレイク件数=', ice.length, 'クロージング件数=', close.length)

      if (ice.length > 0) setCommonQuestionsIcebreak(ice)
      if (close.length > 0) setCommonQuestionsClosing(close)
    } catch (err) {
      console.error('[QuestionEditor 共通質問読み込み] 例外:', err)
    }
  }

  useEffect(() => {
    fetchCommonQuestions(resolvedCompanyId)
  }, [resolvedCompanyId, supabase])

  const fetchJobQuestions = async (jobId: string, patternKey: string) => {
    setQuestionsLoading(true)
    try {
      const { data, error } = await supabase
        .from('job_questions')
        .select('*')
        .eq('job_id', jobId)
        .eq('pattern_key', patternKey)
        .order('sort_order', { ascending: true })

      console.log('[QuestionEditor 読み込み] テーブル: job_questions', '条件: job_id=', jobId, 'pattern_key=', patternKey, '取得件数=', data?.length || 0, 'data=', data, 'error=', error)

      if (error) throw error
      if (data && data.length > 0) {
        const mapped = data.map((r: { id: string; question?: string; question_text?: string }) => ({
          id: r.id,
          question: r.question ?? r.question_text ?? '',
        }))
        setPatternQuestions(mapped)
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

  useEffect(() => {
    if (!selectedJobId || !activePattern) {
      setPatternQuestions([])
      return
    }
    fetchJobQuestions(selectedJobId, activePattern)
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

  const MAX_TOTAL_QUESTIONS = 10
  const cultureQuestionCount = cultureAnalysisEnabled ? CULTURE_FIT_QUESTIONS.length : 0
  const maxCustomQuestions = MAX_TOTAL_QUESTIONS - cultureQuestionCount
  const totalQuestionCount = cultureQuestionCount + patternQuestions.length

  // 統合質問リスト: カスタム質問と社風分析質問を分散配置した順序で表示
  type IntegratedQuestion = {
    id: string
    question: string
    type: 'custom' | 'culture'
    originalIndex: number
    label?: string
    traits?: string
  }

  const integratedQuestions = useMemo<IntegratedQuestion[]>(() => {
    if (!cultureAnalysisEnabled) {
      return patternQuestions.map((q, i) => ({
        id: q.id,
        question: q.question,
        type: 'custom' as const,
        originalIndex: i,
      }))
    }

    // 社風分析ON時: distributeQuestionsSimpleのロジックで配置位置を計算
    const customCount = patternQuestions.length
    const cultureCount = CULTURE_FIT_QUESTIONS.length
    const totalSlots = customCount + cultureCount

    if (totalSlots === 0) return []

    // 社風分析質問を挿入する位置を計算
    const culturePositions: number[] = []
    for (let i = 0; i < cultureCount; i++) {
      const pos = Math.round((i + 1) * totalSlots / (cultureCount + 1))
      culturePositions.push(pos)
    }

    const result: IntegratedQuestion[] = []
    let customIdx = 0
    let cultureIdx = 0

    for (let i = 0; i < totalSlots; i++) {
      if (culturePositions.includes(i) && cultureIdx < cultureCount) {
        const cfq = CULTURE_FIT_QUESTIONS[cultureIdx]
        result.push({
          id: cfq.id,
          question: cfq.question,
          type: 'culture',
          originalIndex: cultureIdx,
          label: cfq.label,
          traits: cfq.traits,
        })
        cultureIdx++
      } else if (customIdx < customCount) {
        result.push({
          id: patternQuestions[customIdx].id,
          question: patternQuestions[customIdx].question,
          type: 'custom',
          originalIndex: customIdx,
        })
        customIdx++
      } else if (cultureIdx < cultureCount) {
        const cfq = CULTURE_FIT_QUESTIONS[cultureIdx]
        result.push({
          id: cfq.id,
          question: cfq.question,
          type: 'culture',
          originalIndex: cultureIdx,
          label: cfq.label,
          traits: cfq.traits,
        })
        cultureIdx++
      }
    }

    return result
  }, [cultureAnalysisEnabled, patternQuestions])

  const handleAddQuestion = () => {
    if (!selectedJobId) return
    if (totalQuestionCount >= MAX_TOTAL_QUESTIONS) {
      showToast(cultureAnalysisEnabled 
        ? `質問は最大${MAX_TOTAL_QUESTIONS}問までです（社風分析${cultureQuestionCount}問を含む）` 
        : `質問は最大${MAX_TOTAL_QUESTIONS}問までです`)
      return
    }
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
    // 社風分析ON: 先頭5問のみ使用（社風分析3問 + カスタム5問 = 8問）、OFF: 8問全て使用
    const defaultCount = cultureAnalysisEnabled ? DEFAULT_CUSTOM_QUESTIONS_WITH_CULTURE : DEFAULT_CUSTOM_QUESTIONS_WITHOUT_CULTURE
    const questionsToUse = template.questions.slice(0, defaultCount)
    const newQuestions: Question[] = questionsToUse.map((q, i) => ({ id: `temp-${Date.now()}-${i}`, question: q }))
    setPatternQuestions(newQuestions)
    setTemplateModalOpen(false)
    setSelectedTemplateQuestionIds(new Set())
    showToast(`${template.name}テンプレートで全て置き換えました（${defaultCount}問）`)
  }

  const handleSaveCommonQuestions = async () => {
    if (!resolvedCompanyId) {
      console.error('[QuestionEditor 共通質問保存] company_idなし - スキップ')
      return
    }

    try {
      console.log('[QuestionEditor 共通質問保存開始] テーブル: common_questions company_id=', resolvedCompanyId, 'アイスブレイク件数=', commonQuestionsIcebreak.length, 'クロージング件数=', commonQuestionsClosing.length)

      // アイスブレイクとクロージングを統合
      const allCommonQuestions = [
        ...commonQuestionsIcebreak.map((q, index) => ({
          id: q.id,
          company_id: resolvedCompanyId,
          category: 'icebreakers',
          label: q.label,
          question_text: q.question,
          is_scorable: false,
          sort_order: index + 1,
        })),
        ...commonQuestionsClosing.map((q, index) => ({
          id: q.id,
          company_id: resolvedCompanyId,
          category: 'closing',
          label: q.label,
          question_text: q.question,
          is_scorable: false,
          sort_order: index + 1,
        })),
      ]

      // ステップ1: 既存の共通質問を全削除
      const { data: deleteData, error: deleteError } = await supabase
        .from('common_questions')
        .delete()
        .eq('company_id', resolvedCompanyId)
        .select()

      console.log('[QuestionEditor 共通質問保存] ステップ1: DELETE実行完了', '削除件数=', deleteData?.length || 0, 'data=', deleteData, 'error=', deleteError)

      if (deleteError) {
        console.error('[QuestionEditor 共通質問保存] 削除エラー:', deleteError)
        throw deleteError
      }

      // ステップ2: 新しい共通質問を一括挿入
      if (allCommonQuestions.length > 0) {
        const rows = allCommonQuestions.map((q) => ({
          company_id: q.company_id,
          category: q.category,
          label: q.label,
          question_text: q.question_text,
          is_scorable: q.is_scorable,
          sort_order: q.sort_order,
        }))

        console.log('[QuestionEditor 共通質問保存] ステップ2: INSERT実行開始', '挿入件数=', rows.length, 'rows=', rows)

        const { data: insertData, error: insertError } = await supabase
          .from('common_questions')
          .insert(rows)
          .select()

        console.log('[QuestionEditor 共通質問保存] ステップ2: INSERT実行完了', '挿入件数=', insertData?.length || 0, 'data=', insertData, 'error=', insertError)

        if (insertError) {
          console.error('[QuestionEditor 共通質問保存] 挿入エラー:', insertError)
          throw insertError
        }
      } else {
        console.log('[QuestionEditor 共通質問保存] ステップ2: 挿入データなし（空配列）')
      }

      // ステップ3: 保存直後の検証
      const { data: verifyData, error: verifyError } = await supabase
        .from('common_questions')
        .select('*')
        .eq('company_id', resolvedCompanyId)
        .order('category')
        .order('sort_order')

      console.log('[QuestionEditor 共通質問保存後の検証] 再取得データ テーブル: common_questions 条件: company_id=', resolvedCompanyId, '取得件数=', verifyData?.length || 0, 'data=', verifyData, 'error=', verifyError)

      if (verifyError) {
        console.error('[QuestionEditor 共通質問保存後の検証] 検証エラー:', verifyError)
      }

      // ステップ4: 保存後に最新データを再取得して画面に反映
      await fetchCommonQuestions(resolvedCompanyId)

      console.log('[QuestionEditor 共通質問保存] 保存成功: DELETE→INSERT完了')
    } catch (err) {
      console.error('[QuestionEditor 共通質問保存] エラー発生:', err)
      throw err
    }
  }

  const handleSaveQuestions = async () => {
    if (!selectedJobId || !activePattern) return
    setIsLoading(true)
    try {
      console.log('[QuestionEditor 保存開始] 処理方式: DELETE → INSERT', 'job_id=', selectedJobId, 'pattern_key=', activePattern, '保存予定件数=', patternQuestions.length)
      console.log('[QuestionEditor 保存] Supabaseクライアント:', supabase, 'URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)

      // 共通質問も保存
      await handleSaveCommonQuestions()

      // ステップ1: 既存の質問を全削除
      const { data: deleteData, error: deleteError } = await supabase
        .from('job_questions')
        .delete()
        .eq('job_id', selectedJobId)
        .eq('pattern_key', activePattern)
        .select()

      console.log('[QuestionEditor 保存] ステップ1: DELETE実行完了', '削除件数=', deleteData?.length || 0, 'data=', deleteData, 'error=', deleteError)

      if (deleteError) {
        console.error('[QuestionEditor 保存] 削除エラー:', deleteError)
        showToast('質問の保存に失敗しました。')
        return
      }

      // ステップ2: 新しい質問を一括挿入
      if (patternQuestions.length > 0) {
        const rows = patternQuestions.map((q, index) => ({
          job_id: selectedJobId,
          pattern_key: activePattern,
          question_text: q.question,
          sort_order: index + 1,
        }))

        console.log('[QuestionEditor 保存] ステップ2: INSERT実行開始', '挿入件数=', rows.length, 'rows=', rows)

        const { data: insertData, error: insertError } = await supabase
          .from('job_questions')
          .insert(rows)
          .select()

        console.log('[QuestionEditor 保存] ステップ2: INSERT実行完了', '挿入件数=', insertData?.length || 0, 'data=', insertData, 'error=', insertError)

        if (insertError) {
          console.error('[QuestionEditor 保存] 挿入エラー:', insertError)
          showToast('質問の保存に失敗しました。')
          return
        }
      } else {
        console.log('[QuestionEditor 保存] ステップ2: 挿入データなし（空配列）')
      }

      console.log('[QuestionEditor 保存] 保存成功: DELETE→INSERT完了')

      // ステップ3: 保存直後の検証 - 保存したはずのデータを再取得
      const { data: verifyData, error: verifyError } = await supabase
        .from('job_questions')
        .select('*')
        .eq('job_id', selectedJobId)
        .eq('pattern_key', activePattern)
        .order('sort_order', { ascending: true })

      console.log('[QuestionEditor 保存後の検証] 再取得データ テーブル: job_questions 条件: job_id=', selectedJobId, 'pattern_key=', activePattern, '取得件数=', verifyData?.length || 0, 'data=', verifyData, 'error=', verifyError)

      if (verifyError) {
        console.error('[QuestionEditor 保存後の検証] 検証エラー:', verifyError)
      } else {
        const expectedCount = patternQuestions.length
        const actualCount = verifyData?.length || 0
        if (actualCount !== expectedCount) {
          console.warn('[QuestionEditor 保存後の検証] 件数不一致 期待=', expectedCount, '実際=', actualCount)
        } else {
          console.log('[QuestionEditor 保存後の検証] ✓ 件数一致 期待=', expectedCount, '実際=', actualCount)
        }
      }

      // ステップ4: 保存後に最新データを再取得して画面に反映
      await fetchJobQuestions(selectedJobId, activePattern)

      showToast('質問を保存しました')
    } catch (err) {
      console.error('[QuestionEditor 保存] エラー発生:', err)
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

  if (companyIdProp === 'current' && companyIdLoading) {
    return (
      <div className="min-w-0 max-w-[100vw] pb-10 flex items-center justify-center py-16">
        <span className={`inline-block w-10 h-10 border-2 ${isDark ? 'border-blue-400' : 'border-blue-600'} border-t-transparent rounded-full animate-spin`} />
      </div>
    )
  }
  if (companyIdProp === 'current' && (companyIdError || (!resolvedCompanyId && !companyIdLoading))) {
    return (
      <div className={`rounded-lg p-4 text-sm ${isDark ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-red-50 border border-red-200 text-red-800'}`}>
        {companyIdError ?? '企業情報を取得できませんでした。'}
      </div>
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
            <h2 className={`text-base font-semibold mb-2 ${cn.title}`}>
              面接質問
            </h2>
            <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              アイスブレイク（{commonQuestionsIcebreak.length}問）の後に以下の質問が順番に出題されます。{cultureAnalysisEnabled && '社風分析質問は固定位置で表示されます。'}
            </p>
            <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              質問数: {totalQuestionCount} / {MAX_TOTAL_QUESTIONS}問（アイスブレイク除く）
              {cultureAnalysisEnabled && ` ｜ 社風分析: ${cultureQuestionCount}問（固定）/ カスタム: ${patternQuestions.length}問`}
            </p>
            {totalQuestionCount > MAX_TOTAL_QUESTIONS && (
              <div className={`rounded-lg p-3 mb-4 ${isDark ? 'bg-red-900/30 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-800'}`}>
                  ⚠ 質問数が上限を超えています。面接で全質問に到達できない可能性があります。質問を削除してください。
                </p>
              </div>
            )}
            {totalQuestionCount === MAX_TOTAL_QUESTIONS && (
              isDark ? (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-300">
                    ⚠ 質問を10問に設定した場合、応募者の回答時間によっては最終質問まで到達できない可能性があります。推奨は8問以下です。
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    ⚠ 質問を10問に設定した場合、応募者の回答時間によっては最終質問まで到達できない可能性があります。推奨は8問以下です。
                  </p>
                </div>
              )
            )}
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
                  {integratedQuestions.map((q, i) => {
                    const isCultureQuestion = q.type === 'culture'
                    
                    if (isCultureQuestion) {
                      return (
                        <div 
                          key={q.id} 
                          className={`rounded-xl border-l-4 border p-5 transition-all ${
                            isDark 
                              ? 'bg-purple-500/5 border-purple-500/30 border-l-purple-400' 
                              : 'bg-purple-50/50 border-purple-200 border-l-purple-400'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col gap-0.5 shrink-0 opacity-0 pointer-events-none">
                              <div className="p-1"><ChevronUp className="w-5 h-5" /></div>
                              <div className="p-1"><ChevronDown className="w-5 h-5" /></div>
                            </div>
                            <span className={`shrink-0 mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-semibold ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{q.label}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-100 text-purple-600'}`}>
                                  {q.traits}
                                </span>
                              </div>
                              {isDark ? (
                                <textarea
                                  defaultValue={q.question}
                                  rows={2}
                                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg text-gray-300 px-3 py-2 text-sm focus:border-purple-500/50 outline-none resize-none"
                                />
                              ) : (
                                <p className="text-sm leading-relaxed text-slate-700">{q.question}</p>
                              )}
                              <p className={`text-xs mt-2 ${isDark ? 'text-purple-400/60' : 'text-purple-500'}`}>
                                社風分析用質問（固定）
                              </p>
                            </div>
                            {isDark ? (
                              <button type="button" className="shrink-0 p-2 text-gray-700 cursor-not-allowed">
                                <X className="w-5 h-5" />
                              </button>
                            ) : (
                              <div className="shrink-0 p-2 opacity-0 pointer-events-none">
                                <X className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <div key={q.id} className={`rounded-xl border p-5 transition-all ${cn.innerCard} ${!isDark && 'shadow-sm hover:shadow-md'}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button 
                              type="button" 
                              onClick={() => handleMoveQuestion(q.originalIndex, 'up')} 
                              disabled={q.originalIndex === 0} 
                              className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'text-gray-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                              <ChevronUp className="w-5 h-5" />
                            </button>
                            <button 
                              type="button" 
                              onClick={() => handleMoveQuestion(q.originalIndex, 'down')} 
                              disabled={q.originalIndex === patternQuestions.length - 1} 
                              className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'text-gray-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                              <ChevronDown className="w-5 h-5" />
                            </button>
                          </div>
                          <span className={`shrink-0 mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${isDark ? 'bg-white/10 text-gray-300' : 'bg-blue-100 text-blue-700'}`}>
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <textarea 
                              value={q.question} 
                              onChange={(e) => handleQuestionChange(q.id, e.target.value)} 
                              placeholder="質問文を入力してください" 
                              rows={2} 
                              className={`w-full px-4 py-2.5 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 ${cn.input}`} 
                            />
                          </div>
                          <button 
                            type="button" 
                            onClick={() => handleDeleteQuestion(q.id)} 
                            className={`shrink-0 p-2 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`} 
                            aria-label="削除"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-6">
                  <button 
                    type="button" 
                    onClick={handleAddQuestion} 
                    disabled={totalQuestionCount >= MAX_TOTAL_QUESTIONS}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed text-sm font-medium rounded-xl transition-colors ${
                      totalQuestionCount >= MAX_TOTAL_QUESTIONS
                        ? isDark 
                          ? 'border-gray-700 text-gray-600 cursor-not-allowed opacity-50' 
                          : 'border-gray-300 text-gray-400 cursor-not-allowed opacity-50'
                        : cn.btnAdd
                    }`}
                  >
                    <Plus className="w-5 h-5" />質問を追加
                  </button>
                  {totalQuestionCount >= MAX_TOTAL_QUESTIONS && (
                    <p className={`mt-2 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>
                      質問は最大{cultureAnalysisEnabled ? maxCustomQuestions : MAX_TOTAL_QUESTIONS}問までです{cultureAnalysisEnabled && `（社風分析含め合計${MAX_TOTAL_QUESTIONS}問）`}
                    </p>
                  )}
                </div>
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

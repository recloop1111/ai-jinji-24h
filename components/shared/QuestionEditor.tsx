'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Trash2, FileText, Check, ChevronUp, ChevronDown, Pencil } from 'lucide-react'

// TODO: 段階4 - Supabase経由でcompanyIdに紐づく質問データを読み書き

type Question = {
  id: string
  question: string
}

type CommonQuestionItem = { id: string; label: string; category: string; question: string }

const COMMON_QUESTIONS: { icebreakers: CommonQuestionItem[]; closing: CommonQuestionItem[] } = {
  icebreakers: [
    { id: 'ice-1', label: '冒頭1', category: 'アイスブレイク', question: '本日はお時間をいただきありがとうございます。これから約30〜40分の面接を行います。途中で聞き取りにくい点があれば遠慮なくお知らせください。本日の体調は問題ありませんか？' },
    { id: 'ice-2', label: '冒頭2', category: 'アイスブレイク', question: 'ありがとうございます。面接を始める前に、最近あった嬉しかったことや、ちょっとした楽しみにしていることがあれば気軽に教えてください。' },
  ],
  closing: [
    { id: 'close-1', label: 'クロージング', category: 'クロージング', question: '面接は以上となります。最後に、何かご質問や伝えておきたいことはありますか？本日はお忙しい中、ありがとうございました。' },
  ],
}

type Job = {
  id: string
  jobType: string
  employmentType: string
}

type QuestionOption = {
  id: string
  label: string
  jobId: string
  jobType: string
  employmentType: string
  pattern?: '新卒' | '中途'
}

const JOB_TYPES = ['営業', '事務', '経理・財務', '人事・総務', '企画・マーケティング', 'エンジニア・技術職', 'デザイナー', '販売・接客', '製造・工場', '物流・配送', '医療・介護', '教育・講師', '飲食・調理', '建設・施工管理', 'カスタマーサポート', 'その他'] as const
type JobTypeKey = (typeof JOB_TYPES)[number]

const DUMMY_JOBS: Job[] = [
  { id: '1', jobType: '営業', employmentType: '正社員' },
  { id: '2', jobType: '事務', employmentType: 'アルバイト' },
  { id: '3', jobType: 'エンジニア・技術職', employmentType: '正社員' },
]

function generateQuestionOptions(jobs: Job[]): QuestionOption[] {
  const options: QuestionOption[] = []
  for (const job of jobs) {
    if (job.employmentType === '正社員') {
      options.push({ id: `${job.id}-新卒`, label: `${job.jobType} × 正社員 × 新卒`, jobId: job.id, jobType: job.jobType, employmentType: job.employmentType, pattern: '新卒' })
      options.push({ id: `${job.id}-中途`, label: `${job.jobType} × 正社員 × 中途`, jobId: job.id, jobType: job.jobType, employmentType: job.employmentType, pattern: '中途' })
    } else {
      options.push({ id: job.id, label: `${job.jobType} × ${job.employmentType}`, jobId: job.id, jobType: job.jobType, employmentType: job.employmentType })
    }
  }
  return options
}

const QUESTIONS_BY_OPTION: Record<string, Question[]> = {
  '1-新卒': [
    { id: 'q1-new-1', question: '営業の仕事に興味を持ったきっかけを教えてください。' },
    { id: 'q1-new-2', question: '学生時代に目標を立てて達成した経験があれば教えてください。' },
    { id: 'q1-new-3', question: 'チームで取り組んだ経験を教えてください。その中であなたはどのような役割を担いましたか？' },
    { id: 'q1-new-4', question: 'お客様とのコミュニケーションで大切にしていることは何ですか？' },
    { id: 'q1-new-5', question: '当社の営業職に応募された理由と、入社後にどのような営業パーソンになりたいか教えてください。' },
  ],
  '1-中途': [
    { id: 'q1-mid-1', question: 'これまでの営業経験について教えてください。どのような商材を扱い、どのような成果を上げましたか？' },
    { id: 'q1-mid-2', question: '目標を達成できなかった経験はありますか？その時どのように対処しましたか？' },
    { id: 'q1-mid-3', question: 'お客様との信頼関係を構築するために、普段どのようなことを心がけていますか？' },
    { id: 'q1-mid-4', question: 'チームで営業に取り組んだ経験があれば教えてください。あなたの役割は何でしたか？' },
    { id: 'q1-mid-5', question: '転職を考えた理由と、当社の営業職に応募された理由を教えてください。' },
  ],
  '2': [
    { id: 'q2-1', question: 'これまでのアルバイトやお仕事の経験を教えてください。' },
    { id: 'q2-2', question: 'パソコンの基本操作（Word、Excel）はどの程度できますか？' },
    { id: 'q2-3', question: '電話対応や来客対応の経験はありますか？' },
    { id: 'q2-4', question: '複数の業務を同時にお願いすることもありますが、優先順位をつけて作業するのは得意ですか？' },
    { id: 'q2-5', question: '週にどのくらいのシフトで働けますか？' },
  ],
  '3-新卒': [
    { id: 'q3-new-1', question: 'プログラミングを始めたきっかけと、これまでに学んだ言語やフレームワークを教えてください。' },
    { id: 'q3-new-2', question: '学生時代に取り組んだ開発プロジェクトや個人開発があれば教えてください。' },
    { id: 'q3-new-3', question: 'チームで開発した経験はありますか？その中であなたはどのような役割を担いましたか？' },
    { id: 'q3-new-4', question: '技術的に難しい課題に直面した時、どのように解決しましたか？' },
    { id: 'q3-new-5', question: '入社後にどのようなエンジニアになりたいですか？どのような技術を身につけたいですか？' },
  ],
  '3-中途': [
    { id: 'q3-mid-1', question: 'これまでの開発経験や、担当してきたプロジェクトについて教えてください。' },
    { id: 'q3-mid-2', question: '使用経験のあるプログラミング言語やフレームワーク、開発環境を教えてください。' },
    { id: 'q3-mid-3', question: 'チーム開発での経験を教えてください。コードレビューやアーキテクチャ設計の経験はありますか？' },
    { id: 'q3-mid-4', question: '技術的な課題を解決した経験で、特に印象に残っているものを教えてください。' },
    { id: 'q3-mid-5', question: '転職を考えた理由と、当社でどのようなエンジニアとして成長したいか教えてください。' },
  ],
}

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
  const questionOptions = useMemo(() => generateQuestionOptions(DUMMY_JOBS), [])
  const [selectedOptionId, setSelectedOptionId] = useState<string>('')
  const [questionsByOption, setQuestionsByOption] = useState<Record<string, Question[]>>(() => QUESTIONS_BY_OPTION)
  const [commonQuestions, setCommonQuestions] = useState(() => ({
    icebreakers: COMMON_QUESTIONS.icebreakers.map((x) => ({ ...x })),
    closing: COMMON_QUESTIONS.closing.map((x) => ({ ...x })),
  }))
  const [editingCommonId, setEditingCommonId] = useState<string | null>(null)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [selectedTemplateQuestionIds, setSelectedTemplateQuestionIds] = useState<Set<number>>(new Set())
  const [insertAt, setInsertAt] = useState(0)
  const [toast, setToast] = useState('')

  const isDark = theme === 'dark'
  const selectedOption = useMemo(() => questionOptions.find((opt) => opt.id === selectedOptionId), [questionOptions, selectedOptionId])
  const questions = useMemo(() => selectedOptionId ? questionsByOption[selectedOptionId] ?? [] : [], [selectedOptionId, questionsByOption])

  const cn = {
    title: isDark ? 'text-white' : 'text-slate-900',
    subtext: isDark ? 'text-gray-400' : 'text-slate-500',
    card: isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-slate-50 border-slate-200',
    innerCard: isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-white border-slate-200',
    btnTemplate: isDark ? 'bg-white/[0.05] hover:bg-white/[0.08] border-white/[0.08] text-gray-400 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50',
    btnAdd: isDark ? 'bg-white/[0.03] border-dashed border-white/[0.08] text-gray-400 hover:bg-white/[0.05] hover:border-white/15' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300',
    btnSave: isDark ? 'from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500' : 'bg-indigo-600 hover:bg-indigo-700',
    input: isDark ? 'bg-white/[0.05] border-white/[0.08] text-white placeholder-gray-500 focus:ring-blue-500/30' : 'border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 focus:ring-indigo-500/30',
    label: isDark ? 'text-gray-500' : 'text-slate-500',
    select: isDark ? 'bg-white/[0.05] border-white/[0.08] text-white focus:ring-blue-500/50' : 'border-slate-200 text-slate-900 bg-white focus:ring-indigo-500',
    modal: isDark ? 'bg-gray-900 border-white/10' : 'bg-white',
    modalText: isDark ? 'text-gray-400' : 'text-slate-600',
    modalStrong: isDark ? 'text-white' : 'text-slate-900',
    emptyCard: isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-white border-slate-200',
    linkBtn: isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700',
  }

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }

  const handleCommonQuestionChange = (id: string, value: string, type: 'icebreakers' | 'closing') => {
    setCommonQuestions((prev) => {
      const arr = type === 'icebreakers' ? prev.icebreakers : prev.closing
      const idx = arr.findIndex((x) => x.id === id)
      if (idx < 0) return prev
      const nextArr = arr.map((item, i) => (i === idx ? { ...item, question: value } : item))
      return type === 'icebreakers' ? { ...prev, icebreakers: nextArr } : { ...prev, closing: nextArr }
    })
  }

  const handleAddQuestion = () => {
    if (!selectedOptionId) return
    const list = questionsByOption[selectedOptionId] ?? []
    const newQuestion: Question = { id: `q-${selectedOptionId}-${Date.now()}`, question: '' }
    setQuestionsByOption((prev) => ({ ...prev, [selectedOptionId]: [...list, newQuestion] }))
  }

  const handleDeleteQuestion = (id: string) => {
    if (!selectedOptionId) return
    const list = (questionsByOption[selectedOptionId] ?? []).filter((q) => q.id !== id)
    setQuestionsByOption((prev) => ({ ...prev, [selectedOptionId]: list }))
  }

  const handleQuestionChange = (id: string, value: string) => {
    if (!selectedOptionId) return
    const list = questionsByOption[selectedOptionId] ?? []
    setQuestionsByOption((prev) => ({ ...prev, [selectedOptionId]: list.map((q) => (q.id === id ? { ...q, question: value } : q)) }))
  }

  const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
    if (!selectedOptionId) return
    const list = [...questions]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= list.length) return
    ;[list[index], list[newIndex]] = [list[newIndex], list[index]]
    setQuestionsByOption((prev) => ({ ...prev, [selectedOptionId]: list }))
  }

  const openTemplateModal = () => {
    if (!selectedOption) return
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
    if (!selectedOption) return
    const template = JOB_TYPE_TEMPLATES[selectedOption.jobType as JobTypeKey] ?? JOB_TYPE_TEMPLATES['その他']
    const toAdd = template.questions.filter((_, i) => selectedTemplateQuestionIds.has(i))
    if (toAdd.length === 0) return
    const list = questionsByOption[selectedOptionId] ?? []
    const insertIdx = Math.min(Math.max(0, insertAt), list.length)
    const newQs: Question[] = toAdd.map((q, i) => ({ id: `q-${selectedOptionId}-${Date.now()}-${i}`, question: q }))
    setQuestionsByOption((prev) => ({ ...prev, [selectedOptionId]: [...list.slice(0, insertIdx), ...newQs, ...list.slice(insertIdx)] }))
    setTemplateModalOpen(false)
    setSelectedTemplateQuestionIds(new Set())
    showToast(`${toAdd.length}件の質問を追加しました`)
  }

  const handleReplaceAllWithTemplate = () => {
    if (!selectedOption) return
    if (!window.confirm('現在の質問を全てテンプレートに置き換えますか？')) return
    const template = JOB_TYPE_TEMPLATES[selectedOption.jobType as JobTypeKey] ?? JOB_TYPE_TEMPLATES['その他']
    const newQuestions: Question[] = template.questions.map((q, i) => ({ id: `q-${selectedOptionId}-${Date.now()}-${i}`, question: q }))
    setQuestionsByOption((prev) => ({ ...prev, [selectedOptionId]: newQuestions }))
    setTemplateModalOpen(false)
    setSelectedTemplateQuestionIds(new Set())
    showToast(`${template.name}テンプレートで全て置き換えました`)
  }

  const handleSaveQuestions = () => {
    showToast('質問設定を保存しました')
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

  return (
    <div className="min-w-0 max-w-[100vw] pb-10">
      <div className="flex flex-col gap-4 mb-6">
        <h1 className={`text-2xl font-bold ${cn.title}`}>面接質問設定</h1>
        <p className={`text-sm ${cn.subtext}`}>求人ごとに面接で使用する質問を設定できます。</p>
      </div>

      <div className="mb-6">
        <label className={`block text-sm font-medium mb-2 ${cn.label}`}>求人を選択</label>
        {DUMMY_JOBS.length === 0 ? (
          <div className={`rounded-xl border p-6 text-center ${cn.emptyCard}`}>
            <p className={`mb-4 ${cn.subtext}`}>求人が登録されていません。先に求人管理から求人を作成してください。</p>
            <JobsLink />
          </div>
        ) : (
          <select
            value={selectedOptionId}
            onChange={(e) => setSelectedOptionId(e.target.value)}
            className={`w-full md:w-auto min-w-[300px] px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:border-transparent outline-none ${cn.select}`}
          >
            <option value="">求人を選択してください</option>
            {questionOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {selectedOptionId && selectedOption ? (
        <>
          <div className={`mb-8 rounded-xl border p-6 ${cn.card}`}>
            <h2 className={`text-base font-semibold mb-2 ${cn.title}`}>共通質問（全求人共通）</h2>
            <p className={`text-sm mb-4 ${cn.subtext}`}>すべての面接で冒頭とクロージングに自動挿入されます。個別に編集可能です。</p>
            <div className="space-y-4">
              {commonQuestions.icebreakers.map((cq) => (
                <div key={cq.id} className={`rounded-xl border p-4 ${cn.innerCard}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className={`text-xs font-semibold ${cn.label}`}>{cq.label}（{cq.category}）</p>
                    {editingCommonId === cq.id ? (
                      <button type="button" onClick={() => setEditingCommonId(null)} className={`text-xs font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-indigo-600 hover:text-indigo-700'}`}>保存</button>
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
              {commonQuestions.closing.map((cq) => (
                <div key={cq.id} className={`rounded-xl border p-4 ${cn.innerCard}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className={`text-xs font-semibold ${cn.label}`}>{cq.label}（{cq.category}）</p>
                    {editingCommonId === cq.id ? (
                      <button type="button" onClick={() => setEditingCommonId(null)} className={`text-xs font-medium ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-indigo-600 hover:text-indigo-700'}`}>保存</button>
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

          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className={`text-base font-semibold ${cn.title}`}>本質問</h2>
                <p className={`text-sm mt-1 ${cn.subtext}`}>選択中の求人で使用する面接質問です。</p>
              </div>
              <button type="button" onClick={openTemplateModal} className={`inline-flex items-center gap-2 px-4 py-2 border text-sm font-medium rounded-xl transition-colors ${cn.btnTemplate}`}>
                <FileText className="w-4 h-4" />テンプレートから読み込み
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={q.id} className={`rounded-xl border p-5 transition-all ${cn.innerCard} ${!isDark && 'shadow-sm hover:shadow-md'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button type="button" onClick={() => handleMoveQuestion(i, 'up')} disabled={i === 0} className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'text-gray-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}><ChevronUp className="w-5 h-5" /></button>
                      <button type="button" onClick={() => handleMoveQuestion(i, 'down')} disabled={i === questions.length - 1} className={`p-1 disabled:opacity-30 disabled:cursor-not-allowed ${isDark ? 'text-gray-500 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}><ChevronDown className="w-5 h-5" /></button>
                    </div>
                    <span className={`shrink-0 mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${isDark ? 'bg-white/10 text-gray-300' : 'bg-indigo-100 text-indigo-700'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <textarea value={q.question} onChange={(e) => handleQuestionChange(q.id, e.target.value)} placeholder="質問文を入力してください" rows={2} className={`w-full px-4 py-2.5 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 ${cn.input}`} />
                    </div>
                    <button type="button" onClick={() => handleDeleteQuestion(q.id)} className={`shrink-0 p-2 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}><Trash2 className="w-5 h-5" /></button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={handleAddQuestion} className={`mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed text-sm font-medium rounded-xl transition-colors ${cn.btnAdd}`}>
              <Plus className="w-5 h-5" />質問を追加
            </button>
          </div>

          <div className="mt-8 flex justify-end">
            <button type="button" onClick={handleSaveQuestions} className={`px-6 py-2.5 text-white text-sm font-semibold rounded-xl transition-all ${isDark ? `bg-gradient-to-r ${cn.btnSave} shadow-[0_4px_16px_rgba(59,130,246,0.3)]` : cn.btnSave}`}>
              変更を保存
            </button>
          </div>

          {templateModalOpen && selectedOption && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={(e) => e.target === e.currentTarget && (setTemplateModalOpen(false), setSelectedTemplateQuestionIds(new Set()))}>
              <div className={`rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto border ${cn.modal}`} onClick={(e) => e.stopPropagation()}>
                <h3 className={`text-lg font-bold mb-4 ${cn.title}`}>テンプレートから読み込み</h3>
                <p className={`text-sm mb-2 ${cn.modalText}`}>現在選択中: <strong className={cn.modalStrong}>{selectedOption.label}</strong></p>
                <p className={`text-sm mb-2 ${cn.modalText}`}>職種: <strong className={cn.modalStrong}>{selectedOption.jobType}</strong></p>
                <p className={`text-sm mb-4 ${cn.modalText}`}>質問を選択してください（複数選択可）</p>
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {(JOB_TYPE_TEMPLATES[selectedOption.jobType as JobTypeKey] ?? JOB_TYPE_TEMPLATES['その他']).questions.map((q, idx) => (
                    <label key={idx} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer ${isDark ? 'border-white/[0.06] hover:bg-white/[0.04]' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={selectedTemplateQuestionIds.has(idx)} onChange={() => toggleTemplateQuestion(idx)} className={`mt-1 rounded ${isDark ? 'border-gray-500 text-blue-500 focus:ring-blue-500' : 'border-gray-300 text-indigo-600 focus:ring-indigo-500'}`} />
                      <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{q}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-2 mb-4">
                  <label className={`block text-sm font-medium ${cn.label}`}>挿入位置</label>
                  <select value={insertAt} onChange={(e) => setInsertAt(Number(e.target.value))} className={`w-full px-4 py-2 border rounded-lg text-sm ${cn.select}`}>
                    <option value={0}>先頭</option>
                    {questions.map((_, i) => (<option key={i} value={i + 1}>{`${i + 1}番目の後`}</option>))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleAddSelectedQuestions} disabled={selectedTemplateQuestionIds.size === 0} className={`inline-flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl ${isDark ? 'bg-blue-600 hover:bg-blue-500' : 'bg-indigo-600 hover:bg-indigo-700'} disabled:opacity-50 disabled:cursor-not-allowed`}>
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
      ) : selectedOptionId === '' && DUMMY_JOBS.length > 0 ? (
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

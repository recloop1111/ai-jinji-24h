'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, FileText, HelpCircle, Check, ChevronRight, Pencil, X } from 'lucide-react'

const EVALUATION_AXES = [
  'コミュニケーション',
  '論理的思考',
  'カルチャーフィット',
  '仕事への意欲',
  '課題対応力',
  '成長可能性',
]

type Question = {
  id: string
  number: number
  text: string
  axis: string
}

type CommonQuestionItem = { id: string; label: string; category: string; question: string }

// app/admin/(dashboard)/companies/[id]/page.tsx と同じデータ
const COMMON_QUESTIONS: { icebreakers: CommonQuestionItem[]; closing: CommonQuestionItem[] } = {
  icebreakers: [
    { id: 'ice-1', label: '冒頭1', category: 'アイスブレイク', question: '本日はお時間をいただきありがとうございます。これから約30〜40分の面接を行います。途中で聞き取りにくい点があれば遠慮なくお知らせください。本日の体調は問題ありませんか？' },
    { id: 'ice-2', label: '冒頭2', category: 'アイスブレイク', question: 'ありがとうございます。面接を始める前に、最近あった嬉しかったことや、ちょっとした楽しみにしていることがあれば気軽に教えてください。' },
  ],
  closing: [
    { id: 'close-1', label: 'クロージング', category: 'クロージング', question: '面接は以上となります。最後に、何かご質問や伝えておきたいことはありますか？本日はお忙しい中、ありがとうございました。' },
  ],
}

type AdminQuestionItem = { id: number; category: string; question: string; followUp: boolean; followUpMax: number; axes: string[] }

// app/admin/(dashboard)/companies/[id]/page.tsx の QUESTIONS_BY_PATTERN をそのまま使用
const QUESTIONS_BY_PATTERN: Record<string, AdminQuestionItem[]> = {
  'fulltime-new-graduate': [
    { id: 1, category: '自己紹介', question: '自己紹介をお願いします。大学での専攻や、学生時代に力を入れてきたことを中心に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 2, category: '志望動機', question: 'この業界や職種に興味を持ったきっかけと、志望された理由を教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '組織適合性'] },
    { id: 3, category: 'ガクチカ', question: '学生時代に最も力を入れたことについて、目標・取り組み・結果を具体的に教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 4, category: '困難な経験', question: 'これまでに困難や壁にぶつかった経験と、それをどのように乗り越えたか教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
    { id: 5, category: 'チームワーク', question: 'グループやチームで取り組んだ経験について教えてください。その中であなたはどんな役割を担いましたか？', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 6, category: '自己分析', question: 'ご自身の強みと弱みをそれぞれ教えてください。弱みに対してどのような改善を心がけていますか？', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 7, category: '研究・学び', question: '大学の授業やゼミ、研究の中で、特に興味を持って取り組んだテーマがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 8, category: '働く価値観', question: '社会人として働く上で、大切にしたいと考えている価値観や、理想の働き方を教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性', '主体性・意欲'] },
    { id: 9, category: 'キャリアビジョン', question: '入社後、3年後・5年後にどのように成長していきたいですか？目指す姿を教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'fulltime-mid-experienced': [
    { id: 1, category: '自己紹介', question: 'まず自己紹介をお願いします。これまでのご経歴と、直近の業務内容を中心に教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 2, category: '転職理由', question: '今回転職を考えられた理由と、この職種に応募された動機を教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '組織適合性'] },
    { id: 3, category: '過去の実績', question: 'これまでの業務で最も成果を上げた経験について、課題・アプローチ・結果を具体的に教えてください。', followUp: true, followUpMax: 2, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 4, category: '困難な経験', question: '仕事で困難に直面した経験と、それをどのように乗り越えたか教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
    { id: 5, category: 'マネジメント', question: 'チームやプロジェクトをリードした経験があれば教えてください。何名規模で、どのような役割でしたか？', followUp: true, followUpMax: 1, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 6, category: '専門スキル', question: '現在お持ちの専門スキルや知識の中で、この職種で最も活かせると考えているものは何ですか？', followUp: true, followUpMax: 1, axes: ['業界適性・経験値', '論理的思考力'] },
    { id: 7, category: '働き方', question: '仕事を進める上で大切にしているスタイルや、こだわりがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
    { id: 8, category: '自己課題', question: 'ご自身の課題や、今後伸ばしていきたいスキルがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 9, category: 'キャリアビジョン', question: '3年後、5年後にどのようなキャリアを描いていますか？この会社で実現したいことを教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'fulltime-mid-inexperienced': [
    { id: 1, category: '自己紹介', question: 'まず自己紹介をお願いします。これまでの経歴や、現在取り組んでいることを教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 2, category: '志望動機', question: '未経験の分野に挑戦しようと思ったきっかけや理由を教えてください。', followUp: true, followUpMax: 2, axes: ['主体性・意欲', '組織適合性'] },
    { id: 3, category: '前職経験', question: '前職ではどのような業務をされていましたか？そこで得たスキルや経験を教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 4, category: '学習意欲', question: '新しいスキルや知識を身につけるために、これまでどのような取り組みをしてきましたか？', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 5, category: '困難な経験', question: 'これまでの仕事や人生で、困難を乗り越えた経験を教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '主体性・意欲'] },
    { id: 6, category: '転用スキル', question: 'これまでの経験の中で、この仕事に活かせると感じているスキルや経験があれば教えてください。', followUp: true, followUpMax: 1, axes: ['業界適性・経験値', '組織適合性'] },
    { id: 7, category: '適応力', question: '新しい環境に馴染む際に、ご自身が意識していることや心がけていることはありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 8, category: '自己分析', question: 'ご自身の強みと、それをこの仕事でどう活かせると考えていますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力'] },
    { id: 9, category: 'キャリアビジョン', question: 'この仕事を通じて、将来どのように成長していきたいですか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'parttime-experienced': [
    { id: 1, category: '自己紹介', question: '簡単に自己紹介をお願いします。これまでのアルバイト経験や、現在の状況を教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力'] },
    { id: 2, category: '志望動機', question: '今回応募された理由と、これまでの経験で活かせることを教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '業界適性・経験値'] },
    { id: 3, category: '過去の経験', question: '以前のアルバイトで、自分なりに工夫して取り組んだことや、成果を出した経験があれば教えてください。', followUp: true, followUpMax: 1, axes: ['論理的思考力', '業界適性・経験値'] },
    { id: 4, category: '対応力', question: '接客や業務中にトラブルやクレームがあった場合、どのように対応しますか？過去の経験があれば教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 5, category: 'チームワーク', question: '職場の仲間と協力して仕事を進める上で、大切にしていることは何ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 6, category: '勤務条件', question: '希望する勤務日数や時間帯を教えてください。また、いつから勤務開始可能ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
    { id: 7, category: 'ストレス対処', question: '忙しい時間帯や大変な場面で、ご自身がどのように気持ちを切り替えているか教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
    { id: 8, category: '長所', question: 'ご自身の長所や、周囲から評価されていると感じる点を教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '組織適合性'] },
    { id: 9, category: '目標', question: 'このアルバイトを通じて達成したいことや、身につけたいスキルがあれば教えてください。', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
  'parttime-inexperienced': [
    { id: 1, category: '自己紹介', question: '簡単に自己紹介をお願いします。普段どのような生活をされているか教えてください。', followUp: true, followUpMax: 1, axes: ['コミュニケーション力'] },
    { id: 2, category: '志望動機', question: '今回このお仕事に応募しようと思った理由を教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲'] },
    { id: 3, category: '日常の経験', question: '学校生活や日常の中で、自分なりに頑張った経験や、工夫して取り組んだことがあれば教えてください。', followUp: true, followUpMax: 1, axes: ['主体性・意欲', '論理的思考力'] },
    { id: 4, category: 'コミュニケーション', question: '人と接する時に心がけていることや、意識していることはありますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '組織適合性'] },
    { id: 5, category: '勤務条件', question: '希望する勤務日数や時間帯を教えてください。また、いつから勤務開始可能ですか？', followUp: false, followUpMax: 0, axes: ['組織適合性'] },
    { id: 6, category: '適応力', question: '新しい場所や環境に慣れるために、自分なりに工夫していることはありますか？', followUp: false, followUpMax: 0, axes: ['組織適合性', 'コミュニケーション力'] },
    { id: 7, category: '自己PR', question: 'ご自身の長所や、周りの人からよく言われることを教えてください。', followUp: false, followUpMax: 0, axes: ['コミュニケーション力'] },
    { id: 8, category: '困った場面', question: 'もし仕事中に分からないことがあった場合、どのように行動しますか？', followUp: false, followUpMax: 0, axes: ['コミュニケーション力', '論理的思考力'] },
    { id: 9, category: '意欲', question: 'このお仕事を通じて、どんなことを学びたい、身につけたいと考えていますか？', followUp: false, followUpMax: 0, axes: ['主体性・意欲'] },
  ],
}

type Pattern = { id: string; label: string }

// 初期5パターン（企業が追加・編集・削除可能）
const INITIAL_PATTERNS: Pattern[] = [
  { id: 'fulltime-new-graduate', label: '正社員 × 新卒' },
  { id: 'fulltime-mid-experienced', label: '正社員 × 中途 × 経験者' },
  { id: 'fulltime-mid-inexperienced', label: '正社員 × 中途 × 未経験' },
  { id: 'parttime-experienced', label: 'アルバイト × 経験者' },
  { id: 'parttime-inexperienced', label: 'アルバイト × 未経験' },
]

// TODO: Phase 4 - Supabaseでパターンデータを保存・取得

function toClientQuestion(q: AdminQuestionItem, patternKey: string, index: number): Question {
  return {
    id: `q-${patternKey}-${q.id}-${index}`,
    number: index + 1,
    text: q.question,
    axis: q.axes[0] ?? 'コミュニケーション',
  }
}

function initQuestionsByPattern(patterns: Pattern[]): Record<string, Question[]> {
  return Object.fromEntries(
    patterns.map((p) => [
      p.id,
      (QUESTIONS_BY_PATTERN[p.id] ?? []).map((q, i) => toClientQuestion(q, p.id, i)),
    ])
  )
}

// テンプレート定義（テンプレート読み込み用・従来の5カテゴリ）
const TEMPLATES = {
  general: { name: '総合職向け', questions: [{ text: 'これまでのご経歴を簡単に教えてください', axis: 'コミュニケーション' }, { text: '志望動機を教えてください', axis: 'カルチャーフィット' }, { text: 'あなたの強みと弱みを教えてください', axis: 'コミュニケーション' }, { text: 'チームで働いた経験を教えてください', axis: 'コミュニケーション' }, { text: '5年後のキャリアプランを教えてください', axis: '成長可能性' }] },
  engineer: { name: 'エンジニア向け', questions: [{ text: 'これまでの開発経験を教えてください', axis: '論理的思考' }, { text: '最も技術的に挑戦した経験を教えてください', axis: '課題対応力' }, { text: 'チーム開発での役割を教えてください', axis: 'コミュニケーション' }, { text: '新しい技術をどのように学んでいますか', axis: '成長可能性' }, { text: 'コードレビューで意識していることを教えてください', axis: '論理的思考' }] },
  sales: { name: '営業職向け', questions: [{ text: 'これまでの営業経験を教えてください', axis: 'コミュニケーション' }, { text: '最も大きな成果を上げた経験を教えてください', axis: '仕事への意欲' }, { text: '顧客との信頼関係をどう築きますか', axis: 'コミュニケーション' }, { text: '目標未達時にどう対応しますか', axis: '課題対応力' }, { text: '新規開拓で工夫していることを教えてください', axis: '仕事への意欲' }] },
  support: { name: 'カスタマーサポート向け', questions: [{ text: 'これまでの顧客対応経験を教えてください', axis: 'コミュニケーション' }, { text: 'クレーム対応で心がけていることを教えてください', axis: '課題対応力' }, { text: '難しい要望にどう対応しますか', axis: '課題対応力' }, { text: 'チームでの情報共有で工夫していることを教えてください', axis: 'コミュニケーション' }, { text: 'ストレス管理の方法を教えてください', axis: '成長可能性' }] },
  manager: { name: 'マネージャー向け', questions: [{ text: 'これまでのマネジメント経験を教えてください', axis: 'コミュニケーション' }, { text: 'チームのモチベーション管理で工夫していることを教えてください', axis: '仕事への意欲' }, { text: '部下の育成で意識していることを教えてください', axis: '成長可能性' }, { text: '困難なプロジェクトをどう乗り越えましたか', axis: '課題対応力' }, { text: '組織の課題をどう改善しましたか', axis: '論理的思考' }] },
}

export default function QuestionsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>(() => [...INITIAL_PATTERNS])
  const [activePatternId, setActivePatternId] = useState<string>(() => INITIAL_PATTERNS[0].id)
  const [questionsByPattern, setQuestionsByPattern] = useState<Record<string, Question[]>>(() => initQuestionsByPattern(INITIAL_PATTERNS))
  const [addPatternModalOpen, setAddPatternModalOpen] = useState(false)
  const [newPatternName, setNewPatternName] = useState('')
  const [editingPatternId, setEditingPatternId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isPatternEditMode, setIsPatternEditMode] = useState(false)
  const [commonQuestions, setCommonQuestions] = useState(() => ({
    icebreakers: COMMON_QUESTIONS.icebreakers.map((x) => ({ ...x })),
    closing: COMMON_QUESTIONS.closing.map((x) => ({ ...x })),
  }))
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateStep, setTemplateStep] = useState<'category' | 'questions'>('category')
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof TEMPLATES | null>(null)
  const [selectedTemplateQuestionIds, setSelectedTemplateQuestionIds] = useState<Set<number>>(new Set())
  const [insertAt, setInsertAt] = useState<number>(0)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  const questions = questionsByPattern[activePatternId] ?? []
  const activePattern = patterns.find((p) => p.id === activePatternId)

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }

  const detectAxisFromQuestion = (questionText: string): string => {
    if (!questionText.trim()) return 'コミュニケーション'
    const text = questionText.toLowerCase()
    if (text.includes('自己紹介') || text.includes('経歴')) return 'コミュニケーション'
    if (text.includes('志望') || text.includes('応募') || text.includes('理由')) return 'カルチャーフィット'
    if (text.includes('力を入れた') || text.includes('頑張った') || text.includes('取り組んだ')) return '仕事への意欲'
    if (text.includes('困難') || text.includes('壁') || text.includes('乗り越え') || text.includes('課題')) return '課題対応力'
    if (text.includes('成長') || text.includes('将来') || text.includes('今後') || text.includes('未来')) return '成長可能性'
    if (text.includes('論理') || text.includes('思考') || text.includes('分析')) return '論理的思考'
    return 'コミュニケーション'
  }

  const handleAddQuestion = () => {
    const list = questionsByPattern[activePatternId] ?? []
    const newQuestion: Question = {
      id: `q-${activePatternId}-${Date.now()}`,
      number: list.length + 1,
      text: '',
      axis: 'コミュニケーション',
    }
    setQuestionsByPattern((prev) => ({
      ...prev,
      [activePatternId]: [...list, newQuestion],
    }))
  }

  const handleDeleteQuestion = (id: string) => {
    const list = (questionsByPattern[activePatternId] ?? []).filter((q) => q.id !== id).map((q, i) => ({ ...q, number: i + 1 }))
    setQuestionsByPattern((prev) => ({ ...prev, [activePatternId]: list }))
  }

  const handleQuestionChange = (id: string, field: 'text' | 'axis', value: string) => {
    const list = questionsByPattern[activePatternId] ?? []
    if (field === 'text') {
      const detectedAxis = detectAxisFromQuestion(value)
      setQuestionsByPattern((prev) => ({
        ...prev,
        [activePatternId]: list.map((q) => (q.id === id ? { ...q, text: value, axis: detectedAxis } : q)),
      }))
    } else {
      setQuestionsByPattern((prev) => ({
        ...prev,
        [activePatternId]: list.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
      }))
    }
  }

  const handleAddPattern = () => {
    const name = newPatternName.trim()
    if (!name) return
    const id = `custom-${Date.now()}`
    setPatterns((prev) => [...prev, { id, label: name }])
    setQuestionsByPattern((prev) => ({ ...prev, [id]: [] }))
    setActivePatternId(id)
    setAddPatternModalOpen(false)
    setNewPatternName('')
    showToast(`パターン「${name}」を追加しました`)
  }

  const handleStartEditPattern = (p: Pattern) => {
    setEditingPatternId(p.id)
    setEditingLabel(p.label)
  }

  const handleConfirmEditPattern = () => {
    if (editingPatternId == null || !editingLabel.trim()) {
      setEditingPatternId(null)
      return
    }
    setPatterns((prev) => prev.map((x) => (x.id === editingPatternId ? { ...x, label: editingLabel.trim() } : x)))
    setEditingPatternId(null)
  }

  const openDeleteConfirm = (id: string) => {
    if (patterns.length <= 1) return
    setDeleteConfirmId(id)
  }

  const handleDeletePattern = (id: string) => {
    setPatterns((prev) => prev.filter((p) => p.id !== id))
    setQuestionsByPattern((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    if (activePatternId === id) {
      const remaining = patterns.filter((p) => p.id !== id)
      setActivePatternId(remaining[0]?.id ?? '')
    }
    setDeleteConfirmId(null)
    showToast('パターンを削除しました')
  }

  const openTemplateModal = () => {
    setTemplateModalOpen(true)
    setTemplateStep('category')
    setSelectedCategory(null)
    setSelectedTemplateQuestionIds(new Set())
  }

  const handleSelectCategory = (key: keyof typeof TEMPLATES) => {
    setSelectedCategory(key)
    setTemplateStep('questions')
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
    if (!selectedCategory) return
    const template = TEMPLATES[selectedCategory]
    const toAdd = template.questions.filter((_, i) => selectedTemplateQuestionIds.has(i))
    if (toAdd.length === 0) return
    const list = questionsByPattern[activePatternId] ?? []
    const insertIdx = Math.min(Math.max(0, insertAt), list.length)
    const newQs = toAdd.map((q, i) => ({
      id: `q-${activePatternId}-${Date.now()}-${i}`,
      number: insertIdx + i + 1,
      text: q.text,
      axis: q.axis,
    }))
    const before = list.slice(0, insertIdx).map((q, i) => ({ ...q, number: i + 1 }))
    const after = list.slice(insertIdx).map((q, i) => ({ ...q, number: insertIdx + toAdd.length + i + 1 }))
    const renumbered = [...before, ...newQs, ...after].map((q, i) => ({ ...q, number: i + 1 }))
    setQuestionsByPattern((prev) => ({ ...prev, [activePatternId]: renumbered }))
    setTemplateModalOpen(false)
    setTemplateStep('category')
    setSelectedCategory(null)
    setSelectedTemplateQuestionIds(new Set())
    showToast(`${toAdd.length}件の質問を追加しました`)
  }

  const handleReplaceAllWithTemplate = () => {
    if (!selectedCategory) return
    const confirmed = window.confirm('現在の質問を全てテンプレートに置き換えますか？')
    if (!confirmed) return
    const template = TEMPLATES[selectedCategory]
    const newQuestions = template.questions.map((q, i) => ({
      id: `q-${activePatternId}-${Date.now()}-${i}`,
      number: i + 1,
      text: q.text,
      axis: q.axis,
    }))
    setQuestionsByPattern((prev) => ({ ...prev, [activePatternId]: newQuestions }))
    setTemplateModalOpen(false)
    setTemplateStep('category')
    setSelectedCategory(null)
    showToast(`${template.name}テンプレートで全て置き換えました（${activePattern?.label}）`)
  }

  const handleSave = () => {
    showToast('保存しました')
  }

  const handleDragStart = (index: number) => setDraggedIndex(index)
  const handleDragEnd = () => setDraggedIndex(null)

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    const list = [...questions]
    const [draggedItem] = list.splice(draggedIndex, 1)
    list.splice(index, 0, draggedItem)
    const renumbered = list.map((q, i) => ({ ...q, number: i + 1 }))
    setQuestionsByPattern((prev) => ({ ...prev, [activePatternId]: renumbered }))
    setDraggedIndex(index)
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

  return (
    <div className="min-w-0 max-w-[100vw] pb-10">
      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">面接質問設定</h1>
        <p className="text-sm text-slate-500">
          面接で使用する質問を自由に作成・編集できます。5パターンごとに独立した質問リストを管理し、ドラッグ＆ドロップで並び替え可能です。
        </p>
      </div>

      {/* パターン切り替えタブ */}
      <div className="mb-4">
        <p className="text-sm font-medium text-slate-700 mb-2">面接パターン</p>
        <div className="flex flex-wrap items-center gap-2">
          {patterns.map((p) => (
            <div
              key={p.id}
              className={`inline-flex items-center gap-1 rounded-xl text-sm font-medium transition-colors ${
                activePatternId === p.id && editingPatternId !== p.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              {editingPatternId === p.id ? (
                <input
                  type="text"
                  value={editingLabel}
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmEditPattern()
                    if (e.key === 'Escape') setEditingPatternId(null)
                  }}
                  onBlur={handleConfirmEditPattern}
                  autoFocus
                  className="px-3 py-2 min-w-[120px] rounded-l-xl text-slate-900 bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActivePatternId(p.id)}
                    className={`px-4 py-2.5 text-left rounded-l-xl ${isPatternEditMode ? '' : 'rounded-r-xl'} hover:bg-indigo-500/10`}
                  >
                    {p.label}
                  </button>
                  {isPatternEditMode && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleStartEditPattern(p) }}
                        className={`p-2 rounded-lg transition-colors ${activePatternId === p.id ? 'hover:bg-white/20' : 'hover:bg-slate-100'}`}
                        aria-label="パターン名を編集"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openDeleteConfirm(p.id) }}
                        disabled={patterns.length <= 1}
                        className={`p-2 rounded-r-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${activePatternId === p.id ? 'hover:bg-white/20' : 'hover:bg-slate-100'}`}
                        aria-label="パターンを削除"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => (setAddPatternModalOpen(true), setNewPatternName(''))}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 text-sm font-medium hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新規追加
          </button>
        </div>
      </div>

      {/* パターン編集モード切替 */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => {
            if (isPatternEditMode) {
              setIsPatternEditMode(false)
              setEditingPatternId(null)
            } else {
              setIsPatternEditMode(true)
            }
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
        >
          {isPatternEditMode ? (
            <>編集を終了</>
          ) : (
            <>
              <Pencil className="w-4 h-4" />
              パターンを編集
            </>
          )}
        </button>
      </div>

      {/* 共通質問（アイスブレイク2問・クロージング1問） */}
      <div className="mb-8 bg-slate-50 rounded-xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-2">共通質問（全パターン共通）</h2>
        <p className="text-sm text-slate-500 mb-4">すべてのパターンで冒頭とクロージングに自動挿入されます。個別に編集可能です。</p>
        <div className="space-y-4">
          {commonQuestions.icebreakers.map((cq) => (
            <div key={cq.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-2">{cq.label}（{cq.category}）</p>
              <textarea
                value={cq.question}
                onChange={(e) => handleCommonQuestionChange(cq.id, e.target.value, 'icebreakers')}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-sm text-slate-800 resize-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
          ))}
          {commonQuestions.closing.map((cq) => (
            <div key={cq.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-2">{cq.label}（{cq.category}）</p>
              <textarea
                value={cq.question}
                onChange={(e) => handleCommonQuestionChange(cq.id, e.target.value, 'closing')}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 rounded-xl text-sm text-slate-800 resize-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
          ))}
        </div>
      </div>

      {/* パターン別質問リスト */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            {activePattern?.label} の質問リスト
          </h2>
          <button
            type="button"
            onClick={openTemplateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            テンプレートから読み込み
          </button>
        </div>

        <div className="space-y-4">
          {questions.map((question, index) => (
            <div
              key={question.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all ${draggedIndex === index ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button type="button" className="mt-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing" aria-label="並び替え">
                  <GripVertical className="w-5 h-5" />
                </button>
                <span className="shrink-0 mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">
                  {question.number}
                </span>
                <div className="flex-1 min-w-0">
                  <textarea
                    value={question.text}
                    onChange={(e) => handleQuestionChange(question.id, 'text', e.target.value)}
                    placeholder="質問文を入力してください"
                    rows={2}
                    className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
                  />
                  {question.text.trim() && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg border border-slate-200">
                        AI自動判定：{question.axis}
                      </span>
                      <div className="group relative">
                        <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                          質問内容をAIが分析し、最適な評価軸を自動で割り当てます
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(question.id)}
                  className="shrink-0 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="削除"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddQuestion}
          className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 border-2 border-dashed border-indigo-200 text-indigo-700 text-sm font-medium rounded-xl hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
        >
          <Plus className="w-5 h-5" />
          質問を追加
        </button>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-md"
        >
          保存
        </button>
      </div>

      {/* テンプレート選択モーダル */}
      {templateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => e.target === e.currentTarget && (setTemplateModalOpen(false), setTemplateStep('category'), setSelectedCategory(null))}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">テンプレートから読み込み</h3>
            <p className="text-sm text-slate-600 mb-2">
              現在選択中: <strong>{activePattern?.label}</strong>
            </p>

            {templateStep === 'category' ? (
              <>
                <p className="text-sm text-slate-600 mb-4">カテゴリを選択してください</p>
                <div className="space-y-2">
                  {Object.entries(TEMPLATES).map(([key, template]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectCategory(key as keyof typeof TEMPLATES)}
                      className="w-full flex items-center justify-between text-left px-4 py-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{template.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{template.questions.length}問</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </button>
                  ))}
                </div>
              </>
            ) : selectedCategory ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button type="button" onClick={() => (setTemplateStep('category'), setSelectedCategory(null), setSelectedTemplateQuestionIds(new Set()))} className="text-sm text-slate-600 hover:text-indigo-600">← 戻る</button>
                  <span className="text-sm text-slate-500">/</span>
                  <span className="text-sm font-medium text-slate-700">{TEMPLATES[selectedCategory].name}</span>
                </div>
                <p className="text-sm text-slate-600 mb-3">質問を選択してください（複数選択可）</p>
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {TEMPLATES[selectedCategory].questions.map((q, idx) => (
                    <label key={idx} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={selectedTemplateQuestionIds.has(idx)} onChange={() => toggleTemplateQuestion(idx)} className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm text-slate-700">{q.text}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-2 mb-4">
                  <label className="block text-sm font-medium text-slate-700">挿入位置</label>
                  <select value={insertAt} onChange={(e) => setInsertAt(Number(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800">
                    <option value={0}>先頭</option>
                    {questions.map((_, i) => (
                      <option key={i} value={i + 1}>{`${i + 1}番目の後`}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleAddSelectedQuestions} disabled={selectedTemplateQuestionIds.size === 0} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Check className="w-4 h-4" />
                    選択した質問を追加（{selectedTemplateQuestionIds.size}件）
                  </button>
                  <button type="button" onClick={handleReplaceAllWithTemplate} className="inline-flex items-center px-4 py-2 border border-amber-300 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-50">
                    全て変更
                  </button>
                </div>
              </>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => (setTemplateModalOpen(false), setTemplateStep('category'), setSelectedCategory(null))} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新規パターン追加モーダル */}
      {addPatternModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => e.target === e.currentTarget && (setAddPatternModalOpen(false), setNewPatternName(''))}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">新規パターン追加</h3>
            <p className="text-sm text-slate-600 mb-4">パターン名を入力してください（例：「契約社員 × 経験者」）</p>
            <input
              type="text"
              value={newPatternName}
              onChange={(e) => setNewPatternName(e.target.value)}
              placeholder="パターン名"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-6"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => (setAddPatternModalOpen(false), setNewPatternName(''))}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleAddPattern}
                disabled={!newPatternName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* パターン削除確認ダイアログ */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirmId(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">パターン削除の確認</h3>
            <p className="text-sm text-slate-600 mb-6">このパターンを削除しますか？質問データも削除されます。</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => handleDeletePattern(deleteConfirmId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

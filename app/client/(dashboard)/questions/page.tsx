'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, FileText, HelpCircle, Check, ChevronRight } from 'lucide-react'

const EVALUATION_AXES = [
  'コミュニケーション',
  '論理的思考',
  'カルチャーフィット',
  '仕事への意欲',
  '課題対応力',
  '成長可能性',
]

// TODO: Phase 4 - Supabaseに質問データを保存
type Question = {
  id: string
  number: number
  text: string
  axis: string
}

// テンプレート定義
const TEMPLATES = {
  general: {
    name: '総合職向け',
    questions: [
      { text: 'これまでのご経歴を簡単に教えてください', axis: 'コミュニケーション' },
      { text: '志望動機を教えてください', axis: 'カルチャーフィット' },
      { text: 'あなたの強みと弱みを教えてください', axis: 'コミュニケーション' },
      { text: 'チームで働いた経験を教えてください', axis: 'コミュニケーション' },
      { text: '5年後のキャリアプランを教えてください', axis: '成長可能性' },
    ],
  },
  engineer: {
    name: 'エンジニア向け',
    questions: [
      { text: 'これまでの開発経験を教えてください', axis: '論理的思考' },
      { text: '最も技術的に挑戦した経験を教えてください', axis: '課題対応力' },
      { text: 'チーム開発での役割を教えてください', axis: 'コミュニケーション' },
      { text: '新しい技術をどのように学んでいますか', axis: '成長可能性' },
      { text: 'コードレビューで意識していることを教えてください', axis: '論理的思考' },
    ],
  },
  sales: {
    name: '営業職向け',
    questions: [
      { text: 'これまでの営業経験を教えてください', axis: 'コミュニケーション' },
      { text: '最も大きな成果を上げた経験を教えてください', axis: '仕事への意欲' },
      { text: '顧客との信頼関係をどう築きますか', axis: 'コミュニケーション' },
      { text: '目標未達時にどう対応しますか', axis: '課題対応力' },
      { text: '新規開拓で工夫していることを教えてください', axis: '仕事への意欲' },
    ],
  },
  support: {
    name: 'カスタマーサポート向け',
    questions: [
      { text: 'これまでの顧客対応経験を教えてください', axis: 'コミュニケーション' },
      { text: 'クレーム対応で心がけていることを教えてください', axis: '課題対応力' },
      { text: '難しい要望にどう対応しますか', axis: '課題対応力' },
      { text: 'チームでの情報共有で工夫していることを教えてください', axis: 'コミュニケーション' },
      { text: 'ストレス管理の方法を教えてください', axis: '成長可能性' },
    ],
  },
  manager: {
    name: 'マネージャー向け',
    questions: [
      { text: 'これまでのマネジメント経験を教えてください', axis: 'コミュニケーション' },
      { text: 'チームのモチベーション管理で工夫していることを教えてください', axis: '仕事への意欲' },
      { text: '部下の育成で意識していることを教えてください', axis: '成長可能性' },
      { text: '困難なプロジェクトをどう乗り越えましたか', axis: '課題対応力' },
      { text: '組織の課題をどう改善しましたか', axis: '論理的思考' },
    ],
  },
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>(() => {
    // デフォルト状態：総合職テンプレートの5問をセット
    return TEMPLATES.general.questions.map((q, i) => ({
      id: `q-${Date.now()}-${i}`,
      number: i + 1,
      text: q.text,
      axis: q.axis,
    }))
  })
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateStep, setTemplateStep] = useState<'category' | 'questions'>('category')
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof TEMPLATES | null>(null)
  const [selectedTemplateQuestionIds, setSelectedTemplateQuestionIds] = useState<Set<number>>(new Set())
  const [insertAt, setInsertAt] = useState<number>(0)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }

  // TODO: Phase 4 - OpenAI APIで質問文を分析し評価軸を自動判定
  const detectAxisFromQuestion = (questionText: string): string => {
    // ダミー実装：質問文の内容から評価軸を推測
    if (!questionText.trim()) return 'コミュニケーション' // デフォルト
    
    const text = questionText.toLowerCase()
    if (text.includes('自己紹介') || text.includes('経歴')) return 'コミュニケーション'
    if (text.includes('志望') || text.includes('応募') || text.includes('理由')) return 'カルチャーフィット'
    if (text.includes('力を入れた') || text.includes('頑張った') || text.includes('取り組んだ')) return '仕事への意欲'
    if (text.includes('困難') || text.includes('壁') || text.includes('乗り越え') || text.includes('課題')) return '課題対応力'
    if (text.includes('成長') || text.includes('将来') || text.includes('今後') || text.includes('未来')) return '成長可能性'
    if (text.includes('論理') || text.includes('思考') || text.includes('分析')) return '論理的思考'
    
    return 'コミュニケーション' // デフォルト
  }

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: `q-${Date.now()}`,
      number: questions.length + 1,
      text: '',
      axis: 'コミュニケーション', // デフォルト値（質問文入力時に自動判定）
    }
    setQuestions([...questions, newQuestion])
  }

  const handleDeleteQuestion = (id: string) => {
    const newQuestions = questions.filter((q) => q.id !== id).map((q, i) => ({ ...q, number: i + 1 }))
    setQuestions(newQuestions)
  }

  const handleQuestionChange = (id: string, field: 'text' | 'axis', value: string) => {
    if (field === 'text') {
      // 質問文が変更されたら、評価軸を自動判定
      // TODO: Phase 4 - OpenAI APIで質問文を分析し評価軸を自動判定
      const detectedAxis = detectAxisFromQuestion(value)
      setQuestions(questions.map((q) => (q.id === id ? { ...q, text: value, axis: detectedAxis } : q)))
    } else {
      // axisフィールドの変更は通常発生しない（読み取り専用）
      setQuestions(questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)))
    }
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
    const insertIdx = Math.min(Math.max(0, insertAt), questions.length)
    const newQs = toAdd.map((q, i) => ({
      id: `q-${Date.now()}-${i}`,
      number: insertIdx + i + 1,
      text: q.text,
      axis: q.axis,
    }))
    const before = questions.slice(0, insertIdx).map((q, i) => ({ ...q, number: i + 1 }))
    const after = questions.slice(insertIdx).map((q, i) => ({ ...q, number: insertIdx + toAdd.length + i + 1 }))
    const renumbered = [...before, ...newQs, ...after].map((q, i) => ({ ...q, number: i + 1 }))
    setQuestions(renumbered)
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
      id: `q-${Date.now()}-${i}`,
      number: i + 1,
      text: q.text,
      axis: q.axis,
    }))
    setQuestions(newQuestions)
    setTemplateModalOpen(false)
    setTemplateStep('category')
    setSelectedCategory(null)
    showToast(`${template.name}テンプレートで全て置き換えました`)
  }

  const handleSave = () => {
    // TODO: Phase 4 - Supabaseに質問データを保存
    showToast('保存しました')
  }

  // ドラッグ＆ドロップ処理
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newQuestions = [...questions]
    const draggedItem = newQuestions[draggedIndex]
    newQuestions.splice(draggedIndex, 1)
    newQuestions.splice(index, 0, draggedItem)

    // 番号を再割り当て
    const renumberedQuestions = newQuestions.map((q, i) => ({ ...q, number: i + 1 }))
    setQuestions(renumberedQuestions)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">面接質問設定</h1>
          <p className="text-sm text-slate-500 mt-1">
            面接で使用する質問を自由に作成・編集できます。ドラッグ＆ドロップで並び替え可能です。
          </p>
        </div>
        <button
          type="button"
          onClick={openTemplateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
        >
          <FileText className="w-4 h-4" />
          テンプレートから読み込み
        </button>
      </div>

      {/* 質問リスト */}
      <div className="mt-6 space-y-4">
        {questions.map((question, index) => (
          <div
            key={question.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all ${
              draggedIndex === index ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-start gap-3">
              {/* ドラッグハンドル */}
              <button
                type="button"
                className="mt-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                aria-label="並び替え"
              >
                <GripVertical className="w-5 h-5" />
              </button>

              {/* 質問番号 */}
              <span className="shrink-0 mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">
                {question.number}
              </span>

              {/* 質問文入力 */}
              <div className="flex-1 min-w-0">
                <textarea
                  value={question.text}
                  onChange={(e) => handleQuestionChange(question.id, 'text', e.target.value)}
                  placeholder="質問文を入力してください"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none"
                />
                {/* AI自動判定バッジ */}
                {question.text.trim() && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg border border-slate-200">
                      AI自動判定：{question.axis}
                    </span>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        質問内容をAIが分析し、最適な評価軸を自動で割り当てます
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-slate-900 rotate-45"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 削除ボタン */}
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

      {/* 質問追加ボタン */}
      <button
        type="button"
        onClick={handleAddQuestion}
        className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 border-2 border-dashed border-indigo-200 text-indigo-700 text-sm font-medium rounded-xl hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
      >
        <Plus className="w-5 h-5" />
        質問を追加
      </button>

      {/* 保存ボタン */}
      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all shadow-md shadow-indigo-500/20"
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
                  <button
                    type="button"
                    onClick={() => (setTemplateStep('category'), setSelectedCategory(null), setSelectedTemplateQuestionIds(new Set()))}
                    className="text-sm text-slate-600 hover:text-indigo-600"
                  >
                    ← 戻る
                  </button>
                  <span className="text-sm text-slate-500">/</span>
                  <span className="text-sm font-medium text-slate-700">{TEMPLATES[selectedCategory].name}</span>
                </div>
                <p className="text-sm text-slate-600 mb-3">質問を選択してください（複数選択可）</p>
                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
                  {TEMPLATES[selectedCategory].questions.map((q, idx) => (
                    <label
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTemplateQuestionIds.has(idx)}
                        onChange={() => toggleTemplateQuestion(idx)}
                        className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700">{q.text}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-2 mb-4">
                  <label className="block text-sm font-medium text-slate-700">
                    挿入位置（現在の質問リストの何番目に追加するか）
                  </label>
                  <select
                    value={insertAt}
                    onChange={(e) => setInsertAt(Number(e.target.value))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-800"
                  >
                    <option value={0}>先頭</option>
                    {questions.map((_, i) => (
                      <option key={i} value={i + 1}>{`${i + 1}番目の後`}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAddSelectedQuestions}
                    disabled={selectedTemplateQuestionIds.size === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    選択した質問を追加（{selectedTemplateQuestionIds.size}件）
                  </button>
                  <button
                    type="button"
                    onClick={handleReplaceAllWithTemplate}
                    className="inline-flex items-center px-4 py-2 border border-amber-300 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-50"
                  >
                    全て変更
                  </button>
                </div>
              </>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => (setTemplateModalOpen(false), setTemplateStep('category'), setSelectedCategory(null))}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

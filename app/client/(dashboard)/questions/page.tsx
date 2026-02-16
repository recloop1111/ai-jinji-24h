'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, FileText, HelpCircle } from 'lucide-react'

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
      { text: '自己紹介をお願いします。大学での専攻や、学生時代に力を入れてきたことを中心に教えてください。', axis: 'コミュニケーション' },
      { text: 'この業界や職種に興味を持ったきっかけと、志望された理由を教えてください。', axis: 'カルチャーフィット' },
      { text: '学生時代に最も力を入れたことについて、目標・取り組み・結果を具体的に教えてください。', axis: '仕事への意欲' },
      { text: 'これまでに困難や壁にぶつかった経験と、それをどのように乗り越えたか教えてください。', axis: '課題対応力' },
      { text: '入社後、3年後・5年後にどのように成長していきたいですか？目指す姿を教えてください。', axis: '成長可能性' },
    ],
  },
  engineer: {
    name: 'エンジニア向け',
    questions: [
      { text: 'これまでの開発経験や、得意な技術領域について教えてください。', axis: '論理的思考' },
      { text: 'なぜエンジニアを志望されたのですか？技術への興味やきっかけを教えてください。', axis: '仕事への意欲' },
      { text: 'これまでに最も難しかった技術的な課題と、それをどのように解決したか教えてください。', axis: '課題対応力' },
      { text: 'チーム開発での経験があれば教えてください。どのような役割を担いましたか？', axis: 'コミュニケーション' },
      { text: '今後、どのような技術を学び、どのように成長していきたいですか？', axis: '成長可能性' },
    ],
  },
  sales: {
    name: '営業職向け',
    questions: [
      { text: 'これまでの営業経験や、実績について教えてください。', axis: 'コミュニケーション' },
      { text: '営業職に興味を持ったきっかけと、この職種を志望する理由を教えてください。', axis: '仕事への意欲' },
      { text: 'これまでに最も困難だった商談や、断られた経験をどのように乗り越えたか教えてください。', axis: '課題対応力' },
      { text: 'お客様との信頼関係を築くために、どのようなことを心がけていますか？', axis: 'コミュニケーション' },
      { text: '営業として、3年後・5年後にどのような姿を目指していますか？', axis: '成長可能性' },
    ],
  },
  support: {
    name: 'カスタマーサポート向け',
    questions: [
      { text: 'これまでの接客やサポート経験について教えてください。', axis: 'コミュニケーション' },
      { text: 'カスタマーサポート職に興味を持ったきっかけを教えてください。', axis: 'カルチャーフィット' },
      { text: 'お客様からのクレームや難しい問い合わせがあった場合、どのように対応しますか？', axis: '課題対応力' },
      { text: 'チームで協力して業務を進める際に、どのようなことを意識していますか？', axis: 'コミュニケーション' },
      { text: 'サポート業務を通じて、どのように成長していきたいですか？', axis: '成長可能性' },
    ],
  },
  manager: {
    name: 'マネージャー向け',
    questions: [
      { text: 'これまでのマネジメント経験や、チームを率いた経験について教えてください。', axis: 'コミュニケーション' },
      { text: 'マネージャーとして、どのような組織やチームを作りたいと考えていますか？', axis: 'カルチャーフィット' },
      { text: 'これまでに最も困難だったマネジメント上の課題と、それをどのように解決したか教えてください。', axis: '課題対応力' },
      { text: 'チームメンバーのモチベーションを高めるために、どのような取り組みをしてきましたか？', axis: '仕事への意欲' },
      { text: 'マネージャーとして、今後どのように成長していきたいですか？', axis: '成長可能性' },
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

  const handleLoadTemplate = (templateKey: keyof typeof TEMPLATES, confirmOverwrite: boolean) => {
    if (!confirmOverwrite) {
      const confirmed = window.confirm('現在の質問を上書きしますか？')
      if (!confirmed) return
    }
    const template = TEMPLATES[templateKey]
    const newQuestions = template.questions.map((q, i) => ({
      id: `q-${Date.now()}-${i}`,
      number: i + 1,
      text: q.text,
      axis: q.axis,
    }))
    setQuestions(newQuestions)
    setTemplateModalOpen(false)
    showToast(`${template.name}テンプレートを読み込みました`)
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
          onClick={() => setTemplateModalOpen(true)}
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
          onClick={(e) => e.target === e.currentTarget && setTemplateModalOpen(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">テンプレートから読み込み</h3>
            <p className="text-sm text-slate-600 mb-6">
              以下のテンプレートから選択してください。現在の質問は上書きされます。
            </p>
            <div className="space-y-2">
              {Object.entries(TEMPLATES).map(([key, template]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleLoadTemplate(key as keyof typeof TEMPLATES, false)}
                  className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900">{template.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{template.questions.length}問</p>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
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

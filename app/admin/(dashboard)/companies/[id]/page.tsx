'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

const CARD_BASE = 'bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]'

// TODO: 実データに差替え
const INTERVIEW_URL = 'https://ai-jinji24h.com/interview/abc-token-xxxxx'

// TODO: 実データに差替え
type QuestionItem = { id: number; category: string; question: string; followUp: boolean; followUpMax: number; axes: string[] }

type CommonQuestionItem = { id: string; label: string; category: string; question: string; followUp: boolean; followUpMax: number; axes: string[]; scored: boolean }

// TODO: 実データに差替え
const COMMON_QUESTIONS: { icebreakers: CommonQuestionItem[]; closing: CommonQuestionItem[] } = {
  icebreakers: [
    { id: 'ice-1', label: '冒頭1', category: 'アイスブレイク', question: '本日はお時間をいただきありがとうございます。これから約30〜40分の面接を行います。途中で聞き取りにくい点があれば遠慮なくお知らせください。本日の体調は問題ありませんか？', followUp: false, followUpMax: 0, axes: [], scored: false },
    { id: 'ice-2', label: '冒頭2', category: 'アイスブレイク', question: 'ありがとうございます。面接を始める前に、最近あった嬉しかったことや、ちょっとした楽しみにしていることがあれば気軽に教えてください。', followUp: false, followUpMax: 0, axes: [], scored: false },
  ],
  closing: [
    { id: 'close-1', label: 'クロージング', category: 'クロージング', question: '面接は以上となります。最後に、何かご質問や伝えておきたいことはありますか？本日はお忙しい中、ありがとうございました。', followUp: false, followUpMax: 0, axes: [], scored: false },
  ],
}

// TODO: 実データに差替え
const QUESTIONS_BY_PATTERN: Record<string, QuestionItem[]> = {
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

const PATTERN_CONFIG = [
  { id: 'fulltime-new-graduate' as const, label: '正社員 × 新卒', count: 9 },
  { id: 'fulltime-mid-experienced' as const, label: '正社員 × 中途 × 経験者', count: 9 },
  { id: 'fulltime-mid-inexperienced' as const, label: '正社員 × 中途 × 未経験', count: 9 },
  { id: 'parttime-experienced' as const, label: 'アルバイト × 経験者', count: 9 },
  { id: 'parttime-inexperienced' as const, label: 'アルバイト × 未経験', count: 9 },
]

// TODO: 実データに差替え
const EVALUATION_AXES = [
  { name: 'コミュニケーション力', weight: 20 },
  { name: '論理的思考力', weight: 20 },
  { name: '業界適性・経験値', weight: 15 },
  { name: '主体性・意欲', weight: 20 },
  { name: '組織適合性（チームフィット）', weight: 15 },
  { name: 'ストレス耐性', weight: 10 },
]

// TODO: 実データに差替え
const MONTHLY_USAGE = [
  { month: '2025-02', used: 14, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2025-01', used: 18, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2024-12', used: 12, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2024-11', used: 20, limit: 20, plan: 'プランB', atLimit: true },
  { month: '2024-10', used: 8, limit: 20, plan: 'プランB', atLimit: false },
]

const TABS = ['基本情報', 'ブランド設定', 'アバター設定', '質問設定', '評価設定', '利用状況'] as const

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function GripIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </svg>
  )
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

export default function CompanyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('基本情報')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [stopModalOpen, setStopModalOpen] = useState(false)

  // ブランド設定 state
  const [displayName, setDisplayName] = useState('株式会社ABC')
  const [brandColor, setBrandColor] = useState('#2563EB')
  const [completeMessage, setCompleteMessage] = useState('本日は面接にご参加いただき、誠にありがとうございました。選考結果は1週間以内にメールにてご連絡いたします。')

  // アバター設定 state
  const [avatarName, setAvatarName] = useState('採用担当のさくら')
  const [voiceType, setVoiceType] = useState<'alloy' | 'nova' | 'echo'>('alloy')
  const [toneTemplate, setToneTemplate] = useState('です・ます調（丁寧）')
  const [customInstructions, setCustomInstructions] = useState('')

  // 評価設定 state
  const [axes, setAxes] = useState(EVALUATION_AXES.map((a) => ({ ...a })))
  const totalWeight = axes.reduce((sum, a) => sum + a.weight, 0)

  // 質問設定 state
  const [activePattern, setActivePattern] = useState<'fulltime-new-graduate' | 'fulltime-mid-experienced' | 'fulltime-mid-inexperienced' | 'parttime-experienced' | 'parttime-inexperienced'>('fulltime-new-graduate')
  const [editingCommonId, setEditingCommonId] = useState<string | null>(null)
  const [editingQuestionKey, setEditingQuestionKey] = useState<string | null>(null)
  const [commonQuestions, setCommonQuestions] = useState(() => ({
    icebreakers: COMMON_QUESTIONS.icebreakers.map((x) => ({ ...x })),
    closing: COMMON_QUESTIONS.closing.map((x) => ({ ...x })),
  }))
  const [questionsByPattern, setQuestionsByPattern] = useState<Record<string, QuestionItem[]>>(() =>
    Object.fromEntries(Object.entries(QUESTIONS_BY_PATTERN).map(([k, v]) => [k, v.map((q) => ({ ...q }))]))
  )

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const copyInterviewUrl = async () => {
    try {
      await navigator.clipboard.writeText(INTERVIEW_URL)
      showToast('面接URLをコピーしました')
    } catch {
      showToast('コピーに失敗しました')
    }
  }

  const copyUrlFromField = async () => {
    try {
      await navigator.clipboard.writeText(INTERVIEW_URL)
      showToast('面接URLをコピーしました')
    } catch {
      showToast('コピーに失敗しました')
    }
  }

  const handleStopContract = () => {
    setStopModalOpen(false)
    showToast('契約を停止しました')
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`,
        }}
      />
      <div className="space-y-6">
        {/* ヘッダー部 */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push('/admin/companies')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white cursor-pointer transition-colors mb-2"
            >
              <BackIcon className="w-4 h-4" />
              企業一覧に戻る
            </button>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-2xl font-bold text-white">株式会社ABC</h1>
              <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5 text-xs">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                アクティブ
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={copyInterviewUrl}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-sm rounded-xl px-4 py-2.5 transition-all shrink-0"
          >
            <LinkIcon className="w-4 h-4" />
            面接URLをコピー
          </button>
        </div>

        {/* タブ */}
        <div className="flex gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.06] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300 rounded-lg cursor-pointer'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* タブ1: 基本情報 */}
        {activeTab === '基本情報' && (
          <div className={`${CARD_BASE} p-6`}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 mb-8">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">企業名</label>
                <p className="text-sm text-white mt-1">株式会社ABC</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">代表者名</label>
                <p className="text-sm text-white mt-1">田中 一郎</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者名</label>
                <p className="text-sm text-white mt-1">佐藤 美咲</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者メール</label>
                <p className="text-sm text-white mt-1">sato@abc-corp.co.jp</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者電話</label>
                <p className="text-sm text-white mt-1">03-1234-5678</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">所在地</label>
                <p className="text-sm text-white mt-1">東京都渋谷区神南1-2-3 ABCビル5F</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">業種</label>
                <p className="text-sm text-white mt-1">IT・ソフトウェア</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">従業員数</label>
                <p className="text-sm text-white mt-1">120名</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">契約プラン</label>
                <p className="text-sm text-white mt-1">プランB（11〜20件）</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">契約開始日</label>
                <p className="text-sm text-white mt-1">2024-10-15</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">次回更新日</label>
                <p className="text-sm text-white mt-1">2025-04-15</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">面接URL</label>
                <button type="button" onClick={copyUrlFromField} className="block text-sm text-blue-400 hover:text-blue-300 mt-1 break-all text-left">
                  {INTERVIEW_URL}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => showToast('プラン変更は課金管理から行ってください')}
                className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 border border-blue-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                プラン変更
              </button>
              <button
                type="button"
                onClick={() => setStopModalOpen(true)}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                契約停止
              </button>
              <button
                type="button"
                onClick={() => showToast('編集機能は今後実装予定です')}
                className="bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                企業情報編集
              </button>
            </div>
          </div>
        )}

        {/* タブ2: ブランド設定 */}
        {activeTab === 'ブランド設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <div className="flex flex-col lg:flex-row lg:gap-8">
              <div className="flex-1 space-y-6">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">応募者画面に表示する企業名</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-full max-w-md focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">応募者の面接画面に表示される企業名です</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">企業ロゴ画像</label>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="w-20 h-20 bg-white/[0.05] border border-white/[0.08] rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-white/30 text-xs">ABC</span>
                    </div>
                    <div>
                      <button type="button" className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl px-4 py-2 text-sm">
                        画像をアップロード
                      </button>
                      <p className="text-xs text-gray-500 mt-1">推奨サイズ: 200x200px、PNG/JPG</p>
                      {/* TODO: Cloudflare R2にアップロード実装 */}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">メインカラー</label>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-10 h-10 rounded-xl border border-white/10 shrink-0" style={{ backgroundColor: brandColor }} />
                    <input
                      type="text"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-32 focus:border-blue-500/50 outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">応募者画面のアクセントカラーに使用されます</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">面接完了後に表示するメッセージ</label>
                  <textarea
                    rows={4}
                    value={completeMessage}
                    onChange={(e) => setCompleteMessage(e.target.value)}
                    className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-3 text-sm w-full max-w-lg focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => showToast('ブランド設定を保存しました')}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                >
                  保存する
                </button>
              </div>
              <div className="lg:w-72 shrink-0">
                <p className="text-xs text-gray-500 mb-2">プレビュー</p>
                <div className="w-full max-w-[288px] bg-gray-900 rounded-2xl border border-white/10 p-4">
                  <div className="w-12 h-12 bg-white/[0.05] rounded-xl flex items-center justify-center mb-3">
                    <span className="text-white/30 text-xs">ABC</span>
                  </div>
                  <p className="text-sm font-medium mb-3" style={{ color: brandColor }}>
                    {displayName}
                  </p>
                  <button type="button" className="w-full py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: brandColor }}>
                    面接を開始する
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* タブ3: アバター設定 */}
        {activeTab === 'アバター設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">面接官の表示名</label>
                <input
                  type="text"
                  value={avatarName}
                  onChange={(e) => setAvatarName(e.target.value)}
                  className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-full max-w-md focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">面接中にこの名前で自己紹介します</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">アバター画像</label>
                <div className="flex items-center gap-4 mt-2">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center shrink-0">
                    <UserIcon className="w-10 h-10 text-gray-500" />
                  </div>
                  <div>
                    <button type="button" className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl px-4 py-2 text-sm">
                      画像をアップロード
                    </button>
                    <p className="text-xs text-gray-500 mt-1">推奨サイズ: 256x256px、PNG/JPG</p>
                    {/* TODO: Cloudflare R2にアップロード実装 */}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">音声タイプ</label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {(['alloy', 'nova', 'echo'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVoiceType(v)}
                      className={`rounded-xl p-3 cursor-pointer border transition-colors ${
                        voiceType === v ? 'border-blue-500/50 bg-blue-500/10' : 'bg-white/[0.05] border-white/[0.08] hover:border-white/15'
                      }`}
                    >
                      <span className="text-sm text-white block">{v}</span>
                      <span className="text-xs text-gray-500 block mt-0.5">
                        {v === 'alloy' && '落ち着いた女性の声'}
                        {v === 'nova' && '明るい女性の声'}
                        {v === 'echo' && '落ち着いた男性の声'}
                      </span>
                    </button>
                  ))}
                </div>
                {/* TODO: OpenAI Realtime APIの最新音声リストに差替え */}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">口調テンプレート</label>
                <select
                  value={toneTemplate}
                  onChange={(e) => setToneTemplate(e.target.value)}
                  className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-full max-w-md focus:border-blue-500/50 outline-none"
                >
                  <option value="です・ます調（丁寧）">です・ます調（丁寧）</option>
                  <option value="フレンドリー">フレンドリー</option>
                  <option value="ビジネスフォーマル">ビジネスフォーマル</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">面接官の話し方のトーンを設定します</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">追加の指示（任意）</label>
                <textarea
                  rows={3}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="例: 応募者の緊張をほぐすため、面接開始時にアイスブレイクを入れてください"
                  className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 px-4 py-3 text-sm w-full focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">OpenAI APIのシステムプロンプトに追加される指示です</p>
              </div>
              <button
                type="button"
                onClick={() => showToast('アバター設定を保存しました')}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
              >
                保存する
              </button>
            </div>
          </div>
        )}

        {/* タブ4: 質問設定 */}
        {activeTab === '質問設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <h2 className="text-base font-semibold text-white mb-3">共通質問（全パターン共通）</h2>
            <p className="text-xs text-gray-500 mb-4">
              すべてのパターンの面接で、以下の質問が冒頭とクロージングに自動挿入されます。
            </p>
            <div className="space-y-3">
              {[...commonQuestions.icebreakers, ...commonQuestions.closing].map((cq) => {
                const isEditing = editingCommonId === cq.id
                const rows = cq.id === 'ice-1' ? 4 : 3
                return (
                  <div key={cq.id} className="bg-white/[0.04] border border-white/[0.06] border-l-2 border-l-gray-600 rounded-xl p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold text-gray-400">{cq.label}</span>
                        <span className="text-sm font-medium text-gray-300">{cq.category}</span>
                        <span className="text-gray-600 mx-1">|</span>
                        <span className="text-xs text-gray-500">
                          {cq.followUp ? `深掘り ON・最大${cq.followUpMax}回` : '深掘り OFF'}
                        </span>
                      </div>
                      <div className="flex items-center shrink-0">
                        {isEditing ? null : (
                          <button
                            type="button"
                            onClick={() => setEditingCommonId(cq.id)}
                            className="text-xs text-gray-500 hover:text-white transition-colors cursor-pointer mr-3"
                          >
                            編集
                          </button>
                        )}
                        <span className="text-xs text-gray-600 bg-white/[0.04] rounded-md px-2 py-0.5">評価対象外</span>
                      </div>
                    </div>
                    {isEditing ? (
                      <>
                        <textarea
                          rows={rows}
                          value={cq.question}
                          onChange={(e) => {
                            const val = e.target.value
                            setCommonQuestions((prev) => {
                              const target = cq.id.startsWith('ice') ? prev.icebreakers : prev.closing
                              const idx = target.findIndex((x) => x.id === cq.id)
                              if (idx < 0) return prev
                              const nextArr = target.map((item, i) => (i === idx ? { ...item, question: val } : item))
                              return cq.id.startsWith('ice') ? { ...prev, icebreakers: nextArr } : { ...prev, closing: nextArr }
                            })
                          }}
                          className="mt-3 bg-white/[0.05] border border-white/[0.10] rounded-xl text-white text-sm px-4 py-3 w-full leading-relaxed resize-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        />
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              // TODO: API実装
                              setEditingCommonId(null)
                              showToast('保存しました')
                            }}
                            className="text-xs bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/[0.10] rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCommonQuestions({
                                icebreakers: COMMON_QUESTIONS.icebreakers.map((x) => ({ ...x })),
                                closing: COMMON_QUESTIONS.closing.map((x) => ({ ...x })),
                              })
                              setEditingCommonId(null)
                            }}
                            className="text-xs text-gray-500 hover:text-gray-300 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                          >
                            キャンセル
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-white leading-relaxed mt-3">{cq.question}</p>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-6" />
            <p className="text-sm text-gray-400 mb-5">
              応募者が情報入力フォームで選択した「雇用形態」「就業形態（新卒/中途）」「業界経験」に応じて、該当パターンの質問が自動的に使用されます。
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
              {PATTERN_CONFIG.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePattern(p.id)}
                  className={`rounded-xl p-4 cursor-pointer transition-all duration-200 text-left ${
                    activePattern === p.id
                      ? 'bg-white/[0.06] border-l-2 border-l-blue-500 border border-white/[0.10]'
                      : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05]'
                  }`}
                >
                  <p className={`text-sm font-medium ${activePattern === p.id ? 'text-white' : 'text-gray-400'}`}>{p.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{p.count}問設定済み</p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">面接質問リスト</h2>
              <button
                type="button"
                onClick={() => showToast('質問追加モーダルは今後実装予定です')}
                className="inline-flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-gray-400 hover:text-white text-sm rounded-xl px-4 py-2 transition-all"
              >
                <PlusIcon className="w-4 h-4" />
                質問を追加
              </button>
            </div>
            <div className="space-y-3">
              {(questionsByPattern[activePattern] ?? []).map((q, i) => {
                const qKey = `${activePattern}-${q.id}`
                const isEditing = editingQuestionKey === qKey
                return (
                  <div key={qKey} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-5 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold text-gray-400">Q{i + 1}</span>
                        <span className="text-sm font-medium text-gray-300">{q.category}</span>
                        <span className="text-gray-600 mx-1">|</span>
                        <span className="text-xs text-gray-500">
                          {q.followUp ? `深掘り ON・最大${q.followUpMax}回` : '深掘り OFF'}
                        </span>
                      </div>
                      <div className="flex items-center gap-0 shrink-0">
                        {isEditing ? null : (
                          <button
                            type="button"
                            onClick={() => setEditingQuestionKey(qKey)}
                            className="text-xs text-gray-500 hover:text-white transition-colors cursor-pointer mr-3"
                          >
                            編集
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => showToast('削除機能は今後実装予定です')}
                          className="text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                    {isEditing ? (
                      <>
                        <textarea
                          rows={3}
                          value={q.question}
                          onChange={(e) => {
                            const val = e.target.value
                            setQuestionsByPattern((prev) => {
                              const list = prev[activePattern] ?? []
                              const nextList = list.map((item) => (item.id === q.id ? { ...item, question: val } : item))
                              return { ...prev, [activePattern]: nextList }
                            })
                          }}
                          className="mt-3 bg-white/[0.05] border border-white/[0.10] rounded-xl text-white text-sm px-4 py-3 w-full leading-relaxed resize-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 focus:outline-none"
                        />
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              // TODO: API実装
                              setEditingQuestionKey(null)
                              showToast('保存しました')
                            }}
                            className="text-xs bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/[0.10] rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const orig = QUESTIONS_BY_PATTERN[activePattern] ?? []
                              const origQ = orig.find((o) => o.id === q.id)
                              if (origQ) {
                                setQuestionsByPattern((prev) => {
                                  const list = prev[activePattern] ?? []
                                  const nextList = list.map((item) => (item.id === q.id ? { ...origQ } : item))
                                  return { ...prev, [activePattern]: nextList }
                                })
                              }
                              setEditingQuestionKey(null)
                            }}
                            className="text-xs text-gray-500 hover:text-gray-300 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
                          >
                            キャンセル
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-white leading-relaxed mt-3">{q.question}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-3">
                          <span className="text-xs text-gray-600">評価軸:</span>
                          <span className="text-xs text-gray-500">{q.axes.join('、')}</span>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mt-6 flex gap-3">
              <InfoIcon className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-500 leading-relaxed">
                応募者は面接前の情報入力フォームで「希望の雇用形態」「就業形態（新卒/中途）」「業界経験の有無」を選択します。その回答の組み合わせに基づき、冒頭のアイスブレイク → 該当パターンの本編質問 → クロージングの順で面接が自動進行します。
              </p>
            </div>
          </div>
        )}

        {/* タブ5: 評価設定 */}
        {activeTab === '評価設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <h2 className="text-base font-semibold text-white mb-1">評価軸設定</h2>
            <p className="text-sm text-gray-400 mb-6">各評価軸の名称と重み（合計100%）を設定してください</p>
            <div className="space-y-0">
              {axes.map((ax, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-white/[0.04]">
                  <span className="text-sm text-gray-500 w-6 shrink-0">{i + 1}.</span>
                  <input
                    type="text"
                    value={ax.name}
                    onChange={(e) => {
                      const next = [...axes]
                      next[i] = { ...next[i], name: e.target.value }
                      setAxes(next)
                    }}
                    className="bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-3 py-2 text-sm w-56 focus:border-blue-500/50 outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={ax.weight}
                      onChange={(e) => {
                        const next = [...axes]
                        next[i] = { ...next[i], weight: Number(e.target.value) || 0 }
                        setAxes(next)
                      }}
                      min={0}
                      max={100}
                      className="bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-3 py-2 text-sm w-20 text-center focus:border-blue-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className={`mt-4 text-sm ${totalWeight === 100 ? 'text-gray-400' : 'text-red-400'}`}>
              合計: {totalWeight}%{totalWeight !== 100 && '（100%にしてください）'}
            </p>
            <button
              type="button"
              onClick={() => showToast('評価設定を保存しました')}
              className="mt-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
            >
              保存する
            </button>
          </div>
        )}

        {/* タブ6: 利用状況 */}
        {activeTab === '利用状況' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">面接実施数</p>
                <p className="text-2xl font-bold text-white mb-2">14/20件</p>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '70%' }} />
                </div>
              </div>
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">残り面接枠</p>
                <p className="text-2xl font-bold text-white">6件</p>
              </div>
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">プラン消化率</p>
                <p className="text-2xl font-bold text-white">70%</p>
              </div>
            </div>
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="p-6 pb-0">
                <h2 className="text-base font-semibold text-white mb-4">月別利用推移</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4 text-left">月</th>
                      <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4 text-left">利用件数</th>
                      <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4 text-left">プラン</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHLY_USAGE.map((m) => (
                      <tr
                        key={m.month}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${m.atLimit ? 'bg-yellow-500/5' : ''}`}
                      >
                        <td className="py-3 px-4 text-sm text-gray-300">{m.month}</td>
                        <td className="py-3 px-4 text-sm text-gray-300">
                          {m.used}/{m.limit}件
                          {m.atLimit && <span className="text-yellow-400 text-xs ml-1">上限到達</span>}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-400">({m.plan})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-6 pt-4 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => {
                    showToast('応募者管理は次のステップで実装します')
                    // TODO: router.push(`/admin/applicants?company=${params.id}`)
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  この企業の応募者一覧を見る →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 契約停止確認モーダル */}
      {stopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStopModalOpen(false)} aria-hidden />
          <div className={`relative ${CARD_BASE} p-6 max-w-md w-full`}>
            <h3 className="text-lg font-semibold text-white mb-2">契約停止の確認</h3>
            <p className="text-sm text-gray-400 mb-6">株式会社ABCの契約を停止しますか？停止すると新規面接の受付が停止されます。</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setStopModalOpen(false)}
                className="bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleStopContract}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                停止する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toastVisible && (
        <div
          className="fixed bottom-6 right-6 z-[60] flex items-center px-5 py-3 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 text-gray-300 text-sm rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          <InfoIcon className="w-4 h-4 text-blue-400 mr-2 shrink-0" />
          {toastMessage}
        </div>
      )}
    </>
  )
}

'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// TODO: 実データに差替え
const DUMMY = {
  name: '山田 太郎',
  email: 'yamada@example.com',
  phone: '090-1234-5678',
  furigana: 'やまだ たろう',
  jobType: '店舗マネージャー',
  appliedAt: '2025-02-14 10:00',
  status: 'second_pass',
  memo: '',
  // タブ1: サマリー（構造化AI面接サマリー）
  aiSummary: {
    profile: '飲食業界で5年の店長経験を持つ、数値管理と現場改善に強い実行力重視の人材。',
    career:
      '大学卒業後、大手飲食チェーンに入社し、入社2年目で副店長、3年目で店長に昇進。担当店舗では月間売上を前年比115%に改善し、人手不足の状況下で3ヶ月間に5名の新規採用を実現した。8名のスタッフのシフト管理・教育にも携わり、現場マネジメントの実務経験が豊富。',
    impression:
      '質問の意図を正確に汲み取り、具体的な数値を交えて簡潔に回答する傾向がある。特に過去の実績に関する質問では、課題→施策→結果の構造で論理的に語れており、説得力が高い。一方で、想定外の質問にはやや回答に時間がかかる場面が見られた。',
    strengthsAndConcerns:
      '最大の強みは、現場で培った問題解決力と数値に基づく説明力。即戦力としてマネジメント業務への適性が高い。懸念点は、3〜5年後のキャリアビジョンが漠然としており、長期定着への確信が持ちにくい点。また、チームワークに関する具体的なエピソードが少なく、協調性の実態は面接だけでは判断しきれない。',
  },
  recommendGrade: 'B',
  recommendReason:
    '実務経験とコミュニケーション力が高く即戦力として期待できる。キャリアビジョンの明確化が課題。',
  summaryScores: {
    total: 78,
    communication: 'A',
    experienceMatch: 'B',
    growthPotential: 'A',
  },
  // タブ2: AI レポート
  personalityType: '実行型リーダー',
  personalityDesc:
    '目標達成に向けて計画的に行動し、チームを率いる力がある。決断力が高い反面、他者の意見を取り入れる柔軟性にやや欠ける場面がある。組織内ではプロジェクト推進役として機能しやすい。',
  personalityForCompany:
    '管理職やリーダーポジションに適性あり。ただし、チーム内の合意形成プロセスに課題が出る可能性がある。',
  radarAxis: [
    { label: 'コミュニケーション力', value: 80, comment: '質問の意図を正確に汲み取り、簡潔に回答できている' },
    { label: '論理的思考力', value: 75, comment: '数値を用いた説明は得意だが、仮説構築にやや弱さがある' },
    { label: '業界適性・経験値', value: 70, comment: '実務経験は十分だが、業界の最新トレンドへの言及が少ない' },
    { label: '主体性・意欲', value: 85, comment: '自発的にプロジェクトを推進した経験を複数語っており、意欲が高い' },
    { label: '組織適合性', value: 65, comment: '個人での成果を重視する傾向があり、チームワークの具体例が少ない' },
  ],
  strengths: [
    {
      title: '数値に基づく説明力',
      desc: '売上やスタッフ数など具体的な数値を交えて実績を説明する力がある',
    },
    {
      title: '課題解決への主体性',
      desc: '問題に対して自ら解決策を考え実行した経験を複数持つ',
    },
    {
      title: 'マネジメント経験',
      desc: '5名以上のチームを管理した実績があり、リーダーシップがある',
    },
  ],
  weaknesses: [
    {
      title: 'キャリアビジョンの不明確さ',
      desc: '3〜5年後の目標について具体性が薄く、長期定着に不安がある',
    },
    {
      title: 'チームワークの具体性不足',
      desc: '協調性をアピールしているが、具体的なエピソードが少ない',
    },
  ],
  // タブ3: スコア詳細
  totalScore: 78,
  averageScore: 72,
  itemScores: [
    { label: 'コミュニケーション力', score: 16, max: 20, comment: '質問に対して的確かつ簡潔に回答している' },
    { label: '論理的思考力', score: 15, max: 20, comment: '根拠を示しながら説明できるが、反論への対応にやや弱さ' },
    { label: '業界知識・経験', score: 14, max: 20, comment: '実務経験は豊富だが最新の業界動向への言及が少ない' },
    { label: '主体性・意欲', score: 17, max: 20, comment: '自発的な取り組みのエピソードが複数あり高評価' },
    { label: 'ストレス耐性', score: 10, max: 20, comment: '困難な状況の質問でやや回答に詰まる場面があった' },
    { label: 'チームフィット', score: 6, max: 20, comment: '個人プレーの傾向が強く協調性の具体例が不足' },
  ],
  // タブ4: 面接会話要約
  conversationBlocks: [
    {
      theme: '自己紹介・経歴',
      grade: 'A',
      questionSummary: 'これまでのご経歴を簡単に教えてください',
      answerSummary:
        '大学卒業後、飲食チェーンに入社し5年間勤務。入社2年目で副店長、3年目で店長に昇進。担当店舗の月間売上を15%向上させた実績がある。スタッフ8名のシフト管理・教育も担当。',
      evalPoint: '具体的な数値と時系列が明確で、経歴の全体像が掴みやすい回答。',
    },
    {
      theme: '志望動機',
      grade: 'B',
      questionSummary: 'なぜ当社に応募されたのですか',
      answerSummary:
        '現職での店舗運営経験を活かし、より大きな組織でマネジメントに関わりたいと考えた。御社の急成長フェーズに惹かれ、自分の経験が貢献できると感じた。',
      evalPoint: '意欲は伝わるが、当社固有の魅力への言及が薄く、汎用的な志望動機の印象。',
    },
    {
      theme: '過去の実績・成功体験',
      grade: 'A',
      questionSummary: '最も成果を上げた経験を教えてください',
      answerSummary:
        '人手不足で売上が低迷していた店舗に配属された際、採用プロセスを見直し3ヶ月で5名の採用に成功。同時にオペレーションを効率化し、売上を前年比115%に改善した。',
      evalPoint: '課題→施策→結果の構造で語れており、再現性のある成果として評価できる。',
    },
    {
      theme: '困難な状況への対応',
      grade: 'C',
      questionSummary: '仕事で最も困難だった経験とどう乗り越えたかを教えてください',
      answerSummary: 'スタッフ間の人間関係のトラブルが発生し、退職者が出かけた。個別面談を実施して解決を図った。',
      evalPoint: 'エピソードはあるが具体的な行動と結果の説明が不足しており、深掘りが必要な回答。',
    },
    {
      theme: 'キャリアビジョン',
      grade: 'C',
      questionSummary: '3〜5年後のキャリアプランを教えてください',
      answerSummary:
        'マネジメントのスキルをさらに磨き、将来的にはエリアマネージャーのような立場で複数店舗を統括したい。',
      evalPoint: '方向性は示しているが、具体的なステップや数値目標がなく、ビジョンの解像度が低い。',
    },
  ],
  // タブ5: 録画・生データ
  recordingDuration: '25:30',
  recordingAt: '2025-02-14 14:30',
  qaLogs: [
    { role: 'ai', text: 'これまでのご経歴を簡単に教えてください。', time: '14:30:15' },
    {
      role: 'applicant',
      text: '大学卒業後、飲食チェーンに入社し5年間勤務しました。入社2年目で副店長、3年目で店長に昇進し、担当店舗の月間売上を15%向上させました。スタッフ8名のシフト管理・教育も担当しています。',
      time: '14:30:42',
    },
    { role: 'ai', text: 'なぜ当社に応募されたのですか。', time: '14:31:58' },
    {
      role: 'applicant',
      text: '現職での店舗運営経験を活かし、より大きな組織でマネジメントに関わりたいと考えました。御社の急成長フェーズに惹かれ、自分の経験が貢献できると感じたためです。',
      time: '14:32:25',
    },
    { role: 'ai', text: '最も成果を上げた経験を教えてください。', time: '14:33:40' },
    {
      role: 'applicant',
      text: '人手不足で売上が低迷していた店舗に配属された際、採用プロセスを見直し3ヶ月で5名の採用に成功しました。同時にオペレーションを効率化し、売上を前年比115%に改善しました。',
      time: '14:34:12',
    },
    { role: 'ai', text: '仕事で最も困難だった経験とどう乗り越えたかを教えてください。', time: '14:35:30' },
    {
      role: 'applicant',
      text: 'スタッフ間の人間関係のトラブルが発生し、退職者が出かけたことがありました。個別面談を実施して解決を図りました。',
      time: '14:36:05',
    },
    { role: 'ai', text: '3〜5年後のキャリアプランを教えてください。', time: '14:37:20' },
    {
      role: 'applicant',
      text: 'マネジメントのスキルをさらに磨き、将来的にはエリアマネージャーのような立場で複数店舗を統括したいと考えています。',
      time: '14:37:48',
    },
  ],
}

const STATUS_OPTIONS = [
  { value: 'considering', label: '検討中' },
  { value: 'second_pass', label: '二次通過' },
  { value: 'rejected', label: '不採用' },
]

const RECOMMEND_LEGEND = [
  { grade: 'A', label: '強く推奨', desc: '即戦力として高く評価' },
  { grade: 'B', label: '推奨', desc: '基本的な要件を満たし活躍が期待できる' },
  { grade: 'C', label: '条件付き推奨', desc: '一部課題があるが育成次第で可能性あり' },
  { grade: 'D', label: '非推奨', desc: '現時点では要件を満たしていない' },
] as const

const ANSWER_QUALITY_LEGEND = [
  { grade: 'A', label: '優れた回答' },
  { grade: 'B', label: '良好な回答' },
  { grade: 'C', label: '改善の余地あり' },
  { grade: 'D', label: '不十分な回答' },
] as const

type TabKey = 'summary' | 'report' | 'score' | 'conversation' | 'recording'

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    considering: 'bg-amber-50 text-amber-700 border border-amber-200/80 shadow-sm',
    second_pass: 'bg-sky-50 text-sky-700 border border-sky-200/80 shadow-sm',
    rejected: 'bg-rose-50 text-rose-700 border border-rose-200/80 shadow-sm',
  }
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label || status
  return (
    <span
      className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide ${classes[status] || 'bg-slate-100 text-slate-600 border border-slate-200'}`}
    >
      {label}
    </span>
  )
}

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25',
  B: 'bg-sky-500 text-white shadow-md shadow-sky-500/25',
  C: 'bg-amber-500 text-white shadow-md shadow-amber-500/25',
  D: 'bg-rose-500 text-white shadow-md shadow-rose-500/25',
}

function GradeBadge({ grade, size = 'md' }: { grade: string; size?: 'sm' | 'md' }) {
  const isSm = size === 'sm'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 ${GRADE_STYLES[grade] || 'bg-slate-500 text-white shadow-md'} ${
        isSm ? 'w-7 h-7 text-xs' : 'w-16 h-16 text-2xl'
      }`}
    >
      {grade}
    </span>
  )
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

function AnswerQualityLegend() {
  return (
    <div className="mb-6 rounded-2xl bg-slate-50 border border-slate-200/90 px-5 py-4 shadow-sm flex flex-wrap items-center gap-x-5 gap-y-2.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider shrink-0">回答の質の目安</span>
      {ANSWER_QUALITY_LEGEND.map(({ grade, label }) => (
        <span key={grade} className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${GRADE_STYLES[grade]}`}>
            {grade}
          </span>
          {label}
        </span>
      ))}
    </div>
  )
}

function getProgressBarColor(score: number, max: number) {
  const pct = (score / max) * 100
  if (pct >= 80) return 'bg-emerald-500'
  if (pct >= 55) return 'bg-blue-500'
  if (pct >= 30) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function ApplicantDetailPage() {
  const params = useParams()
  const id = params.id as string // TODO: 実データに差替え
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [selectedStatus, setSelectedStatus] = useState(DUMMY.status)
  const [selectionMemo, setSelectionMemo] = useState(DUMMY.memo)

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '概要' },
    { key: 'report', label: 'AI レポート' },
    { key: 'score', label: 'スコア詳細' },
    { key: 'conversation', label: '質問別評価' },
    { key: 'recording', label: '録画・生データ' },
  ]

  const cx = 100
  const cy = 100
  const maxR = 72
  const getPoint = (i: number, r: number) => {
    const angle = (-90 + i * 72) * (Math.PI / 180)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  const radarPoints = DUMMY.radarAxis.map((d, i) => getPoint(i, (d.value / 100) * maxR))
  const radarPath = radarPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <div className="min-w-0 max-w-[100vw] pb-10 sm:pb-12">
      <div className="rounded-2xl bg-slate-50/70 sm:bg-slate-50/50 border border-slate-200/60 p-4 sm:p-6 shadow-inner min-h-[200px]">
        <div className="space-y-6 sm:space-y-8">
          {/* ヘッダー */}
          <div>
            <Link
              href="/client/applicants"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 font-medium mb-4 transition-colors rounded-lg hover:bg-white/60 px-2 py-1 -mx-2 -my-1"
            >
              <ChevronLeftIcon className="w-4 h-4 shrink-0" />
              応募者一覧に戻る
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate tracking-tight">{DUMMY.name}</h1>
                  <StatusBadge status={DUMMY.status} />
                </div>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600">
                  <div className="flex gap-2 min-w-0">
                    <dt className="text-slate-500 shrink-0">メール</dt>
                    <dd className="truncate">{DUMMY.email}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-slate-500 shrink-0">電話</dt>
                    <dd>{DUMMY.phone}</dd>
                  </div>
                </dl>
              </div>
              {/* 選考ステータス（常時表示） */}
              <div className="w-full sm:w-72 shrink-0 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-md shadow-slate-200/50">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">選考ステータス</h3>
                <div className="space-y-3">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={selectionMemo}
                    onChange={(e) => setSelectionMemo(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-slate-200 bg-slate-50/50 text-slate-800 placeholder-slate-400 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all resize-none"
                    placeholder="選考メモを入力..."
                  />
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all shadow-md shadow-indigo-500/20"
                  >
                    {/* TODO: API 実装 */}
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>

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
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
          <div className="rounded-2xl bg-blue-50/90 border-l-4 border-blue-500 p-6 sm:p-7 shadow-md shadow-slate-200/50 border border-blue-100/50">
            <h2 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-5">AI 面接分析</h2>
            <div className="space-y-5 text-sm sm:text-base text-slate-700 leading-relaxed">
              <section>
                <p className="font-semibold text-gray-700 mb-1">人物像</p>
                <p className="font-bold text-slate-800">{DUMMY.aiSummary.profile}</p>
              </section>
              <section>
                <p className="font-semibold text-gray-700 mb-1.5">経歴・実績</p>
                <p>{DUMMY.aiSummary.career}</p>
              </section>
              <section>
                <p className="font-semibold text-gray-700 mb-1.5">面接での印象</p>
                <p>{DUMMY.aiSummary.impression}</p>
              </section>
              <section>
                <p className="font-semibold text-gray-700 mb-1.5">強みと懸念点</p>
                <p>{DUMMY.aiSummary.strengthsAndConcerns}</p>
              </section>
            </div>
          </div>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-start gap-6 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-md shadow-slate-200/50">
              <span
                className={`inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl text-4xl font-bold shrink-0 ${GRADE_STYLES[DUMMY.recommendGrade]}`}
              >
                {DUMMY.recommendGrade}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">推奨</p>
                <p className="text-sm text-slate-600 mt-1 max-w-xl leading-relaxed">{DUMMY.recommendReason}</p>
              </div>
            </div>
            <RecommendLegend />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-5">
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-5 sm:p-6 hover:shadow-lg transition-shadow">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">総合スコア</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                {DUMMY.summaryScores.total} <span className="text-lg font-normal text-slate-500">/ 100</span>
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-5 sm:p-6 hover:shadow-lg transition-shadow">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">コミュニケーション力</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{DUMMY.summaryScores.communication}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-5 sm:p-6 hover:shadow-lg transition-shadow">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">経験マッチ度</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{DUMMY.summaryScores.experienceMatch}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-5 sm:p-6 hover:shadow-lg transition-shadow">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">成長ポテンシャル</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">{DUMMY.summaryScores.growthPotential}</p>
            </div>
          </div>
        </div>
      )}

      {/* タブ2: AI レポート */}
      {activeTab === 'report' && (
        <div className="space-y-8">
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">パーソナリティタイプ（企業向け）</h2>
            <p className="text-lg font-bold text-slate-900 mb-3 tracking-tight">{DUMMY.personalityType}</p>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">{DUMMY.personalityDesc}</p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-4 border border-slate-200/80">
              {DUMMY.personalityForCompany}
            </p>
          </div>
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7 shrink-0">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-5">企業向け5軸レーダーチャート</h2>
              <div className="flex justify-center p-4 bg-slate-50/50 rounded-2xl">
                <svg viewBox="0 0 200 200" className="w-48 h-48 sm:w-56 sm:h-56 drop-shadow-sm">
                  <defs>
                    <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.35" />
                    </linearGradient>
                  </defs>
                  {[1, 2, 3, 4, 5].map((l) => {
                    const r = (l / 5) * maxR
                    const pts = [0, 1, 2, 3, 4].map((i) => getPoint(i, r))
                    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                    return (
                      <path
                        key={l}
                        d={path}
                        fill="none"
                        stroke="rgb(148 163 184 / 0.5)"
                        strokeWidth="1.2"
                      />
                    )
                  })}
                  {[0, 1, 2, 3, 4].map((i) => {
                    const p = getPoint(i, maxR)
                    return (
                      <line
                        key={i}
                        x1={cx}
                        y1={cy}
                        x2={p.x}
                        y2={p.y}
                        stroke="rgb(148 163 184 / 0.5)"
                        strokeWidth="1.2"
                      />
                    )
                  })}
                  <path d={radarPath} fill="url(#radarFill)" stroke="#0ea5e9" strokeWidth="2.5" />
                  {DUMMY.radarAxis.map((d, i) => {
                    const p = getPoint(i, maxR + 14)
                    return (
                      <text
                        key={i}
                        x={p.x}
                        y={p.y}
                        textAnchor="middle"
                        fill="#475569"
                        fontSize="11"
                        fontWeight="600"
                      >
                        {d.label}
                      </text>
                    )
                  })}
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-4">
              {DUMMY.radarAxis.map((d, i) => (
                <div key={i} className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-4 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-sm font-medium text-slate-900">{d.label}</span>
                    <span className="text-sm font-bold text-slate-700 tabular-nums">{d.value}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{d.comment}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">強み</h2>
            <ul className="space-y-5">
              {DUMMY.strengths.map((s, i) => (
                <li key={i} className="pl-4 border-l-2 border-emerald-200">
                  <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.desc}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-2xl shadow-md shadow-slate-200/50 border border-slate-200/80 p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">弱み・改善点</h2>
            <p className="text-xs text-slate-500 mb-4">応募者には見せない企業専用の情報</p>
            <ul className="space-y-5">
              {DUMMY.weaknesses.map((w, i) => (
                <li key={i} className="pl-4 border-l-2 border-amber-200">
                  <p className="text-sm font-semibold text-slate-900">{w.title}</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{w.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* タブ3: スコア詳細 */}
      {activeTab === 'score' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
            <p className="text-sm text-gray-500 font-medium tracking-wide uppercase text-center mb-4">総合スコア</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8">
              <div className="relative shrink-0">
                <svg viewBox="0 0 120 120" className="w-[120px] h-[120px] -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="6"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 54}
                    strokeDashoffset={2 * Math.PI * 54 * (1 - DUMMY.totalScore / 100)}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold text-gray-900">
                  {DUMMY.totalScore}
                </span>
              </div>
              <div className="flex flex-col items-center sm:items-start gap-4">
                <p className="text-6xl font-extrabold text-gray-900 tracking-tight">
                  {DUMMY.totalScore} <span className="text-2xl text-gray-400 font-normal">/ 100</span>
                </p>
                <div className="w-full max-w-[200px]">
                  <div className="h-2 bg-gray-200 rounded-full relative">
                    <span
                      className="absolute top-1/2 w-2.5 h-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-gray-400"
                      style={{ left: `${DUMMY.averageScore}%` }}
                    />
                    <span
                      className="absolute top-1/2 w-2.5 h-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-indigo-500"
                      style={{ left: `${DUMMY.totalScore}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>同職種平均 {DUMMY.averageScore}点</span>
                    <span>あなた {DUMMY.totalScore}点</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-6">評価項目内訳</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {DUMMY.itemScores.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                    <span>
                      <span className="text-indigo-600 font-bold tabular-nums">{item.score}</span>
                      <span className="text-gray-400">/{item.max}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getProgressBarColor(item.score, item.max)}`}
                      style={{ width: `${(item.score / item.max) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{item.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* タブ4: 質問別評価 */}
      {activeTab === 'conversation' && (
        <div>
          <AnswerQualityLegend />
          <div className="space-y-6">
            {DUMMY.conversationBlocks.map((block, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-200/80 overflow-hidden hover:shadow-xl transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-6 sm:p-7 bg-slate-50/50 border-b border-slate-200/80">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">{block.theme}</h3>
                  <div className="flex items-center shrink-0">
                    <GradeBadge grade={block.grade} size="sm" />
                  </div>
                </div>
                <div className="p-6 sm:p-7 space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">質問要旨</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{block.questionSummary}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">回答要約</p>
                    <p className="text-sm text-slate-800 leading-relaxed bg-slate-50/80 rounded-xl p-4 border border-slate-100">
                      {block.answerSummary}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">評価ポイント</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{block.evalPoint}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* タブ5: 録画・生データ */}
      {activeTab === 'recording' && (
        <div className="space-y-8">
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">面接録画</h2>
            <div className="aspect-video bg-slate-900 rounded-2xl flex items-center justify-center overflow-hidden shadow-xl border border-slate-700/50">
              {/* TODO: Cloudflare R2 から動画URLを取得して再生 */}
              <button
                type="button"
                className="w-20 h-20 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-all focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900"
                aria-label="再生"
              >
                <PlayIcon className="w-10 h-10 ml-1" />
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-600">録画時間: {DUMMY.recordingDuration}</p>
            <p className="text-sm text-slate-600">録画日時: {DUMMY.recordingAt}</p>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">全文 Q&A ログ</h2>
            <div className="space-y-4">
              {DUMMY.qaLogs.map((log, i) => (
                <div
                  key={i}
                  className={`flex ${log.role === 'ai' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-4 text-sm shadow-md ${
                      log.role === 'ai'
                        ? 'bg-slate-100 text-slate-900 border border-slate-200/80'
                        : 'bg-sky-50 text-slate-900 border border-sky-200/80'
                    }`}
                  >
                    <p className="text-xs text-slate-500 mb-1.5 tabular-nums">{log.time} — {log.role === 'ai' ? 'AI' : '応募者'}</p>
                    <p className="whitespace-pre-wrap leading-relaxed">{log.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}

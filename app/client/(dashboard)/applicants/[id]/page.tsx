'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// TODO: 実データに差替え
const DUMMY_APPLICANT = {
  name: '山田 太郎',
  furigana: 'やまだ たろう',
  email: 'yamada@example.com',
  phone: '090-1234-5678',
  age: 28,
  jobType: 'エンジニア',
  appliedAt: '2025-02-14 10:00',
  status: 'second_pass',
  statusLabel: '二次通過',
  memo: '',
  statusHistory: [
    { date: '2025-02-14 15:00', change: '未実施 → 評価中', by: 'システム' },
    { date: '2025-02-14 14:35', change: '評価中 → 完了', by: 'システム' },
    { date: '2025-02-14 14:30', change: '面接開始', by: 'AI' },
  ],
  personalityType: '論理型リーダー',
  personalityCatchphrase: '冷静な分析力で周囲を導く、信頼のリーダー',
  personalityDescription: 'あなたは物事を論理的に整理し、根拠に基づいた判断ができるタイプです。チームの中では自然とまとめ役になることが多く、周囲からの信頼も厚い傾向があります。',
  radarData: [
    { label: '行動力', value: 4 },
    { label: '協調性', value: 3 },
    { label: '分析力', value: 5 },
    { label: '創造性', value: 3 },
    { label: '安定性', value: 4 },
  ],
  summaryMinutes: 25,
  summaryQuestions: 6,
  avgResponseSeconds: 42,
  totalSpeakingTime: '8:30',
  speakingRate: 65,
  strengths: [
    { title: '自己表現力', description: '自身の経験や考えを、具体的なエピソードを交えながら分かりやすく伝えることができています。' },
    { title: '傾聴力', description: '質問の意図を正確に把握し、的確に回答する力が見られます。' },
    { title: '論理的思考', description: '回答に一貫性があり、筋道を立てて話を展開する力があります。' },
  ],
  totalScore: 85,
  itemScores: [
    { label: 'コミュニケーション力', score: 18, max: 20 },
    { label: '論理的思考', score: 17, max: 20 },
    { label: '積極性', score: 16, max: 20 },
    { label: '専門知識', score: 17, max: 20 },
    { label: '文化適合性', score: 17, max: 20 },
  ],
  aiComment: '論理的な回答と明確な志望動機が強みです。具体的なエピソードを交えた説明ができるため、採用後の活躍が期待できます。チームワークに関する質問への回答も適切でした。',
  qaLogs: [
    { role: 'ai', text: '自己紹介をお願いします。' },
    { role: 'applicant', text: 'はじめまして。山田太郎と申します。大学で情報工学を専攻し、現在はWebアプリケーションの開発に5年従事しています。' },
    { role: 'ai', text: 'なぜ当社を志望されましたか？' },
    { role: 'applicant', text: '御社のプロダクト開発の文化と、技術への投資姿勢に惹かれました。特にAIを活用した新規事業に興味があります。' },
    { role: 'ai', text: 'これまでの失敗経験と、そこから学んだことを教えてください。' },
  ],
  recordingDuration: '25:30',
}

// 選考ステータス（企業担当者が手動管理）: 検討中 / 二次通過 / 不採用
const STATUS_OPTIONS = [
  { value: 'considering', label: '検討中' },
  { value: 'second_pass', label: '二次通過' },
  { value: 'rejected', label: '不採用' },
]

type TabKey = 'basic' | 'status' | 'report' | 'score' | 'qa'

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    considering: 'bg-orange-100 text-orange-600',
    second_pass: 'bg-blue-100 text-blue-600',
    rejected: 'bg-red-100 text-red-600',
  }
  const label = STATUS_OPTIONS.find((o) => o.value === status)?.label || status
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${classes[status] || 'bg-gray-100 text-gray-600'}`}>{label}</span>
}

export default function ApplicantDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [activeTab, setActiveTab] = useState<TabKey>('basic')
  const [selectedStatus, setSelectedStatus] = useState(DUMMY_APPLICANT.status)
  const [selectionMemo, setSelectionMemo] = useState(DUMMY_APPLICANT.memo)

  const cx = 100
  const cy = 100
  const maxR = 72
  const getPoint = (i: number, r: number) => {
    const angle = (-90 + i * 72) * (Math.PI / 180)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  const dataPoints = DUMMY_APPLICANT.radarData.map((d, i) => getPoint(i, (d.value / 5) * maxR))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'basic', label: '基本情報' },
    { key: 'status', label: '選考ステータス' },
    { key: 'report', label: 'AIレポート' },
    { key: 'score', label: 'スコア・評価' },
    { key: 'qa', label: '質疑応答ログ・動画' },
  ]

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <Link
          href="/client/applicants"
          className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium mb-4"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          応募者一覧に戻る
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{DUMMY_APPLICANT.name}</h1>
          <StatusBadge status={DUMMY_APPLICANT.status} />
        </div>
      </div>

      {/* タブ */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* タブ1: 基本情報 */}
      {activeTab === 'basic' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-4">基本情報</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 text-sm">
            <div><dt className="text-slate-500 mb-1">氏名</dt><dd className="text-slate-900 font-medium">{DUMMY_APPLICANT.name}</dd></div>
            <div><dt className="text-slate-500 mb-1">フリガナ</dt><dd className="text-slate-900">{DUMMY_APPLICANT.furigana}</dd></div>
            <div><dt className="text-slate-500 mb-1">メールアドレス</dt><dd className="text-slate-900">{DUMMY_APPLICANT.email}</dd></div>
            <div><dt className="text-slate-500 mb-1">電話番号</dt><dd className="text-slate-900">{DUMMY_APPLICANT.phone}</dd></div>
            <div><dt className="text-slate-500 mb-1">年齢</dt><dd className="text-slate-900">{DUMMY_APPLICANT.age}歳</dd></div>
            <div><dt className="text-slate-500 mb-1">応募職種</dt><dd className="text-slate-900">{DUMMY_APPLICANT.jobType}</dd></div>
            <div><dt className="text-slate-500 mb-1">応募日時</dt><dd className="text-slate-900">{DUMMY_APPLICANT.appliedAt}</dd></div>
          </dl>
        </div>
      )}

      {/* タブ2: 選考ステータス */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">現在のステータス</h2>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-slate-700 mb-2">ステータス</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 bg-white text-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
              >
                {/* TODO: ステータス更新API実装 */}
                ステータス変更
              </button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">選考メモ</h2>
            {/* TODO: メモ保存API実装 */}
            <textarea
              value={selectionMemo}
              onChange={(e) => setSelectionMemo(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 bg-white text-gray-700 placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="選考メモを入力..."
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">ステータス変更履歴</h2>
            <ul className="space-y-3">
              {DUMMY_APPLICANT.statusHistory.map((h, i) => (
                <li key={i} className="flex items-start gap-4 text-sm py-2 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500 shrink-0">{h.date}</span>
                  <span className="text-slate-900">{h.change}</span>
                  <span className="text-slate-500 text-xs">{h.by}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* タブ3: AIレポート */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          {/* TODO: AI分析結果データに差替え */}
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-6 text-white shadow-sm">
            <h2 className="text-base font-semibold mb-2">性格タイプ診断</h2>
            <p className="text-xl font-bold mb-1">{DUMMY_APPLICANT.personalityType}</p>
            <p className="text-white/90 text-sm mb-3">{DUMMY_APPLICANT.personalityCatchphrase}</p>
            <p className="text-white/80 text-sm leading-relaxed">{DUMMY_APPLICANT.personalityDescription}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">能力プロファイル</h2>
            <div className="flex justify-center">
              <svg viewBox="0 0 200 200" className="w-48 h-48 md:w-56 md:h-56">
                <defs>
                  <linearGradient id="detailRadar" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
                {[1, 2, 3, 4, 5].map((l) => {
                  const r = (l / 5) * maxR
                  const pts = [0, 1, 2, 3, 4].map((i) => getPoint(i, r))
                  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                  return <path key={l} d={path} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                })}
                {[0, 1, 2, 3, 4].map((i) => {
                  const p = getPoint(i, maxR)
                  return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="1" />
                })}
                <path d={dataPath} fill="url(#detailRadar)" stroke="#6366f1" strokeWidth="2" />
                {DUMMY_APPLICANT.radarData.map((d, i) => {
                  const p = getPoint(i, maxR + 12)
                  return <text key={i} x={p.x} y={p.y} textAnchor="middle" fill="#64748b" fontSize="10">{d.label}</text>
                })}
              </svg>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">面接サマリー</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div><p className="text-slate-500">面接時間</p><p className="font-medium text-slate-900">{DUMMY_APPLICANT.summaryMinutes}分</p></div>
              <div><p className="text-slate-500">質問数</p><p className="font-medium text-slate-900">{DUMMY_APPLICANT.summaryQuestions}問</p></div>
              <div><p className="text-slate-500">平均応答時間</p><p className="font-medium text-slate-900">{DUMMY_APPLICANT.avgResponseSeconds}秒</p></div>
              <div><p className="text-slate-500">総発話時間</p><p className="font-medium text-slate-900">{DUMMY_APPLICANT.totalSpeakingTime}</p></div>
              <div><p className="text-slate-500">発話率</p><p className="font-medium text-slate-900">{DUMMY_APPLICANT.speakingRate}%</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">あなたの強み</h2>
            <ul className="space-y-4">
              {DUMMY_APPLICANT.strengths.map((s, i) => (
                <li key={i}>
                  <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{s.description}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* タブ4: スコア・評価 */}
      {activeTab === 'score' && (
        <div className="space-y-6">
          {/* TODO: AI評価データに差替え */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">総合スコア</h2>
            <p className="text-4xl font-bold text-indigo-600">{DUMMY_APPLICANT.totalScore}<span className="text-2xl font-normal text-slate-500">/100</span></p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">評価項目別スコア</h2>
            <div className="space-y-4">
              {DUMMY_APPLICANT.itemScores.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{item.label}</span>
                    <span className="text-slate-900 font-medium">{item.score}/{item.max}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${(item.score / item.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">AI推薦コメント</h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{DUMMY_APPLICANT.aiComment}</p>
          </div>
        </div>
      )}

      {/* タブ5: 質疑応答ログ・動画 */}
      {activeTab === 'qa' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">質疑応答ログ</h2>
            <div className="space-y-4">
              {DUMMY_APPLICANT.qaLogs.map((log, i) => (
                <div
                  key={i}
                  className={`flex ${log.role === 'ai' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                      log.role === 'ai'
                        ? 'bg-slate-100 text-slate-900'
                        : 'bg-indigo-50 text-slate-900'
                    }`}
                  >
                    <p className="text-xs text-slate-500 mb-1">{log.role === 'ai' ? 'AI' : '応募者'}</p>
                    <p className="whitespace-pre-wrap">{log.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-4">面接動画</h2>
            <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center">
              {/* TODO: Cloudflare R2から動画取得 */}
              <p className="text-slate-500 text-sm">動画を読み込み中...</p>
            </div>
            <p className="mt-3 text-sm text-slate-600">録画時間: {DUMMY_APPLICANT.recordingDuration}</p>
          </div>
        </div>
      )}
    </div>
  )
}

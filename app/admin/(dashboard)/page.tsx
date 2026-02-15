'use client'

import { useState } from 'react'

// TODO: 実データに差替え
const KPI = {
  todayInterviews: 12,
  todayInterviewsDiff: 3,
  monthlyRevenue: 2460000,
  monthlyRevenueDiff: 12,
  activeCompanies: 18,
  totalCompanies: 24,
  pendingAlerts: 3,
  alertDetail: '課金失敗2件・停止申請1件',
}

// TODO: 実データに差替え
const INTERVIEW_CHART_DATA = [8, 12, 6, 15, 10, 14, 12]
const INTERVIEW_CHART_LABELS = ['2/9', '2/10', '2/11', '2/12', '2/13', '2/14', '2/15']

// TODO: 実データに差替え
const REVENUE_CHART_DATA = [380000, 420000, 180000, 540000, 360000, 480000, 420000]
const REVENUE_CHART_LABELS = ['2/9', '2/10', '2/11', '2/12', '2/13', '2/14', '2/15']

// TODO: 実データに差替え
const ALERTS = [
  { type: 'red' as const, text: '株式会社ABCの課金が失敗しました', time: '2分前' },
  { type: 'red' as const, text: '株式会社XYZの課金が失敗しました', time: '1時間前' },
  { type: 'yellow' as const, text: '株式会社DEFから停止申請が届きました', time: '3時間前' },
  { type: 'blue' as const, text: '新規企業「株式会社GHI」が登録されました', time: '5時間前' },
  { type: 'gray' as const, text: 'システムメンテナンスが完了しました', time: '昨日' },
]

// TODO: 実データに差替え
const RECENT_INTERVIEWS = [
  { applicant: '山田 太郎', company: '株式会社ABC', score: 78, time: '14:30' },
  { applicant: '鈴木 一郎', company: '株式会社XYZ', score: 85, time: '13:15' },
  { applicant: '佐藤 花子', company: '株式会社DEF', score: 62, time: '11:40' },
  { applicant: '田中 次郎', company: '株式会社ABC', score: 91, time: '10:20' },
  { applicant: '高橋 美咲', company: '株式会社GHI', score: 45, time: '09:05' },
]

const INTERVIEW_CHART_SUM = INTERVIEW_CHART_DATA.reduce((a, b) => a + b, 0)
const REVENUE_CHART_SUM = REVENUE_CHART_DATA.reduce((a, b) => a + b, 0)

function UpArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function YenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 18V6" />
    </svg>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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

function CircleXIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
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

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
  if (score >= 60) return 'bg-blue-500/15 text-blue-400 border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
  if (score >= 40) return 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 shadow-[0_0_12px_rgba(234,179,8,0.2)]'
  return 'bg-red-500/15 text-red-400 border border-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
}

function getAlertIcon(type: 'red' | 'yellow' | 'blue' | 'gray') {
  const map = { red: CircleXIcon, yellow: PauseIcon, blue: PlusIcon, gray: GearIcon }
  return map[type]
}

function getAlertIconBg(type: 'red' | 'yellow' | 'blue' | 'gray'): string {
  const map = { red: 'bg-red-500/10', yellow: 'bg-yellow-500/10', blue: 'bg-blue-500/10', gray: 'bg-gray-500/10' }
  return map[type]
}

function getAlertIconColor(type: 'red' | 'yellow' | 'blue' | 'gray'): string {
  const map = { red: 'text-red-400', yellow: 'text-yellow-400', blue: 'text-blue-400', gray: 'text-gray-500' }
  return map[type]
}

const CARD_BASE = 'bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-white/[0.15] hover:shadow-[0_8px_32px_rgba(59,130,246,0.1)] transition-all duration-500'

export default function AdminDashboardPage() {
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const handleShowAllClick = (message: string) => {
    setToastMessage(message)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const chartMax = Math.max(...INTERVIEW_CHART_DATA)
  const revenueMax = Math.max(...REVENUE_CHART_DATA)
  const chartWidth = 560
  const chartHeight = 220
  const barWidth = 42
  const barGap = (chartWidth - barWidth * INTERVIEW_CHART_DATA.length) / (INTERVIEW_CHART_DATA.length + 1)
  const graphTop = 20
  const graphHeight = chartHeight - 55

  const revenuePoints = REVENUE_CHART_DATA.map((val, i) => {
    const x = (chartWidth / (REVENUE_CHART_DATA.length - 1)) * i
    const y = chartHeight - 35 - (val / revenueMax) * graphHeight
    return `${x},${y}`
  }).join(' ')
  const areaPathD = `M 0,${chartHeight - 35} L ${revenuePoints} L ${chartWidth},${chartHeight - 35} Z`

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`,
        }}
      />
      <div className="space-y-4">
        {/* セクション1: KPIカード */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* カード1: 本日の面接 */}
          <div className={`relative overflow-hidden ${CARD_BASE}`}>
            <div className="h-[2px] bg-gradient-to-r from-blue-500 via-blue-400 to-transparent rounded-t-2xl" />
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl" />
            <div className="p-5 relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">本日の面接</p>
              </div>
              <p className="text-3xl font-extrabold text-white mt-1">{KPI.todayInterviews}件</p>
              <div className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5">
                <UpArrowIcon className="w-3 h-3" />
                +{KPI.todayInterviewsDiff}件（前日比）
              </div>
            </div>
          </div>

          {/* カード2: 今月の売上 */}
          <div className={`relative overflow-hidden ${CARD_BASE}`}>
            <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent rounded-t-2xl" />
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl" />
            <div className="p-5 relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <YenIcon className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">今月の売上</p>
              </div>
              <p className="text-3xl font-extrabold text-white mt-1">¥{KPI.monthlyRevenue.toLocaleString()}</p>
              <p className="text-sm text-emerald-400 mt-2">+{KPI.monthlyRevenueDiff}%（前月比）</p>
            </div>
          </div>

          {/* カード3: アクティブ企業 */}
          <div className={`relative overflow-hidden ${CARD_BASE}`}>
            <div className="h-[2px] bg-gradient-to-r from-purple-500 via-purple-400 to-transparent rounded-t-2xl" />
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-purple-500/10 rounded-full blur-xl" />
            <div className="p-5 relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <BuildingIcon className="w-4 h-4 text-purple-400" />
                </div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">アクティブ企業</p>
              </div>
              <p className="text-3xl font-extrabold text-white mt-1">{KPI.activeCompanies}社</p>
              <p className="text-xs text-gray-500 mt-2">全{KPI.totalCompanies}社中</p>
            </div>
          </div>

          {/* カード4: 未対応アラート */}
          <div
            className={`relative overflow-hidden ${CARD_BASE} ${
              KPI.pendingAlerts >= 1 ? 'bg-gradient-to-br from-red-500/[0.07] to-white/[0.02]' : ''
            }`}
          >
            <div className="h-[2px] bg-gradient-to-r from-red-500 via-red-400 to-transparent rounded-t-2xl" />
            <div className="absolute -top-6 -right-6 w-20 h-20 bg-red-500/10 rounded-full blur-xl" />
            <div className="p-5 relative">
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex items-center gap-2 shrink-0">
                  <div className="w-8 h-8 bg-red-500/10 rounded-xl flex items-center justify-center">
                    <BellIcon className="w-4 h-4 text-red-400" />
                  </div>
                  {KPI.pendingAlerts >= 1 && <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                </div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">未対応アラート</p>
              </div>
              <p className="text-3xl font-extrabold text-red-400 mt-1">{KPI.pendingAlerts}件</p>
              <p className="text-sm text-gray-500 mt-2">{KPI.alertDetail}</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-2" />

        {/* セクション2 & 3: グラフ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className={`${CARD_BASE} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">直近7日間の面接件数</h3>
              <span className="text-xs text-gray-500">合計 {INTERVIEW_CHART_SUM}件</span>
            </div>
            <div className="w-full overflow-x-auto">
              <svg viewBox="0 0 560 220" width="100%" className="min-w-[280px]" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="barGradient" x1="0%" y1="100%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#A78BFA" />
                  </linearGradient>
                </defs>
                {[1, 2, 3].map((i) => (
                  <line key={i} x1="0" y1={graphTop + (graphHeight / 4) * i} x2={chartWidth} y2={graphTop + (graphHeight / 4) * i} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="6 6" />
                ))}
                {INTERVIEW_CHART_DATA.map((val, i) => {
                  const x = barGap + i * (barWidth + barGap)
                  const barH = chartMax > 0 ? (val / chartMax) * graphHeight : 0
                  const y = chartHeight - 35 - barH
                  return (
                    <g key={i}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barH}
                        rx="8"
                        fill="url(#barGradient)"
                        filter="drop-shadow(0 -4px 12px rgba(139,92,246,0.35))"
                        className="opacity-70 hover:opacity-100 transition-opacity duration-200"
                      />
                      <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fill="#C4B5FD" fontSize="12" fontWeight="700">
                        {val}
                      </text>
                    </g>
                  )
                })}
                {INTERVIEW_CHART_LABELS.map((label, i) => {
                  const x = barGap + barWidth / 2 + i * (barWidth + barGap)
                  return (
                    <text key={i} x={x} y={chartHeight - 10} textAnchor="middle" fill="#6B7280" fontSize="11">
                      {label}
                    </text>
                  )
                })}
              </svg>
            </div>
          </div>

          <div className={`${CARD_BASE} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">直近7日間の売上</h3>
              <span className="text-xs text-gray-500">合計 ¥{REVENUE_CHART_SUM.toLocaleString()}</span>
            </div>
            <div className="w-full overflow-x-auto">
              <svg viewBox="0 0 560 220" width="100%" className="min-w-[280px]" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.30" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#06B6D4" />
                  </linearGradient>
                </defs>
                {[1, 2, 3].map((i) => (
                  <line key={i} x1="0" y1={graphTop + (graphHeight / 4) * i} x2={chartWidth} y2={graphTop + (graphHeight / 4) * i} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="6 6" />
                ))}
                <path d={areaPathD} fill="url(#areaGrad)" />
                <polyline
                  points={revenuePoints}
                  fill="none"
                  stroke="url(#lineGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="drop-shadow(0 0 12px rgba(16,185,129,0.5))"
                />
                {REVENUE_CHART_DATA.map((val, i) => {
                  const x = (chartWidth / (REVENUE_CHART_DATA.length - 1)) * i
                  const y = chartHeight - 35 - (val / revenueMax) * graphHeight
                  return (
                    <circle
                      key={i}
                      cx={x}
                      cy={y}
                      r="5"
                      fill="#10B981"
                      stroke="#065F46"
                      strokeWidth="2.5"
                      filter="drop-shadow(0 0 8px rgba(16,185,129,0.6))"
                    />
                  )
                })}
                {REVENUE_CHART_LABELS.map((label, i) => {
                  const x = (chartWidth / (REVENUE_CHART_DATA.length - 1)) * i
                  return (
                    <text key={i} x={x} y={chartHeight - 10} textAnchor="middle" fill="#6B7280" fontSize="11">
                      {label}
                    </text>
                  )
                })}
              </svg>
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-2" />

        {/* セクション4 & 5: アラート・面接完了 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className={`${CARD_BASE} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">最新アラート</h3>
              <button
                type="button"
                onClick={() => handleShowAllClick('アラート一覧は今後実装予定です')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer transition-colors"
              >
                すべて見る
              </button>
              {/* TODO: アラート一覧ページへ */}
            </div>
            <div className="divide-y divide-white/5">
              {ALERTS.map((a, i) => {
                const AlertIcon = getAlertIcon(a.type)
                return (
                  <div key={i} className="py-2.5 flex items-center gap-3 border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] rounded-lg -mx-2 px-2 transition-colors duration-200 cursor-pointer">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${getAlertIconBg(a.type)}`}>
                      <AlertIcon className={`w-4 h-4 ${getAlertIconColor(a.type)}`} />
                    </div>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="text-sm text-gray-200">{a.text}</p>
                      <span className="ml-auto text-xs text-gray-600 shrink-0">{a.time}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={`${CARD_BASE} p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">最近の面接完了</h3>
              <button
                type="button"
                onClick={() => handleShowAllClick('面接完了一覧は今後実装予定です')}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer transition-colors"
              >
                すべて見る
              </button>
            </div>
            <div className="divide-y divide-white/5">
              {RECENT_INTERVIEWS.map((r, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between border-b border-white/5 last:border-b-0 hover:bg-white/[0.03] rounded-lg -mx-2 px-2 transition-colors duration-200 cursor-pointer">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{r.applicant}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.company}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-lg px-2.5 py-0.5 text-xs font-bold ${getScoreBadgeClass(r.score)}`}>
                      {r.score}点
                    </span>
                    <span className="text-xs text-gray-600">{r.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* トースト */}
      {toastVisible && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center px-5 py-3 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 text-gray-300 text-sm rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          <InfoIcon className="w-4 h-4 text-blue-400 mr-2 shrink-0" />
          {toastMessage}
        </div>
      )}
    </>
  )
}

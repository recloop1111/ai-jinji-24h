'use client'

import { useState } from 'react'

// TODO: 実データに差替え
const BILLING_DATA = [
  { id: 1, company: '株式会社ABC', industry: 'IT・通信', plan: 'プランC', monthlyFee: 150000, interviewsUsed: 45, interviewLimit: 50, status: 'paid', nextBillingDate: '2026-03-01' },
  { id: 2, company: '株式会社テックフロンティア', industry: 'IT・通信', plan: 'プランB', monthlyFee: 100000, interviewsUsed: 28, interviewLimit: 30, status: 'billed', nextBillingDate: '2026-03-01' },
  { id: 3, company: '山田商事株式会社', industry: '商社・卸売', plan: 'プランA', monthlyFee: 50000, interviewsUsed: 8, interviewLimit: 10, status: 'unbilled', nextBillingDate: '2026-03-15' },
  { id: 4, company: '株式会社グローバルHR', industry: '人材サービス', plan: 'カスタム', monthlyFee: 300000, interviewsUsed: 120, interviewLimit: 200, status: 'paid', nextBillingDate: '2026-03-01' },
  { id: 5, company: '株式会社スタートアップラボ', industry: 'IT・通信', plan: 'プランA', monthlyFee: 50000, interviewsUsed: 5, interviewLimit: 10, status: 'overdue', nextBillingDate: '2026-02-15' },
  { id: 6, company: '株式会社サンライズ', industry: '飲食・フード', plan: 'プランB', monthlyFee: 100000, interviewsUsed: 22, interviewLimit: 30, status: 'billed', nextBillingDate: '2026-03-01' },
  { id: 7, company: '東京メディカル株式会社', industry: '医療・福祉', plan: 'プランC', monthlyFee: 150000, interviewsUsed: 38, interviewLimit: 50, status: 'unbilled', nextBillingDate: '2026-03-10' },
  { id: 8, company: '株式会社エデュケーション・プラス', industry: '教育・学習', plan: 'プランB', monthlyFee: 100000, interviewsUsed: 15, interviewLimit: 30, status: 'overdue', nextBillingDate: '2026-02-10' },
]

// TODO: 実データに差替え（月次売上・万円）
const MONTHLY_SALES = [180, 195, 200, 210, 220, 215, 230, 240, 235, 245, 250, 246]
const MONTH_LABELS = ['3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月']

// TODO: 実データに差替え（サマリー数値）
const SUMMARY = {
  monthlyRevenue: 2460000,
  revenueGrowth: 8.2,
  unbilledAmount: 380000,
  unbilledCount: 3,
  unpaidAmount: 150000,
  unpaidCount: 2,
  overdueCount: 1,
  yearlyRevenue: 24800000,
  yearlyTarget: 30000000,
  achievementRate: 82.7,
}

const ITEMS_PER_PAGE = 8

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function getPlanBadgeClass(plan: string): string {
  const map: Record<string, string> = {
    'プランA': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    'プランB': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    'プランC': 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    'カスタム': 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  }
  return map[plan] ?? 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
}

function getBillingStatusConfig(status: string): { dotClass: string; textClass: string; label: string } {
  const map: Record<string, { dotClass: string; textClass: string; label: string }> = {
    paid: { dotClass: 'bg-blue-400', textClass: 'text-blue-400', label: '入金確認済み' },
    billed: { dotClass: 'bg-emerald-400', textClass: 'text-emerald-400', label: '請求済み' },
    unbilled: { dotClass: 'bg-amber-400', textClass: 'text-amber-400', label: '未請求' },
    overdue: { dotClass: 'bg-red-400', textClass: 'text-red-400', label: '支払い遅延' },
  }
  return map[status] ?? { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: status }
}

function formatYen(n: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n)
}

export default function BillingPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  const filteredData = BILLING_DATA.filter((item) => {
    const matchesSearch = searchQuery === '' || item.company.includes(searchQuery)
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter
    const matchesPlan = planFilter === 'all' || item.plan === planFilter
    return matchesSearch && matchesStatus && matchesPlan
    // TODO: periodFilter による日付フィルタリングは実データ接続時に実装
  })

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const maxSales = Math.max(...MONTHLY_SALES)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* セクション1: ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">課金管理</h1>
            <p className="text-sm text-gray-400 mt-1">全企業の課金状況と請求管理</p>
          </div>
          <button
            type="button"
            onClick={() => showToast('請求書一括生成機能は今後実装予定です')}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl shrink-0"
          >
            <DocumentIcon className="w-4 h-4" />
            請求書一括生成
          </button>
        </div>

        {/* セクション2: サマリーカード4枚 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{formatYen(SUMMARY.monthlyRevenue)}</p>
            <p className="text-sm text-gray-400 mt-0.5">今月の売上</p>
            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
              <ArrowUpIcon className="w-3 h-3" />
              前月比 +{SUMMARY.revenueGrowth}%
            </p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{formatYen(SUMMARY.unbilledAmount)}</p>
            <p className="text-sm text-gray-400 mt-0.5">未請求額</p>
            <p className="text-xs text-gray-500 mt-1">{SUMMARY.unbilledCount}社分</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{formatYen(SUMMARY.unpaidAmount)}</p>
            <p className="text-sm text-gray-400 mt-0.5">未入金額</p>
            <p className="text-xs text-red-400 mt-1">{SUMMARY.unpaidCount}社・期限超過{SUMMARY.overdueCount}社</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{formatYen(SUMMARY.yearlyRevenue)}</p>
            <p className="text-sm text-gray-400 mt-0.5">年間累計売上</p>
            <p className="text-xs text-gray-500 mt-1">達成率 {SUMMARY.achievementRate}%</p>
            <div className="mt-2 w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${SUMMARY.achievementRate}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">目標 {formatYen(SUMMARY.yearlyTarget)}</p>
          </div>
        </div>

        {/* セクション3: 月次売上推移グラフ */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">月次売上推移</h2>
          <div className="flex gap-3">
            <div className="flex flex-col justify-between shrink-0 pr-2 border-r border-white/[0.06] text-right h-64">
              {['¥3M', '¥2M', '¥1M', '¥0'].map((label) => (
                <span key={label} className="text-xs text-gray-600">
                  {label}
                </span>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-64 relative flex flex-col">
                <div className="absolute inset-0 flex flex-col pointer-events-none">
                  <div className="flex-1 border-t border-white/[0.06]" />
                  <div className="flex-1 border-t border-white/[0.06]" />
                  <div className="flex-1 border-t border-white/[0.06]" />
                  <div className="flex-1 border-t border-white/[0.06]" />
                </div>
                <div className="absolute inset-0 flex items-end justify-around gap-1 pb-0">
                  {MONTHLY_SALES.map((val, i) => {
                    const heightPct = maxSales > 0 ? (val / maxSales) * 100 : 0
                    const amount = val * 10000
                    return (
                      <div
                        key={i}
                        className="flex-1 min-w-0 flex flex-col items-center justify-end h-full relative"
                        onMouseEnter={() => setHoveredBar(i)}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        {hoveredBar === i && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 bg-gray-900 border border-white/[0.1] rounded-lg px-2 py-1 text-xs text-white whitespace-nowrap">
                            {formatYen(amount)}
                          </div>
                        )}
                        <div
                          className={`w-8 lg:w-10 rounded-t-md transition-all duration-200 flex-shrink-0 ${
                            hoveredBar === i ? 'bg-gradient-to-t from-blue-500 to-blue-300' : 'bg-gradient-to-t from-blue-600 to-blue-400'
                          }`}
                          style={{ height: `${heightPct}%`, minHeight: val > 0 ? '4px' : 0 }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex justify-around gap-1 mt-2">
                {MONTH_LABELS.map((label, i) => (
                  <span key={i} className="flex-1 min-w-0 text-center text-xs text-gray-500 truncate">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* セクション4: 検索・フィルターバー */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] lg:max-w-[240px]">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                placeholder="企業名で検索"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">全て</option>
              <option value="paid">入金確認済み</option>
              <option value="billed">請求済み</option>
              <option value="unbilled">未請求</option>
              <option value="overdue">支払い遅延</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">全て</option>
              <option value="プランA">プランA</option>
              <option value="プランB">プランB</option>
              <option value="プランC">プランC</option>
              <option value="カスタム">カスタム</option>
            </select>
          </div>
        </div>

        {/* セクション5: 企業別課金テーブル（lg以上） */}
        <div className="hidden lg:block bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">企業名</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">プラン</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">月額料金</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">今月利用面接数</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">請求ステータス</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">次回請求日</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-sm text-gray-500 py-16 text-center">
                      該当するデータがありません
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((row) => {
                    const statusConfig = getBillingStatusConfig(row.status)
                    const pct = row.interviewLimit > 0 ? (row.interviewsUsed / row.interviewLimit) * 100 : 0
                    return (
                      <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-all duration-150">
                        <td className="py-4 px-5">
                          <div>
                            <p className="text-sm font-medium text-white">{row.company}</p>
                            <p className="text-xs text-gray-500">{row.industry}</p>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 ${getPlanBadgeClass(row.plan)}`}>
                            {row.plan}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-sm text-gray-300">{formatYen(row.monthlyFee)}</td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-300">{row.interviewsUsed} / {row.interviewLimit}</span>
                            <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden shrink-0">
                              <div
                                className="bg-blue-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className={`inline-flex items-center gap-2 ${statusConfig.textClass}`}>
                            <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                            <span className="text-sm">{statusConfig.label}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-sm text-gray-400">{row.nextBillingDate}</td>
                        <td className="py-4 px-5">
                          <button
                            type="button"
                            onClick={() => showToast('課金詳細ページは今後実装予定です')}
                            className="text-xs text-blue-400 hover:text-blue-300 mr-3"
                          >
                            詳細
                          </button>
                          <button
                            type="button"
                            onClick={() => showToast('請求書発行機能は今後実装予定です')}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            請求書発行
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* セクション6: ページネーション */}
          {filteredData.length > 0 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04]">
              <p className="text-sm text-gray-400">
                全{filteredData.length}社中 {(currentPage - 1) * ITEMS_PER_PAGE + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)}社を表示
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  前へ
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`w-9 h-9 text-sm rounded-lg transition-colors ${
                      currentPage === p ? 'bg-blue-600 text-white' : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  次へ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* モバイル・タブレット: カード形式 */}
        <div className="lg:hidden space-y-3">
          {paginatedData.length === 0 ? (
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-8 text-center text-sm text-gray-500">
              該当するデータがありません
            </div>
          ) : (
            paginatedData.map((row) => {
              const statusConfig = getBillingStatusConfig(row.status)
              const pct = row.interviewLimit > 0 ? (row.interviewsUsed / row.interviewLimit) * 100 : 0
              return (
                <div key={row.id} className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{row.company}</p>
                      <p className="text-xs text-gray-500">{row.industry}</p>
                    </div>
                    <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 shrink-0 ${getPlanBadgeClass(row.plan)}`}>
                      {row.plan}
                    </span>
                  </div>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-300">{formatYen(row.monthlyFee)} / 月</p>
                    <p className="text-sm text-gray-400">面接 {row.interviewsUsed} / {row.interviewLimit}</p>
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className={`inline-flex items-center gap-1.5 ${statusConfig.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                      <span className="text-xs">{statusConfig.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">次回請求: {row.nextBillingDate}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => showToast('課金詳細ページは今後実装予定です')}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      詳細
                    </button>
                    <button
                      type="button"
                      onClick={() => showToast('請求書発行機能は今後実装予定です')}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      請求書発行
                    </button>
                  </div>
                </div>
              )
            })
          )}
          {filteredData.length > 0 && (
            <div className="flex items-center justify-between pt-4 pb-2">
              <p className="text-sm text-gray-400">
                全{filteredData.length}社中 {(currentPage - 1) * ITEMS_PER_PAGE + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)}社を表示
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50"
                >
                  前へ
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`w-9 h-9 text-sm rounded-lg ${
                      currentPage === p ? 'bg-blue-600 text-white' : 'bg-white/[0.05] text-gray-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50"
                >
                  次へ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* トースト */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/[0.08] backdrop-blur-2xl border border-white/[0.10] rounded-xl shadow-lg px-5 py-3 text-sm text-gray-300">
          {toastMessage}
        </div>
      )}
    </>
  )
}

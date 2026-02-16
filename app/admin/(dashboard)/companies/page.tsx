'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Download, Building2, CheckCircle, Clock, Square } from 'lucide-react'

// TODO: 実データに差替え
const DUMMY_COMPANIES = [
  { id: '1', name: '株式会社ABC', industry: 'IT・ソフトウェア', plan: 'プランB', planKey: 'B', status: 'active', interviewsThisMonth: 14, interviewLimit: 20, contractStart: '2024-10-15', contactName: '佐藤 美咲', contactEmail: 'sato@abc-corp.co.jp' },
  { id: '2', name: '株式会社テックフロンティア', industry: 'IT・通信', plan: 'プランC', planKey: 'C', status: 'active', interviewsThisMonth: 25, interviewLimit: 30, contractStart: '2024-08-01', contactName: '鈴木 太郎', contactEmail: 'suzuki@techfrontier.co.jp' },
  { id: '3', name: '山田商事株式会社', industry: '商社・卸売', plan: 'プランA', planKey: 'A', status: 'active', interviewsThisMonth: 7, interviewLimit: 10, contractStart: '2024-11-20', contactName: '山田 花子', contactEmail: 'yamada@yamada-shoji.co.jp' },
  { id: '4', name: '株式会社グローバルHR', industry: '人材サービス', plan: 'カスタム', planKey: 'custom', status: 'active', interviewsThisMonth: 45, interviewLimit: 50, contractStart: '2024-06-01', contactName: '田中 健一', contactEmail: 'tanaka@globalhr.co.jp' },
  { id: '5', name: '株式会社スタートアップラボ', industry: 'IT・スタートアップ', plan: 'プランA', planKey: 'A', status: 'trial', interviewsThisMonth: 3, interviewLimit: 10, contractStart: '2025-01-10', contactName: '高橋 直人', contactEmail: 'takahashi@startuplab.co.jp' },
  { id: '6', name: '東京建設株式会社', industry: '建設・不動産', plan: 'プランB', planKey: 'B', status: 'trial', interviewsThisMonth: 5, interviewLimit: 20, contractStart: '2025-01-15', contactName: '伊藤 真理', contactEmail: 'ito@tokyo-kensetsu.co.jp' },
  { id: '7', name: '株式会社フードネクスト', industry: '飲食・フード', plan: 'プランA', planKey: 'A', status: 'suspended', interviewsThisMonth: 0, interviewLimit: 10, contractStart: '2024-09-01', contactName: '中村 優子', contactEmail: 'nakamura@foodnext.co.jp' },
  { id: '8', name: '関西メディカル株式会社', industry: '医療・ヘルスケア', plan: 'プランB', planKey: 'B', status: 'cancelled', interviewsThisMonth: 0, interviewLimit: 20, contractStart: '2024-07-01', contactName: '小林 誠', contactEmail: 'kobayashi@kansai-medical.co.jp' },
]

type StatusFilter = 'all' | 'active' | 'trial' | 'suspended' | 'cancelled'
type PlanFilter = 'all' | 'A' | 'B' | 'C' | 'custom'

function getPlanBadgeClass(planKey: string): string {
  const map: Record<string, string> = {
    A: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    B: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    C: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    custom: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  }
  return map[planKey] ?? 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
}

function getStatusConfig(status: string): { dotClass: string; textClass: string; label: string } {
  const map: Record<string, { dotClass: string; textClass: string; label: string }> = {
    active: { dotClass: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]', textClass: 'text-emerald-400', label: 'アクティブ' },
    trial: { dotClass: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]', textClass: 'text-amber-400', label: 'トライアル' },
    suspended: { dotClass: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]', textClass: 'text-red-400', label: '停止中' },
    cancelled: { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: '解約済み' },
  }
  return map[status] ?? { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: status }
}

// TODO: 実データに差替え（サマリー数値）
const SUMMARY = {
  total: 24,
  active: 18,
  activePercent: 75,
  trial: 4,
  trialNearExpiry: 2,
  suspended: 2,
}

const ITEMS_PER_PAGE = 8
const TOTAL_PAGES = Math.ceil(SUMMARY.total / ITEMS_PER_PAGE) // 3 pages for 24 items

export default function CompaniesPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const filteredCompanies = useMemo(() => {
    return DUMMY_COMPANIES.filter((c) => {
      const q = searchQuery.trim().toLowerCase()
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.contactName.toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || c.status === statusFilter
      const matchPlan = planFilter === 'all' || c.planKey === planFilter
      return matchSearch && matchStatus && matchPlan
    })
  }, [searchQuery, statusFilter, planFilter])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const handleAddCompany = () => {
    // TODO: 新規企業追加モーダルまたはページ遷移
    showToast('新規企業追加フォームは今後実装予定です')
  }

  const handleCsvExport = () => {
    // TODO: サーバーサイドCSV生成
    showToast('CSV出力機能は今後実装予定です')
  }

  const handleStop = () => {
    showToast('停止処理は今後実装予定です')
  }

  const handleRowClick = (id: string) => {
    router.push(`/admin/companies/${id}`)
  }

  const handleDetailClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    router.push(`/admin/companies/${id}`)
  }

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* セクション1: ページヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">企業管理</h1>
            <p className="text-sm text-gray-400 mt-1">契約企業の一覧と管理</p>
          </div>
          <button
            type="button"
            onClick={handleAddCompany}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-all duration-200 shrink-0"
          >
            <Plus className="w-4 h-4" />
            新規企業を追加
          </button>
        </div>

        {/* セクション2: サマリーカード4枚 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Building2 className="absolute top-4 right-4 w-8 h-8 text-blue-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.total}</p>
            <p className="text-sm text-gray-400 mt-0.5">全企業数</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <CheckCircle className="absolute top-4 right-4 w-8 h-8 text-emerald-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.active}</p>
            <p className="text-sm text-gray-400 mt-0.5">アクティブ</p>
            <p className="text-xs text-emerald-400 mt-1">全体の{SUMMARY.activePercent}%</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Clock className="absolute top-4 right-4 w-8 h-8 text-amber-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.trial}</p>
            <p className="text-sm text-gray-400 mt-0.5">トライアル中</p>
            <p className="text-xs text-amber-400 mt-1">残り期間7日以内: {SUMMARY.trialNearExpiry}社</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Square className="absolute top-4 right-4 w-8 h-8 text-red-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.suspended}</p>
            <p className="text-sm text-gray-400 mt-0.5">停止中</p>
          </div>
        </div>

        {/* セクション3: 検索・フィルターバー */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] lg:max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="企業名・担当者名で検索"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべてのステータス</option>
              <option value="active">アクティブ</option>
              <option value="trial">トライアル</option>
              <option value="suspended">停止中</option>
              <option value="cancelled">解約済み</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべてのプラン</option>
              <option value="A">プランA（1〜10件）</option>
              <option value="B">プランB（11〜20件）</option>
              <option value="C">プランC（21〜30件）</option>
              <option value="custom">カスタム</option>
            </select>
            <button
              type="button"
              onClick={handleCsvExport}
              className="inline-flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-all"
            >
              <Download className="w-4 h-4 shrink-0" />
              CSV出力
            </button>
          </div>
        </div>

        {/* セクション4: 企業一覧テーブル（lg以上） */}
        <div className="hidden lg:block bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">企業名</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">プラン</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">ステータス</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">今月面接数</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">契約開始日</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">担当者</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-sm text-gray-500 py-16 text-center">
                      該当する企業がありません
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((c) => {
                    const statusConfig = getStatusConfig(c.status)
                    const pct = c.interviewLimit > 0 ? (c.interviewsThisMonth / c.interviewLimit) * 100 : 0
                    return (
                      <tr
                        key={c.id}
                        onClick={() => handleRowClick(c.id)}
                        className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-all duration-150 cursor-pointer"
                      >
                        <td className="py-4 px-5">
                          <div>
                            <p className="text-sm font-medium text-white">{c.name}</p>
                            <p className="text-xs text-gray-500">{c.industry}</p>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 ${getPlanBadgeClass(c.planKey)}`}>
                            {c.plan}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div className={`inline-flex items-center gap-2 ${statusConfig.textClass}`}>
                            <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                            <span className="text-sm">{statusConfig.label}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-300">{c.interviewsThisMonth} / {c.interviewLimit}</span>
                            <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden shrink-0">
                              <div
                                className="bg-blue-500 h-full rounded-full transition-all"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-sm text-gray-400">{c.contractStart}</td>
                        <td className="py-4 px-5">
                          <div>
                            <p className="text-sm text-gray-300">{c.contactName}</p>
                            <p className="text-xs text-gray-500">{c.contactEmail}</p>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <button
                            type="button"
                            onClick={(e) => handleDetailClick(e, c.id)}
                            className="text-xs text-blue-400 hover:text-blue-300 mr-3"
                          >
                            詳細
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStop()
                            }}
                            className="text-xs text-red-400/60 hover:text-red-400 ml-3"
                          >
                            停止
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* セクション5: ページネーション */}
          {filteredCompanies.length > 0 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04]">
              <p className="text-sm text-gray-500">
                全{SUMMARY.total}社中 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, SUMMARY.total)}社を表示
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
                {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`w-9 h-9 text-sm rounded-lg transition-colors ${
                      currentPage === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(TOTAL_PAGES, p + 1))}
                  disabled={currentPage >= TOTAL_PAGES}
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
          {filteredCompanies.length === 0 ? (
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-8 text-center text-sm text-gray-500">
              該当する企業がありません
            </div>
          ) : (
            filteredCompanies.map((c) => {
              const statusConfig = getStatusConfig(c.status)
              const pct = c.interviewLimit > 0 ? (c.interviewsThisMonth / c.interviewLimit) * 100 : 0
              return (
                <div
                  key={c.id}
                  onClick={() => handleRowClick(c.id)}
                  className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-3 cursor-pointer active:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.industry}</p>
                    </div>
                    <div className={`inline-flex items-center gap-1.5 shrink-0 ${statusConfig.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                      <span className="text-xs">{statusConfig.label}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`inline-flex text-xs rounded-lg px-2 py-0.5 ${getPlanBadgeClass(c.planKey)}`}>
                      {c.plan}
                    </span>
                    <span className="text-xs text-gray-400">{c.interviewsThisMonth} / {c.interviewLimit} 面接</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{c.contactName}</p>
                    <button
                      type="button"
                      onClick={(e) => handleDetailClick(e, c.id)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      詳細を見る
                    </button>
                  </div>
                  <div className="mt-2 w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              )
            })
          )}
          {filteredCompanies.length > 0 && (
            <div className="flex items-center justify-between pt-4 pb-2">
              <p className="text-sm text-gray-500">
                全{SUMMARY.total}社中 1〜{filteredCompanies.length}社を表示
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
                {Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1).map((p) => (
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
                  onClick={() => setCurrentPage((p) => Math.min(TOTAL_PAGES, p + 1))}
                  disabled={currentPage >= TOTAL_PAGES}
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

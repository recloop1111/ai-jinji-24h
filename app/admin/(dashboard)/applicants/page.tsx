'use client'

import { useState, useMemo } from 'react'
import { Search, Download, Users, CheckCircle, Clock, BarChart3, XCircle, Phone, Mail } from 'lucide-react'

// TODO: 実データに差替え
const DUMMY_APPLICANTS = [
  { id: '1', name: '佐藤 太郎', email: 'taro.sato@example.com', phone: '090-1111-2222', company: '株式会社ABC', companyId: '1', industry: '飲食', pattern: '正社員×新卒', patternType: 'fulltime', status: 'completed', score: 85, date: '2025-02-14', time: '14:00', applicantResult: 'second_pass' },
  { id: '2', name: '田中 美咲', email: 'misaki.tanaka@example.com', phone: '090-2222-3333', company: '株式会社ABC', companyId: '1', industry: '飲食', pattern: '正社員×中途×経験者', patternType: 'fulltime', status: 'completed', score: 72, date: '2025-02-14', time: '11:30', applicantResult: 'considering' },
  { id: '3', name: '鈴木 健太', email: 'kenta.suzuki@example.com', phone: '090-3333-4444', company: '株式会社テックフロンティア', companyId: '2', industry: 'IT', pattern: '正社員×中途×未経験', patternType: 'fulltime', status: 'completed', score: 58, date: '2025-02-13', time: '16:00', applicantResult: 'rejected' },
  { id: '4', name: '高橋 遥', email: 'haruka.takahashi@example.com', phone: '090-4444-5555', company: '株式会社テックフロンティア', companyId: '2', industry: 'IT', pattern: '正社員×新卒', patternType: 'fulltime', status: 'completed', score: 91, date: '2025-02-13', time: '10:00', applicantResult: 'second_pass' },
  { id: '5', name: '伊藤 大輝', email: 'daiki.ito@example.com', phone: '090-5555-6666', company: '山田商事株式会社', companyId: '3', industry: '不動産', pattern: 'アルバイト×経験者', patternType: 'parttime', status: 'completed', score: 45, date: '2025-02-12', time: '13:00', applicantResult: 'rejected' },
  { id: '6', name: '渡辺 さくら', email: 'sakura.watanabe@example.com', phone: '090-6666-7777', company: '株式会社ABC', companyId: '1', industry: '飲食', pattern: '正社員×新卒', patternType: 'fulltime', status: 'waiting', score: null, date: null, time: null, applicantResult: null },
  { id: '7', name: '山本 翔太', email: 'shota.yamamoto@example.com', phone: '090-7777-8888', company: '株式会社グローバルHR', companyId: '4', industry: '人材', pattern: '正社員×中途×経験者', patternType: 'fulltime', status: 'waiting', score: null, date: null, time: null, applicantResult: null },
  { id: '8', name: '中村 愛', email: 'ai.nakamura@example.com', phone: '090-8888-9999', company: '株式会社スタートアップラボ', companyId: '5', industry: '建築', pattern: 'アルバイト×未経験', patternType: 'parttime', status: 'in-progress', score: null, date: '2025-02-15', time: '09:30', applicantResult: null },
  { id: '9', name: '小林 誠', email: 'makoto.kobayashi@example.com', phone: '090-9999-0000', company: '株式会社テックフロンティア', companyId: '2', industry: 'IT', pattern: '正社員×中途×経験者', patternType: 'fulltime', status: 'completed', score: 78, date: '2025-02-11', time: '15:00', applicantResult: 'considering' },
  { id: '10', name: '加藤 由美', email: 'yumi.kato@example.com', phone: '080-1111-0000', company: '山田商事株式会社', companyId: '3', industry: '不動産', pattern: 'アルバイト×未経験', patternType: 'parttime', status: 'withdrawn', score: null, date: '2025-02-10', time: '11:00', applicantResult: null },
  { id: '11', name: '吉田 拓海', email: 'takumi.yoshida@example.com', phone: '080-2222-1111', company: '株式会社ABC', companyId: '1', industry: '飲食', pattern: '正社員×中途×未経験', patternType: 'fulltime', status: 'interrupted', score: null, date: '2025-02-09', time: '14:30', applicantResult: null },
  { id: '12', name: '松本 結衣', email: 'yui.matsumoto@example.com', phone: '080-3333-2222', company: '株式会社グローバルHR', companyId: '4', industry: '人材', pattern: '正社員×新卒', patternType: 'fulltime', status: 'completed', score: 36, date: '2025-02-08', time: '10:00', applicantResult: 'rejected' },
]

type StatusFilter = 'all' | 'completed' | 'waiting' | 'in-progress' | 'withdrawn' | 'interrupted'
type ScoreFilter = 'all' | '80+' | '60-79' | '40-59' | '40-'
type PeriodFilter = 'all' | 'this_month' | 'last_month' | '3months'
type ApplicantResultFilter = 'all' | 'second_pass' | 'rejected' | 'considering'

const INDUSTRY_OPTIONS = [
  { value: 'all', label: 'すべての業種' },
  { value: '飲食', label: '飲食' },
  { value: 'IT', label: 'IT' },
  { value: '不動産', label: '不動産' },
  { value: '人材', label: '人材' },
  { value: '建築', label: '建築' },
]


function getPatternBadgeClass(patternType: string): string {
  return patternType === 'fulltime'
    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
    : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
}

function getStatusConfig(status: string): { dotClass: string; textClass: string; label: string } {
  const map: Record<string, { dotClass: string; textClass: string; label: string }> = {
    completed: { dotClass: 'bg-emerald-400', textClass: 'text-emerald-400', label: '面接完了' },
    waiting: { dotClass: 'bg-amber-400', textClass: 'text-amber-400', label: '面接待ち' },
    'in-progress': { dotClass: 'bg-blue-400 animate-pulse', textClass: 'text-blue-400', label: '面接中' },
    withdrawn: { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: '辞退' },
    interrupted: { dotClass: 'bg-red-400', textClass: 'text-red-400', label: '中断' },
  }
  return map[status] ?? { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: status }
}

function getScoreBadgeClass(score: number | null): string {
  if (score === null) return ''
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
  if (score >= 60) return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
  if (score >= 40) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
  return 'bg-red-500/10 text-red-400 border border-red-500/20'
}

// TODO: 実データに差替え（サマリー数値）
const SUMMARY = {
  total: 342,
  completedThisMonth: 89,
  completedGrowth: 12,
  waiting: 15,
  avgScore: 68.5,
  withdrawnInterrupted: 23,
  withdrawnPercent: 6.7,
}

const ITEMS_PER_PAGE = 12
const TOTAL_PAGES = Math.ceil(SUMMARY.total / ITEMS_PER_PAGE) // 29 pages for 342 items

export default function ApplicantsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [industryFilter, setIndustryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all')
  const [applicantResultFilter, setApplicantResultFilter] = useState<ApplicantResultFilter>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const filteredApplicants = useMemo(() => {
    return DUMMY_APPLICANTS.filter((a) => {
      const q = searchQuery.trim().toLowerCase()
      const matchSearch = !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      const matchIndustry = industryFilter === 'all' || a.industry === industryFilter
      const matchStatus = statusFilter === 'all' || a.status === statusFilter
      const matchScore =
        scoreFilter === 'all' ||
        (a.score !== null &&
          ((scoreFilter === '80+' && a.score >= 80) ||
            (scoreFilter === '60-79' && a.score >= 60 && a.score < 80) ||
            (scoreFilter === '40-59' && a.score >= 40 && a.score < 60) ||
            (scoreFilter === '40-' && a.score < 40)))
      const matchResult = applicantResultFilter === 'all' || a.applicantResult === applicantResultFilter
      const matchPeriod = (() => {
        if (periodFilter === 'all') return true
        if (!a.date) return false
        const d = new Date(a.date)
        const now = new Date()
        if (periodFilter === 'this_month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        if (periodFilter === 'last_month') {
          const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth()
        }
        if (periodFilter === '3months') {
          const three = new Date(now.getFullYear(), now.getMonth() - 3, 1)
          return d >= three
        }
        return true
      })()
      return matchSearch && matchIndustry && matchStatus && matchScore && matchPeriod && matchResult
    })
  }, [searchQuery, industryFilter, statusFilter, scoreFilter, applicantResultFilter, periodFilter])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const handleCsvExport = () => {
    // TODO: サーバーサイドCSV生成
    showToast('CSV出力機能は今後実装予定です')
  }

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* セクション1: ページヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">応募者管理</h1>
            <p className="text-sm text-gray-400 mt-1">全企業の応募者を横断的に管理</p>
          </div>
          <button
            type="button"
            onClick={handleCsvExport}
            className="inline-flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-all shrink-0"
          >
            <Download className="w-4 h-4" />
            CSV出力
          </button>
        </div>

        {/* セクション2: サマリーカード5枚 */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Users className="absolute top-4 right-4 w-8 h-8 text-blue-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.total}</p>
            <p className="text-sm text-gray-400 mt-0.5">全応募者数</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <CheckCircle className="absolute top-4 right-4 w-8 h-8 text-emerald-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.completedThisMonth}</p>
            <p className="text-sm text-gray-400 mt-0.5">今月の面接完了</p>
            <p className="text-xs text-emerald-400 mt-1">前月比 +{SUMMARY.completedGrowth}%</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Clock className="absolute top-4 right-4 w-8 h-8 text-amber-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.waiting}</p>
            <p className="text-sm text-gray-400 mt-0.5">面接待ち</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <BarChart3 className="absolute top-4 right-4 w-8 h-8 text-purple-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.avgScore}</p>
            <p className="text-sm text-gray-400 mt-0.5">平均スコア</p>
            <p className="text-xs text-gray-500 mt-1">点 / 100点満点</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <XCircle className="absolute top-4 right-4 w-8 h-8 text-red-400/50" />
            <p className="text-3xl font-bold text-white">{SUMMARY.withdrawnInterrupted}</p>
            <p className="text-sm text-gray-400 mt-0.5">辞退・中断</p>
            <p className="text-xs text-red-400 mt-1">全体の{SUMMARY.withdrawnPercent}%</p>
          </div>
        </div>

        {/* セクション3: 検索・フィルターバー */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] lg:max-w-[288px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="応募者名・メールで検索"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              {INDUSTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべてのステータス</option>
              <option value="completed">面接完了</option>
              <option value="waiting">面接待ち</option>
              <option value="in-progress">面接中</option>
              <option value="withdrawn">辞退</option>
              <option value="interrupted">中断</option>
            </select>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value as ScoreFilter)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべてのスコア</option>
              <option value="80+">80点以上</option>
              <option value="60-79">60〜79点</option>
              <option value="40-59">40〜59点</option>
              <option value="40-">40点未満</option>
            </select>
            <select
              value={applicantResultFilter}
              onChange={(e) => setApplicantResultFilter(e.target.value as ApplicantResultFilter)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべての結果</option>
              <option value="second_pass">二次通過</option>
              <option value="rejected">不採用</option>
              <option value="considering">検討中</option>
            </select>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">全期間</option>
              <option value="this_month">今月</option>
              <option value="last_month">先月</option>
              <option value="3months">過去3ヶ月</option>
            </select>
          </div>
        </div>

        {/* セクション4: 応募者一覧テーブル（lg以上） */}
        <div className="hidden lg:block bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">応募者名</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">企業名</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">パターン</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">ステータス</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">スコア</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">結果</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">面接日時</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplicants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-sm text-gray-500 py-16 text-center">
                      該当する応募者がありません
                    </td>
                  </tr>
                ) : (
                  filteredApplicants.map((a) => {
                    const statusConfig = getStatusConfig(a.status)
                    const scoreBadgeClass = getScoreBadgeClass(a.score)
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-all duration-150"
                      >
                        <td className="py-4 px-5">
                          <div>
                            <p className="text-sm font-medium text-white">{a.name}</p>
                            <p className="text-xs text-gray-500">{a.email}</p>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-sm text-gray-300">{a.company}</td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex text-xs rounded-lg px-2 py-0.5 ${getPatternBadgeClass(a.patternType)}`}>
                            {a.pattern}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div className={`inline-flex items-center gap-2 ${statusConfig.textClass}`}>
                            <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                            <span className="text-sm">{statusConfig.label}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          {a.score !== null ? (
                            <span className={`inline-flex text-sm font-semibold rounded-lg px-2.5 py-1 ${scoreBadgeClass}`}>
                              {a.score}
                            </span>
                          ) : (
                            <span className="text-sm font-semibold text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          {a.applicantResult ? (
                            <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 font-medium ${
                              a.applicantResult === 'second_pass' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                              a.applicantResult === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {a.applicantResult === 'second_pass' ? '二次通過' : a.applicantResult === 'rejected' ? '不採用' : '検討中'}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          {a.date && a.time ? (
                            <div>
                              <p className="text-sm text-gray-300">{a.date}</p>
                              <p className="text-xs text-gray-500">{a.time}</p>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-600">未実施</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <a href={`tel:${a.phone}`} className="text-gray-400 hover:text-emerald-400 transition-colors" title="電話"><Phone className="w-4 h-4" /></a>
                            <a href={`mailto:${a.email}`} className="text-gray-400 hover:text-blue-400 transition-colors" title="メール"><Mail className="w-4 h-4" /></a>
                            <a href={`/admin/applicants/${a.id}`} className="text-xs text-blue-400 hover:text-blue-300">詳細</a>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* セクション5: ページネーション */}
          {filteredApplicants.length > 0 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04]">
              <p className="text-sm text-gray-500">
                全{SUMMARY.total}名中 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, SUMMARY.total)}名を表示
              </p>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  前へ
                </button>
                {[1, 2, 3].map((p) => (
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
                <span className="w-9 h-9 flex items-center justify-center text-sm text-gray-500">…</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(TOTAL_PAGES)}
                  className={`w-9 h-9 text-sm rounded-lg transition-colors ${
                    currentPage === TOTAL_PAGES ? 'bg-blue-600 text-white' : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
                  }`}
                >
                  {TOTAL_PAGES}
                </button>
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
          {filteredApplicants.length === 0 ? (
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-8 text-center text-sm text-gray-500">
              該当する応募者がありません
            </div>
          ) : (
            filteredApplicants.map((a) => {
              const statusConfig = getStatusConfig(a.status)
              const scoreBadgeClass = getScoreBadgeClass(a.score)
              return (
                <div
                  key={a.id}
                  className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 mb-3"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{a.name}</p>
                      <p className="text-xs text-gray-500">{a.company}</p>
                    </div>
                    <div className={`inline-flex items-center gap-1.5 shrink-0 ${statusConfig.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                      <span className="text-xs">{statusConfig.label}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {a.score !== null ? (
                      <span className={`inline-flex text-sm font-semibold rounded-lg px-2.5 py-1 ${scoreBadgeClass}`}>
                        {a.score}点
                      </span>
                    ) : (
                      <span className="text-sm text-gray-600">—</span>
                    )}
                    {a.applicantResult ? (
                      <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 font-medium ${
                        a.applicantResult === 'second_pass' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                        a.applicantResult === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {a.applicantResult === 'second_pass' ? '二次通過' : a.applicantResult === 'rejected' ? '不採用' : '検討中'}
                      </span>
                    ) : null}
                    <span className="text-xs text-gray-500">
                      {a.date && a.time ? `${a.date} ${a.time}` : '未実施'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`tel:${a.phone}`} className="text-gray-400 hover:text-emerald-400 transition-colors" title="電話"><Phone className="w-4 h-4" /></a>
                    <a href={`mailto:${a.email}`} className="text-gray-400 hover:text-blue-400 transition-colors" title="メール"><Mail className="w-4 h-4" /></a>
                    <a href={`/admin/applicants/${a.id}`} className="text-xs text-blue-400 hover:text-blue-300">詳細を見る</a>
                  </div>
                </div>
              )
            })
          )}
          {filteredApplicants.length > 0 && (
            <div className="flex items-center justify-between pt-4 pb-2">
              <p className="text-sm text-gray-500">
                全{SUMMARY.total}名中 1〜{filteredApplicants.length}名を表示
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

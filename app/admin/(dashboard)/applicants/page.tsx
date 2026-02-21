'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Download, Users, CheckCircle, Clock, BarChart3, XCircle, Phone, Mail } from 'lucide-react'
import Link from 'next/link'

type StatusFilter = 'all' | '準備中' | '完了' | '途中離脱'
type ScoreFilter = 'all' | '80+' | '60-79' | '40-59' | '40-'
type PeriodFilter = 'all' | 'this_month' | 'last_month' | '3months'
type ResultFilter = 'all' | 'pending' | 'considering' | 'second_pass' | 'rejected' | 'hired'

type Applicant = {
  id: string
  name: string
  email: string
  phone: string
  company_id: string
  company_name: string
  status: string
  selection_status: string | null
  created_at: string
  interview_scheduled_at: string | null
  total_score: number | null
  recommendation_rank: string | null
  culture_fit_score: number | null
}

function getStatusConfig(status: string): { dotClass: string; textClass: string; label: string } {
  const map: Record<string, { dotClass: string; textClass: string; label: string }> = {
    '完了': { dotClass: 'bg-emerald-400', textClass: 'text-emerald-400', label: '完了' },
    '準備中': { dotClass: 'bg-amber-400', textClass: 'text-amber-400', label: '準備中' },
    '途中離脱': { dotClass: 'bg-red-400', textClass: 'text-red-400', label: '途中離脱' },
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

function getResultLabel(result: string | null): string {
  const map: Record<string, string> = {
    pending: '未対応',
    considering: '検討中',
    second_pass: '二次通過',
    rejected: '不採用',
    hired: '内定',
  }
  return map[result || 'pending'] || '未対応'
}

function getResultBadgeClass(result: string | null): string {
  const map: Record<string, string> = {
    pending: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
    considering: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    second_pass: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
    rejected: 'bg-red-500/10 text-red-400 border border-red-500/20',
    hired: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  }
  return map[result || 'pending'] || map.pending
}

const ITEMS_PER_PAGE = 20

export default function AdminApplicantsPage() {
  const supabase = createClient()
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const { data: applicantsData, error: appError } = await supabase
          .from('applicants')
          .select('*')
          .order('created_at', { ascending: false })

        if (appError) {
          console.error('[AdminApplicants] Applicants fetch error:', appError.message)
        }

        const { data: companiesData } = await supabase
          .from('companies')
          .select('id, name')

        const { data: resultsData } = await supabase
          .from('interview_results')
          .select('applicant_id, total_score, detail_json, culture_fit_score')

        const resultsMap: Record<string, any> = {}
        if (resultsData) {
          resultsData.forEach((r: any) => {
            resultsMap[r.applicant_id] = r
          })
        }

        const companiesMap: Record<string, string> = {}
        if (companiesData) {
          companiesData.forEach((c: any) => {
            companiesMap[c.id] = c.name
          })
        }

        const merged: Applicant[] = (applicantsData || []).map((a: any) => {
          const ir = resultsMap[a.id] || null
          return {
            id: a.id,
            name: `${a.last_name || ''} ${a.first_name || ''}`.trim() || a.name || '名前不明',
            email: a.email || '',
            phone: a.phone || '',
            company_id: a.company_id,
            company_name: companiesMap[a.company_id] || '不明',
            status: a.status || '準備中',
            selection_status: a.selection_status || 'pending',
            created_at: a.created_at,
            interview_scheduled_at: a.interview_scheduled_at,
            total_score: ir?.total_score ?? null,
            recommendation_rank: ir?.detail_json?.recommendation_rank ?? null,
            culture_fit_score: ir?.culture_fit_score ?? null,
          }
        })

        setApplicants(merged)
        setCompanies(companiesData || [])
      } catch (err: any) {
        console.error('[AdminApplicants] Error:', err?.message || err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [supabase])

  const filteredApplicants = useMemo(() => {
    return applicants.filter((a) => {
      const q = searchQuery.trim().toLowerCase()
      const matchSearch = !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      const matchCompany = companyFilter === 'all' || a.company_id === companyFilter
      const matchStatus = statusFilter === 'all' || a.status === statusFilter
      const matchScore =
        scoreFilter === 'all' ||
        (a.total_score !== null &&
          ((scoreFilter === '80+' && a.total_score >= 80) ||
            (scoreFilter === '60-79' && a.total_score >= 60 && a.total_score < 80) ||
            (scoreFilter === '40-59' && a.total_score >= 40 && a.total_score < 60) ||
            (scoreFilter === '40-' && a.total_score < 40)))
      const matchResult = resultFilter === 'all' || a.selection_status === resultFilter
      const matchPeriod = (() => {
        if (periodFilter === 'all') return true
        if (!a.created_at) return false
        const d = new Date(a.created_at)
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
      return matchSearch && matchCompany && matchStatus && matchScore && matchPeriod && matchResult
    })
  }, [applicants, searchQuery, companyFilter, statusFilter, scoreFilter, resultFilter, periodFilter])

  const totalPages = Math.ceil(filteredApplicants.length / ITEMS_PER_PAGE)
  const paginatedApplicants = filteredApplicants.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  const summary = useMemo(() => {
    const total = applicants.length
    const completed = applicants.filter((a) => a.status === '完了').length
    const waiting = applicants.filter((a) => a.status === '準備中').length
    const withdrawn = applicants.filter((a) => a.status === '途中離脱').length
    const completedWithScore = applicants.filter((a) => a.status === '完了' && a.total_score !== null)
    const avgScore = completedWithScore.length > 0
      ? (completedWithScore.reduce((sum, a) => sum + (a.total_score || 0), 0) / completedWithScore.length).toFixed(1)
      : '—'
    const withdrawnPercent = total > 0 ? ((withdrawn / total) * 100).toFixed(1) : '0'
    return { total, completed, waiting, withdrawn, avgScore, withdrawnPercent }
  }, [applicants])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const handleCsvExport = () => {
    showToast('CSV出力機能は今後実装予定です')
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* ページヘッダー */}
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

        {/* サマリーカード */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Users className="absolute top-4 right-4 w-8 h-8 text-blue-400/50" />
            <p className="text-3xl font-bold text-white">{summary.total}</p>
            <p className="text-sm text-gray-400 mt-0.5">全応募者数</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <CheckCircle className="absolute top-4 right-4 w-8 h-8 text-emerald-400/50" />
            <p className="text-3xl font-bold text-white">{summary.completed}</p>
            <p className="text-sm text-gray-400 mt-0.5">面接完了</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Clock className="absolute top-4 right-4 w-8 h-8 text-amber-400/50" />
            <p className="text-3xl font-bold text-white">{summary.waiting}</p>
            <p className="text-sm text-gray-400 mt-0.5">面接待ち</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <BarChart3 className="absolute top-4 right-4 w-8 h-8 text-purple-400/50" />
            <p className="text-3xl font-bold text-white">{summary.avgScore}</p>
            <p className="text-sm text-gray-400 mt-0.5">平均スコア</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <XCircle className="absolute top-4 right-4 w-8 h-8 text-red-400/50" />
            <p className="text-3xl font-bold text-white">{summary.withdrawn}</p>
            <p className="text-sm text-gray-400 mt-0.5">途中離脱</p>
            <p className="text-xs text-red-400 mt-1">全体の{summary.withdrawnPercent}%</p>
          </div>
        </div>

        {/* 検索・フィルターバー */}
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] lg:max-w-[288px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                placeholder="応募者名・メールで検索"
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>
            <select
              value={companyFilter}
              onChange={(e) => { setCompanyFilter(e.target.value); setCurrentPage(1) }}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべての企業</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setCurrentPage(1) }}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべてのステータス</option>
              <option value="完了">完了</option>
              <option value="準備中">準備中</option>
              <option value="途中離脱">途中離脱</option>
            </select>
            <select
              value={scoreFilter}
              onChange={(e) => { setScoreFilter(e.target.value as ScoreFilter); setCurrentPage(1) }}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべてのスコア</option>
              <option value="80+">80点以上</option>
              <option value="60-79">60〜79点</option>
              <option value="40-59">40〜59点</option>
              <option value="40-">40点未満</option>
            </select>
            <select
              value={resultFilter}
              onChange={(e) => { setResultFilter(e.target.value as ResultFilter); setCurrentPage(1) }}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべての結果</option>
              <option value="pending">未対応</option>
              <option value="considering">検討中</option>
              <option value="second_pass">二次通過</option>
              <option value="rejected">不採用</option>
              <option value="hired">内定</option>
            </select>
            <select
              value={periodFilter}
              onChange={(e) => { setPeriodFilter(e.target.value as PeriodFilter); setCurrentPage(1) }}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">全期間</option>
              <option value="this_month">今月</option>
              <option value="last_month">先月</option>
              <option value="3months">過去3ヶ月</option>
            </select>
          </div>
        </div>

        {/* 応募者一覧テーブル（lg以上） */}
        <div className="hidden lg:block bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">応募者名</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">企業名</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">ステータス</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">スコア</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">推薦度</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">結果</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">面接日時</th>
                  <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-4 px-5 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {paginatedApplicants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-sm text-gray-500 py-16 text-center">
                      該当する応募者がありません
                    </td>
                  </tr>
                ) : (
                  paginatedApplicants.map((a) => {
                    const statusConfig = getStatusConfig(a.status)
                    const scoreBadgeClass = getScoreBadgeClass(a.total_score)
                    return (
                      <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-all duration-150">
                        <td className="py-4 px-5">
                          <div>
                            <p className="text-sm font-medium text-white">{a.name}</p>
                            <p className="text-xs text-gray-500">{a.email}</p>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-sm text-gray-300">{a.company_name}</td>
                        <td className="py-4 px-5">
                          <div className={`inline-flex items-center gap-2 ${statusConfig.textClass}`}>
                            <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                            <span className="text-sm">{statusConfig.label}</span>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          {a.total_score !== null ? (
                            <span className={`inline-flex text-sm font-semibold rounded-lg px-2.5 py-1 ${scoreBadgeClass}`}>
                              {a.total_score}
                            </span>
                          ) : (
                            <span className="text-sm font-semibold text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          {a.recommendation_rank ? (
                            <span className="text-sm font-semibold text-gray-300">{a.recommendation_rank}</span>
                          ) : (
                            <span className="text-sm text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 font-medium ${getResultBadgeClass(a.selection_status)}`}>
                            {getResultLabel(a.selection_status)}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <div>
                            <p className="text-sm text-gray-300">{formatDate(a.interview_scheduled_at || a.created_at)}</p>
                            {a.interview_scheduled_at && (
                              <p className="text-xs text-gray-500">{formatTime(a.interview_scheduled_at)}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            {a.phone && (
                              <a href={`tel:${a.phone}`} className="text-gray-400 hover:text-emerald-400 transition-colors" title="電話">
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {a.email && (
                              <a href={`mailto:${a.email}`} className="text-gray-400 hover:text-blue-400 transition-colors" title="メール">
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                            <Link href={`/admin/applicants/${a.id}`} className="text-xs text-blue-400 hover:text-blue-300">
                              詳細
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          {filteredApplicants.length > 0 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.04]">
              <p className="text-sm text-gray-500">
                全{filteredApplicants.length}名中 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, filteredApplicants.length)}名を表示
              </p>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-2 text-sm bg-white/[0.05] text-gray-400 hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  前へ
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
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
                {totalPages > 5 && (
                  <>
                    <span className="w-9 h-9 flex items-center justify-center text-sm text-gray-500">…</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      className={`w-9 h-9 text-sm rounded-lg transition-colors ${
                        currentPage === totalPages ? 'bg-blue-600 text-white' : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
                      }`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-2 text-sm bg-white/[0.05] text-gray-400 hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  次へ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* モバイル・タブレット: カード形式 */}
        <div className="lg:hidden space-y-3">
          {paginatedApplicants.length === 0 ? (
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-8 text-center text-sm text-gray-500">
              該当する応募者がありません
            </div>
          ) : (
            paginatedApplicants.map((a) => {
              const statusConfig = getStatusConfig(a.status)
              const scoreBadgeClass = getScoreBadgeClass(a.total_score)
              return (
                <div key={a.id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-white">{a.name}</p>
                      <p className="text-xs text-gray-500">{a.company_name}</p>
                    </div>
                    <div className={`inline-flex items-center gap-1.5 shrink-0 ${statusConfig.textClass}`}>
                      <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                      <span className="text-xs">{statusConfig.label}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {a.total_score !== null ? (
                      <span className={`inline-flex text-sm font-semibold rounded-lg px-2.5 py-1 ${scoreBadgeClass}`}>
                        {a.total_score}点
                      </span>
                    ) : (
                      <span className="text-sm text-gray-600">—</span>
                    )}
                    {a.recommendation_rank && (
                      <span className="text-xs text-gray-400">推薦: {a.recommendation_rank}</span>
                    )}
                    <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 font-medium ${getResultBadgeClass(a.selection_status)}`}>
                      {getResultLabel(a.selection_status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.phone && (
                      <a href={`tel:${a.phone}`} className="text-gray-400 hover:text-emerald-400 transition-colors" title="電話">
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {a.email && (
                      <a href={`mailto:${a.email}`} className="text-gray-400 hover:text-blue-400 transition-colors" title="メール">
                        <Mail className="w-4 h-4" />
                      </a>
                    )}
                    <Link href={`/admin/applicants/${a.id}`} className="text-xs text-blue-400 hover:text-blue-300">
                      詳細を見る
                    </Link>
                  </div>
                </div>
              )
            })
          )}
          {filteredApplicants.length > 0 && (
            <div className="flex items-center justify-between pt-4 pb-2">
              <p className="text-sm text-gray-500">
                全{filteredApplicants.length}名中 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, filteredApplicants.length)}名を表示
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-2 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50"
                >
                  前へ
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-2 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50"
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

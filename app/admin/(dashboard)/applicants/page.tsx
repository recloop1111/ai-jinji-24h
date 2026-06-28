'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, Download, Users, CheckCircle, Clock, BarChart3, XCircle, Phone, Mail, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { deriveDisplayStatusJa } from '@/lib/applicants/displayStatus'

// 運営CSV出力の認証モーダル。運営管理設定変更用パスワードをサーバ検証してから取得する。
// onSubmit はサーバへパスワードを送り、成功時 null（閉じる）、失敗時はエラーメッセージを返す。
// ログインパスワードでは取得できない（サーバ側で admin_security_settings と照合）。
function AdminSettingPasswordModal({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (password: string) => Promise<string | null>
}) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!password.trim()) {
      setError('パスワードを入力してください')
      return
    }
    setError('')
    setSubmitting(true)
    const errMsg = await onSubmit(password)
    setSubmitting(false)
    if (errMsg) {
      setError(errMsg)
      return
    }
    setPassword('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative bg-gray-900 border border-white/10 rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-white mb-2">運営管理設定変更用パスワード認証</h3>
        <p className="text-sm text-gray-400 mb-4">
          CSV出力には「運営管理設定変更用パスワード」が必要です（ログインパスワードでは取得できません）。
        </p>
        {/* 独立 form＋autoComplete無効化。応募者検索欄へのユーザー名自動入力（パスワードマネージャー誤認）を防ぐ */}
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="mb-4">
            <label htmlFor="admin-csv-setting-password" className="sr-only">運営管理設定変更用パスワード</label>
            <div className="relative">
              <input
                id="admin-csv-setting-password"
                name="admin-csv-setting-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                className="w-full px-4 py-2 pr-10 bg-white/[0.03] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="運営管理設定変更用パスワードを入力"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {error && <p className="mt-1.5 text-sm text-red-400">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-300 bg-white/[0.05] hover:bg-white/[0.08] rounded-lg transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? '認証中...' : '認証してダウンロード'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type StatusFilter = 'all' | '準備中' | '面接中' | '完了' | '途中離脱'
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
  latest_interview_status?: string | null
  selection_status: string | null
  created_at: string
  interview_scheduled_at: string | null
  total_score: number | null
  recommendation_rank: string | null
}

function getStatusConfig(status: string): { dotClass: string; textClass: string; label: string } {
  const map: Record<string, { dotClass: string; textClass: string; label: string }> = {
    '完了': { dotClass: 'bg-emerald-400', textClass: 'text-emerald-400', label: '完了' },
    '面接中': { dotClass: 'bg-blue-400', textClass: 'text-blue-400', label: '面接中' },
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
  const [csvModalOpen, setCsvModalOpen] = useState(false)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // 全件取得（API は最大 per_page=100。total_count を見て全ページをたどり 101件目以降の漏れを防ぐ）
        const PER_PAGE = 100
        const all: Applicant[] = []
        let companiesSet = false
        let page = 1
        let total = 0
        // 安全弁: 最大ページ数で打ち切り（無限ループ防止）
        for (let guard = 0; guard < 1000; guard += 1) {
          const res = await fetch(`/api/admin/applicant-data?page=${page}&per_page=${PER_PAGE}`)
          if (!res.ok) break
          const json = await res.json()
          if (!companiesSet && json.companies) {
            setCompanies(json.companies)
            companiesSet = true
          }
          const batch: Applicant[] = json.applicants ?? []
          all.push(...batch)
          total = typeof json.total_count === 'number' ? json.total_count : all.length
          if (batch.length === 0 || all.length >= total) break
          page += 1
        }
        setApplicants(all)
      } catch {
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredApplicants = useMemo(() => {
    return applicants.filter((a) => {
      const q = searchQuery.trim().toLowerCase()
      const matchSearch = !q || a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      const matchCompany = companyFilter === 'all' || a.company_id === companyFilter
      const matchStatus = statusFilter === 'all' || deriveDisplayStatusJa(a.status, a.latest_interview_status ?? null) === statusFilter
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
    setCsvModalOpen(true)
  }

  // 運営CSV: 設定用パスワードをサーバ検証してからサーバ生成のCSVを取得する。
  // 画面と同一の絞り込み（検索/企業/状況/スコア/結果/期間）をサーバへ渡し、同等の出力にする。
  // 戻り値: 成功時 null・失敗時はモーダルに表示するエラーメッセージ。
  const handleCsvSubmit = async (password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/applicant-data/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settingPassword: password,
          search: searchQuery.trim(),
          company_id: companyFilter,
          status: statusFilter,
          score: scoreFilter,
          result: resultFilter,
          period: periodFilter,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        return json?.error?.message ?? 'CSVの取得に失敗しました'
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date()
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      a.download = `応募者一覧_運営_${dateStr}.csv`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('CSVをダウンロードしました')
      return null
    } catch {
      return 'CSVの取得に失敗しました'
    }
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
                name="admin-applicant-search"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                placeholder="応募者名・メールで検索"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
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
              <option value="面接中">面接中</option>
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
                    const statusConfig = getStatusConfig(deriveDisplayStatusJa(a.status, a.latest_interview_status ?? null))
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

      {/* CSV出力 設定用パスワード認証モーダル */}
      <AdminSettingPasswordModal
        isOpen={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onSubmit={handleCsvSubmit}
      />
    </>
  )
}

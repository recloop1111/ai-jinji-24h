'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Download, Building2, CheckCircle, Square, X, Copy, Eye, EyeOff } from 'lucide-react'

const INDUSTRIES = [
  '飲食・フード',
  '小売・販売',
  'IT・Web',
  '医療・介護・福祉',
  '建設・不動産',
  '製造・メーカー',
  '物流・運送',
  '教育・学習',
  '美容・理容',
  'ホテル・旅館・観光',
  '金融・保険',
  '士業・コンサルティング',
  '広告・メディア',
  '人材・派遣',
  '農業・漁業',
  '公務・団体',
  'その他',
] as const



const FREE_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.co.jp',
  'yahoo.com',
  'hotmail.com',
  'hotmail.co.jp',
  'outlook.com',
  'live.jp',
  'icloud.com',
  'me.com',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'softbank.ne.jp',
  'biglobe.ne.jp',
  'nifty.com',
  'so-net.ne.jp',
]

function isFreeEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  return domain ? FREE_EMAIL_DOMAINS.includes(domain) : true
}

type StatusFilter = 'all' | 'active' | 'suspended' | 'cancelled'
type PlanFilter = 'all' | 'pay_per_use' | 'custom'

function getPlanBadgeClass(plan: string): string {
  const map: Record<string, string> = {
    pay_per_use: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    custom: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  }
  return map[plan] ?? 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
}

function getPlanLabel(plan: string): string {
  const map: Record<string, string> = {
    pay_per_use: '従量課金',
    custom: 'カスタム',
  }
  return map[plan] ?? plan
}

function getStatusConfig(status: string): { dotClass: string; textClass: string; label: string } {
  const map: Record<string, { dotClass: string; textClass: string; label: string }> = {
    active: { dotClass: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]', textClass: 'text-emerald-400', label: 'アクティブ' },
    suspended: { dotClass: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]', textClass: 'text-red-400', label: '停止中' },
    cancelled: { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: '解約済み' },
  }
  return map[status] ?? { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: status }
}

const ITEMS_PER_PAGE = 8

export default function CompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ total: 0, active: 0, activePercent: 0, suspended: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [registrationResult, setRegistrationResult] = useState<{
    email: string
    password: string
    interviewSlug: string
  } | null>(null)
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    industry: '',
    monthlyInterviews: '',
    initialPassword: '',
  })

  useEffect(() => {
    fetchCompanies()
  }, [])

  async function fetchCompanies() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/companies?per_page=100')
      const json = await res.json()
      const items = json.companies ?? []

      setCompanies(items)

      const active = items.filter((c: any) => c.status === 'active').length
      const suspended = items.filter((c: any) => c.status === 'suspended').length
      setSummary({
        total: items.length,
        active,
        activePercent: items.length ? Math.round((active / items.length) * 100) : 0,
        suspended,
      })
    } catch {
      setCompanies([])
    }
    setLoading(false)
  }

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const q = searchQuery.trim().toLowerCase()
      const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.contactName || '').toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || c.status === statusFilter
      const matchPlan = planFilter === 'all' || c.plan === planFilter
      return matchSearch && matchStatus && matchPlan
    })
  }, [searchQuery, statusFilter, planFilter, companies])

  const totalPages = Math.ceil(filteredCompanies.length / ITEMS_PER_PAGE)
  const paginatedCompanies = filteredCompanies.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const openAddModal = () => {
    setForm({
      companyName: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      industry: '',
      monthlyInterviews: '',
      initialPassword: '',
    })
    setFormErrors({})
    setShowPassword(false)
    setRegistrationResult(null)
    setAddModalOpen(true)
  }

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const array = new Uint8Array(12)
    crypto.getRandomValues(array)
    const pw = Array.from(array, (b) => chars[b % chars.length]).join('')
    setForm((prev) => ({ ...prev, initialPassword: pw }))
    if (formErrors.initialPassword) setFormErrors((prev) => ({ ...prev, initialPassword: '' }))
  }

  const setFormField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const handleSubmitNewCompany = async () => {
    const err: Record<string, string> = {}
    if (!form.companyName.trim()) err.companyName = '企業名を入力してください'
    if (!form.contactName.trim()) err.contactName = '担当者名を入力してください'
    if (!form.contactEmail.trim()) err.contactEmail = 'メールアドレスを入力してください'
    else if (isFreeEmail(form.contactEmail.trim())) err.contactEmail = '法人ドメインのメールアドレスを入力してください'
    if (!form.contactPhone.trim()) err.contactPhone = '電話番号を入力してください'
    if (!form.industry) err.industry = '業種を選択してください'
    if (!form.initialPassword.trim()) err.initialPassword = '初期パスワードを入力してください'
    else if (form.initialPassword.trim().length < 8) err.initialPassword = 'パスワードは8文字以上にしてください'
    setFormErrors(err)
    if (Object.keys(err).length > 0) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.companyName.trim(),
          email: form.contactEmail.trim(),
          password: form.initialPassword.trim(),
          contact_person: form.contactName.trim(),
          phone: form.contactPhone.trim(),
          industry: form.industry,
          monthly_interview_limit: parseInt(form.monthlyInterviews) || 20,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        const msg = data?.error?.message || '登録に失敗しました'
        showToast(msg)
        return
      }

      setRegistrationResult({
        email: form.contactEmail.trim(),
        password: form.initialPassword.trim(),
        interviewSlug: data.interview_slug,
      })
    } catch {
      showToast('登録に失敗しました。ネットワークを確認してください')
    } finally {
      setSubmitting(false)
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
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
            onClick={openAddModal}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-all duration-200 shrink-0"
          >
            <Plus className="w-4 h-4" />
            新規企業登録
          </button>
        </div>

        {/* セクション2: サマリーカード3枚 */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Building2 className="absolute top-4 right-4 w-8 h-8 text-blue-400/50" />
            <p className="text-3xl font-bold text-white">{summary.total}</p>
            <p className="text-sm text-gray-400 mt-0.5">全企業数</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <CheckCircle className="absolute top-4 right-4 w-8 h-8 text-emerald-400/50" />
            <p className="text-3xl font-bold text-white">{summary.active}</p>
            <p className="text-sm text-gray-400 mt-0.5">アクティブ</p>
            <p className="text-xs text-emerald-400 mt-1">全体の{summary.activePercent}%</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
            <Square className="absolute top-4 right-4 w-8 h-8 text-red-400/50" />
            <p className="text-3xl font-bold text-white">{summary.suspended}</p>
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
              <option value="suspended">停止中</option>
              <option value="cancelled">解約済み</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
              className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300 appearance-none cursor-pointer focus:outline-none focus:border-blue-500/50"
            >
              <option value="all">すべてのプラン</option>
              <option value="pay_per_use">従量課金</option>
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
                {paginatedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-sm text-gray-500 py-16 text-center">
                      該当する企業がありません
                    </td>
                  </tr>
                ) : (
                  paginatedCompanies.map((c) => {
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
                          <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 ${getPlanBadgeClass(c.plan)}`}>
                            {getPlanLabel(c.plan)}
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
                全{filteredCompanies.length}社中 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, filteredCompanies.length)}社を表示
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
          {paginatedCompanies.length === 0 ? (
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-8 text-center text-sm text-gray-500">
              該当する企業がありません
            </div>
          ) : (
            paginatedCompanies.map((c) => {
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
                    <span className={`inline-flex text-xs rounded-lg px-2 py-0.5 ${getPlanBadgeClass(c.plan)}`}>
                      {getPlanLabel(c.plan)}
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
                全{filteredCompanies.length}社中 {((currentPage - 1) * ITEMS_PER_PAGE) + 1}〜{Math.min(currentPage * ITEMS_PER_PAGE, filteredCompanies.length)}社を表示
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

      {/* 新規企業登録モーダル */}
      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={(e) => e.target === e.currentTarget && setAddModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-slate-900">新規企業登録</h2>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSubmitNewCompany() }}
              className="p-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">会社名（法人名） <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => setFormField('companyName', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="株式会社〇〇"
                  />
                  {formErrors.companyName && <p className="mt-1 text-xs text-red-500">{formErrors.companyName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">担当者名 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setFormField('contactName', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="佐藤 花子"
                  />
                  {formErrors.contactName && <p className="mt-1 text-xs text-red-500">{formErrors.contactName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">担当者メールアドレス <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setFormField('contactEmail', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="contact@company.co.jp"
                  />
                  {formErrors.contactEmail && <p className="mt-1 text-xs text-red-500">{formErrors.contactEmail}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">担当者電話番号 <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={form.contactPhone}
                    onChange={(e) => setFormField('contactPhone', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="03-1234-5678"
                  />
                  {formErrors.contactPhone && <p className="mt-1 text-xs text-red-500">{formErrors.contactPhone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">業種 <span className="text-red-500">*</span></label>
                  <select
                    value={form.industry}
                    onChange={(e) => setFormField('industry', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">選択してください</option>
                    {INDUSTRIES.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {formErrors.industry && <p className="mt-1 text-xs text-red-500">{formErrors.industry}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">プラン</label>
                  <p className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-500 bg-slate-50">従量課金（¥4,000/件）</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">月間面接上限</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.monthlyInterviews}
                    onChange={(e) => setFormField('monthlyInterviews', e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="例: 20"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">初期パスワード <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={form.initialPassword}
                        onChange={(e) => setFormField('initialPassword', e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="8文字以上"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="shrink-0 px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                    >
                      自動生成
                    </button>
                  </div>
                  {formErrors.initialPassword && <p className="mt-1 text-xs text-red-500">{formErrors.initialPassword}</p>}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? '登録中...' : '登録'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 登録完了モーダル */}
      {registrationResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-6 h-6 text-emerald-500" />
              <h2 className="text-lg font-bold text-slate-900">企業登録が完了しました</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">以下のログイン情報を企業担当者にお伝えください。初期パスワードはこの画面を閉じると再表示できません。</p>
            <div className="space-y-3">
              {[
                { label: 'ログインURL', value: `${typeof window !== 'undefined' ? window.location.origin : ''}/client/login` },
                { label: 'メールアドレス', value: registrationResult.email },
                { label: '初期パスワード', value: registrationResult.password },
                { label: '面接URL', value: `${typeof window !== 'undefined' ? window.location.origin : ''}/interview/${registrationResult.interviewSlug}` },
              ].map((item) => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-slate-500 mb-1">{item.label}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-900 flex-1 break-all font-mono">{item.value}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(item.value)
                        showToast(`${item.label}をコピーしました`)
                      }}
                      className="shrink-0 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="コピー"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setRegistrationResult(null)
                setAddModalOpen(false)
                fetchCompanies()
              }}
              className="mt-6 w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* トースト */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/[0.08] backdrop-blur-2xl border border-white/[0.10] rounded-xl shadow-lg px-5 py-3 text-sm text-gray-300">
          {toastMessage}
        </div>
      )}
    </>
  )
}

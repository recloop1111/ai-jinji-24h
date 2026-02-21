'use client'

import { useState, useMemo, useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'
import { useTemplates, type Template } from '../../contexts/TemplatesContext'
import { Download as DownloadIcon, Eye as EyeIcon, EyeOff as EyeOffIcon, Search as SearchEmptyIcon, Phone as PhoneIcon, Mail as MailIcon, Filter as FilterIcon, ChevronDown as ChevronDownIcon } from 'lucide-react'
import { scoreToGrade, gradeColor } from '@/lib/utils/scoreToGrade'

// currentStatus: preparing=準備中(システム), completed=完了(システム)
// status: null=未対応(面接完了後・結果未設定時の初期値), considering=検討中, second_pass=二次通過, rejected=不採用(企業担当者が手動管理)

type StatusFilterValue = 'all' | 'pending' | 'considering' | 'second_pass' | 'rejected'
type CurrentStatusFilterValue = 'all' | 'preparing' | 'completed' | 'abandoned'

type Applicant = {
  id: string
  name: string
  email: string
  phone: string
  interviewAt: string
  currentStatus: 'preparing' | 'completed' | 'abandoned' // 準備中・完了・途中離脱
  status: 'considering' | 'second_pass' | 'rejected' | null
  score: number | null
  recommendationRank: 'A' | 'B' | 'C' | 'D' | null
}

const STATUS_FILTER_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '未対応' },
  { value: 'considering', label: '検討中' },
  { value: 'second_pass', label: '二次通過' },
  { value: 'rejected', label: '不採用' },
]

const CURRENT_STATUS_FILTER_OPTIONS: { value: CurrentStatusFilterValue; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'preparing', label: '準備中' },
  { value: 'completed', label: '完了' },
  { value: 'abandoned', label: '途中離脱' },
]

// 管理者認証モーダルコンポーネント
function AdminAuthModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [adminPassword, setAdminPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!adminPassword.trim()) {
      setError('パスワードを入力してください')
      return
    }
    // TODO: Phase 4 - Supabaseで管理者認証
    setError('')
    onConfirm()
    setAdminPassword('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-slate-900 mb-2">管理者認証</h3>
        <p className="text-sm text-slate-600 mb-4">
          この操作には管理者用パスワードが必要です。
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            管理者用パスワード
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value)
                setError('')
              }}
              className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="管理者用パスワードを入力"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
            </button>
          </div>
          {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            認証して実行
          </button>
        </div>
      </div>
    </div>
  )
}

function ApplicantsContent() {
  const { companyId, loading: companyIdLoading, error: companyIdError } = useCompanyId()
  const supabase = createClient()
  // TODO: 実際にはAPIからプラン情報を取得
  const getCurrentPlan = (): 'light' | 'standard' | 'pro' | 'custom' => 'standard' // TODO: 実データに差替え
  const currentPlan = getCurrentPlan()
  const { templates } = useTemplates()
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [currentStatusFilter, setCurrentStatusFilter] = useState<CurrentStatusFilterValue>('all')
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const [currentStatusFilterDropdownOpen, setCurrentStatusFilterDropdownOpen] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement>(null)
  const currentStatusFilterDropdownRef = useRef<HTMLDivElement>(null)
  const sendListRef = useRef<HTMLDivElement>(null)
  const [sendListShowFade, setSendListShowFade] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mailModalOpen, setMailModalOpen] = useState(false)
  const [mailSelectedIds, setMailSelectedIds] = useState<Set<string>>(new Set())
  const [mailTemplateId, setMailTemplateId] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [mailToast, setMailToast] = useState(false)
  const [csvAdminAuthModalOpen, setCsvAdminAuthModalOpen] = useState(false)
  const [csvInfoModalOpen, setCsvInfoModalOpen] = useState(false)
  const [csvDownloadToast, setCsvDownloadToast] = useState(false)
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [statusDropdownApplicantId, setStatusDropdownApplicantId] = useState<string | null>(null)
  const [statusToast, setStatusToast] = useState(false)

  // Supabaseから応募者データを取得
  useEffect(() => {
    if (!companyId) {
      if (!companyIdLoading) setDataLoading(false)
      return
    }
    async function fetchApplicants() {
      setDataLoading(true)
      try {
        // Step 1: applicants取得
        const { data: applicantsData, error: appError } = await supabase
          .from('applicants')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        if (appError) {
          setApplicants([])
          setDataLoading(false)
          return
        }

        // Step 2: interview_results取得（別クエリ）
        let resultsMap: Record<string, any> = {}
        const { data: resultsData, error: resError } = await supabase
          .from('interview_results')
          .select('applicant_id, detail_json')

        if (resError) {
        } else if (resultsData) {
          resultsData.forEach((r: any) => {
            resultsMap[r.applicant_id] = r
          })
        }

        // Step 3: マージしてマッピング
        const mappedApplicants: Applicant[] = (applicantsData || []).map((a: any) => {
          const ir = resultsMap[a.id] || null
          const detailJson = ir?.detail_json || {}
          return {
            id: a.id,
            name: `${a.last_name || ''} ${a.first_name || ''}`.trim() || '名前未設定',
            email: a.email || '',
            phone: a.phone_number || '',
            interviewAt: a.created_at ? new Date(a.created_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
            currentStatus: a.status === '準備中' ? 'preparing' as const
              : a.status === '完了' ? 'completed' as const
              : a.status === '途中離脱' ? 'abandoned' as const
              : 'preparing' as const,
            status: a.result === '検討中' ? 'considering' as const
              : a.result === '二次通過' ? 'second_pass' as const
              : a.result === '不採用' ? 'rejected' as const
              : null,
            score: a.interview_score || null,
            recommendationRank: detailJson?.recommendation_rank ?? null,
          }
        })
        setApplicants(mappedApplicants)
      } catch (err: any) {
        setApplicants([])
      }
      setDataLoading(false)
    }
    fetchApplicants()
  }, [companyId, companyIdLoading, supabase])
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(target)) {
        setFilterDropdownOpen(false)
      }
      if (currentStatusFilterDropdownRef.current && !currentStatusFilterDropdownRef.current.contains(target)) {
        setCurrentStatusFilterDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!mailModalOpen) return
    const run = () => {
      const el = sendListRef.current
      if (!el) return
      const hasOverflow = el.scrollHeight > el.clientHeight
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
      setSendListShowFade(hasOverflow && !isAtBottom)
    }
    const t = setTimeout(run, 50)
    return () => clearTimeout(t)
  }, [mailModalOpen, mailSelectedIds])

  const handleCsvDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (currentPlan === 'light') {
      setCsvInfoModalOpen(true)
    } else {
      setCsvAdminAuthModalOpen(true)
    }
  }

  const handleCsvDownload = (filteredData: Applicant[]) => {

    const escapeCsvField = (v: string | number | null | undefined): string => {
      const s = v === null || v === undefined ? '' : String(v)
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }

    const currentStatusLabel = (s: string | null) => (
      s === 'preparing' ? '準備中' 
      : s === 'completed' ? '完了'
      : s === 'abandoned' ? '途中離脱'
      : ''
    )
    const statusLabel = (s: string | null) =>
      s === 'considering' ? '検討中' : s === 'second_pass' ? '二次通過' : s === 'rejected' ? '不採用' : '未対応'

    const header = '応募者名,メールアドレス,電話番号,面接日時,現在状況,推薦度,結果'
    const rows = filteredData.map((a) =>
      [
        a.name,
        a.email,
        a.phone,
        a.interviewAt ?? '',
        currentStatusLabel(a.currentStatus),
        a.recommendationRank ?? '',
        statusLabel(a.status),
      ].map(escapeCsvField).join(',')
    )
    const csvContent = '\uFEFF' + [header, ...rows].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const today = new Date()
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
    a.download = `応募者一覧_${dateStr}.csv`
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setCsvDownloadToast(true)
    setTimeout(() => setCsvDownloadToast(false), 2000)
  }

  const filtered = useMemo(() => {
    return applicants.filter((a) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        if (!a.name.toLowerCase().includes(q)) return false
      }
      if (dateFrom || dateTo) {
        const at = a.interviewAt ? new Date(a.interviewAt.replace(' ', 'T')).getTime() : 0
        if (dateFrom && at < new Date(dateFrom).setHours(0, 0, 0, 0)) return false
        if (dateTo && at > new Date(dateTo).setHours(23, 59, 59, 999)) return false
      }
      // 結果で絞り込み（applicants.result）
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          if (a.status != null) return false
        } else if (a.status !== statusFilter) {
          return false
        }
      }
      // 現在状況で絞り込み（applicants.status）
      if (currentStatusFilter !== 'all') {
        if (a.currentStatus !== currentStatusFilter) {
          return false
        }
      }
      return true
    })
  }, [applicants, searchQuery, dateFrom, dateTo, statusFilter, currentStatusFilter])

  const handleStatusFilterSelect = (value: StatusFilterValue) => {
    setStatusFilter(value)
    setFilterDropdownOpen(false)
  }

  const handleCurrentStatusFilterSelect = (value: CurrentStatusFilterValue) => {
    setCurrentStatusFilter(value)
    setCurrentStatusFilterDropdownOpen(false)
  }

  const checkSendListFade = () => {
    const el = sendListRef.current
    if (!el) return
    const hasOverflow = el.scrollHeight > el.clientHeight
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
    setSendListShowFade(hasOverflow && !isAtBottom)
  }

  const selectedCount = selectedIds.size
  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((a) => next.delete(a.id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        filtered.forEach((a) => next.add(a.id))
        return next
      })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openMailModal = (ids: Set<string>) => {
    setMailSelectedIds(ids)
    setMailModalOpen(true)
    setMailTemplateId(templates[0]?.id ?? '')
    const tmpl = templates[0]
    if (tmpl) setMailBody(tmpl.body)
    else setMailBody('')
  }

  const closeMailModal = () => {
    setMailModalOpen(false)
    setMailSelectedIds(new Set())
    setMailTemplateId('')
  }

  const handleMailTemplateChange = (id: string) => {
    setMailTemplateId(id)
    const tmpl = templates.find((t: Template) => t.id === id)
    if (tmpl) setMailBody(tmpl.body)
  }

  const handleMailSend = () => {
    // TODO: Resend APIでメール送信を実装
    setMailToast(true)
    setTimeout(() => setMailToast(false), 2000)
    setSelectedIds(new Set())
    closeMailModal()
  }

  const mailSelectedApplicants = useMemo(() => {
    return applicants.filter((a) => mailSelectedIds.has(a.id))
  }, [applicants, mailSelectedIds])

  const handleStatusUpdate = async (applicantId: string, newStatus: 'considering' | 'second_pass' | 'rejected' | null) => {
    // resultカラムを更新（未対応・検討中・二次通過・不採用）
    const dbResult = newStatus === null ? '未対応' 
      : newStatus === 'considering' ? '検討中'
      : newStatus === 'second_pass' ? '二次通過'
      : newStatus === 'rejected' ? '不採用'
      : '未対応'
    
    // Supabaseでステータス更新
    try {
      await supabase
        .from('applicants')
        .update({ result: dbResult, updated_at: new Date().toISOString() })
        .eq('id', applicantId)
    } catch (err) {
    }
    
    setApplicants((prev) => {
      const updated = prev.map((a) =>
        a.id === applicantId ? { ...a, status: newStatus } : a
      )
      return updated
    })
    setStatusDropdownApplicantId(null)
    setStatusToast(true)
    setTimeout(() => setStatusToast(false), 2000)
  }

  const selectedTemplate = templates.find((t: Template) => t.id === mailTemplateId)

  if (companyIdLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <span className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (companyIdError || (!companyId && !companyIdLoading)) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
          {companyIdError ?? '企業情報を取得できませんでした。ログインし直すか、デモモードでお試しください。'}
        </div>
      </div>
    )
  }

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <span className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900">応募者一覧</h1>
        <button
          type="button"
          onClick={handleCsvDownloadClick}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shrink-0"
        >
          <DownloadIcon className="w-4 h-4" />
          CSVダウンロード
        </button>
      </div>

      {/* フィルター・検索 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
          <input
            type="text"
            placeholder="応募者名で検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-slate-400 text-sm">〜</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 items-center">
            {/* 結果で絞り込み */}
            <div ref={filterDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setFilterDropdownOpen(!filterDropdownOpen)
                }}
                className={`inline-flex items-center gap-2 bg-white border border-gray-300 rounded-lg h-10 px-4 text-sm text-gray-700 hover:bg-gray-50 transition relative shrink-0 whitespace-nowrap ${statusFilter !== 'all' ? 'text-blue-600' : ''}`}
              >
                {statusFilter !== 'all' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full" />
                )}
                <FilterIcon className="w-4 h-4 shrink-0" />
                {statusFilter !== 'all' ? '絞り込み中' : '結果'}
              </button>
              {filterDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[90]" 
                    onClick={() => {
                      setFilterDropdownOpen(false)
                    }} 
                  />
                  <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-[100] min-w-[200px]">
                    <p className="text-sm font-semibold text-gray-700 mb-2">結果で絞り込み</p>
                    <div className="space-y-2">
                      {STATUS_FILTER_OPTIONS.map((o) => (
                        <label key={o.value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 -my-1">
                          <input
                            type="radio"
                            name="statusFilter"
                            checked={statusFilter === o.value}
                            onChange={() => {
                              handleStatusFilterSelect(o.value)
                            }}
                            className="border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* 現在状況で絞り込み */}
            <div ref={currentStatusFilterDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setCurrentStatusFilterDropdownOpen(!currentStatusFilterDropdownOpen)
                }}
                className={`inline-flex items-center gap-2 bg-white border border-gray-300 rounded-lg h-10 px-4 text-sm text-gray-700 hover:bg-gray-50 transition relative shrink-0 whitespace-nowrap ${currentStatusFilter !== 'all' ? 'text-blue-600' : ''}`}
              >
                {currentStatusFilter !== 'all' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full" />
                )}
                <FilterIcon className="w-4 h-4 shrink-0" />
                {currentStatusFilter !== 'all' ? '絞り込み中' : '現在状況'}
              </button>
              {currentStatusFilterDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-[90]" 
                    onClick={() => {
                      setCurrentStatusFilterDropdownOpen(false)
                    }} 
                  />
                  <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-[100] min-w-[200px]">
                    <p className="text-sm font-semibold text-gray-700 mb-2">現在状況で絞り込み</p>
                    <div className="space-y-2">
                      {CURRENT_STATUS_FILTER_OPTIONS.map((o) => (
                        <label key={o.value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 -my-1">
                          <input
                            type="radio"
                            name="currentStatusFilter"
                            checked={currentStatusFilter === o.value}
                            onChange={() => {
                              handleCurrentStatusFilterSelect(o.value)
                            }}
                            className="border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* メール送信バー（選択時） */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-sm font-medium text-slate-700">{selectedCount}名選択中</span>
          <button
            type="button"
            onClick={() => openMailModal(selectedIds)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
          >
            <MailIcon className="w-4 h-4" />
            メール送信
          </button>
        </div>
      )}

      {/* テーブル または 空状態 */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 shadow-sm text-center">
          <SearchEmptyIcon className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-600 font-medium">条件に一致する応募者が見つかりません</p>
          <p className="text-sm text-slate-500 mt-1">検索条件を変更してお試しください</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* デスクトップ: テーブル */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="w-12 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">応募者名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">メールアドレス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">電話番号</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">面接日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">現在状況</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">推薦度</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">結果</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="w-12 px-2 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                    <td className="px-4 py-3 text-slate-600">{a.email}</td>
                    <td className="px-4 py-3 text-slate-600">{a.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{a.interviewAt}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          a.currentStatus === 'preparing' ? 'bg-gray-100 text-gray-600' 
                          : a.currentStatus === 'completed' ? 'bg-green-100 text-green-600'
                          : 'bg-red-100 text-red-600' // 途中離脱
                        }`}
                      >
                        {a.currentStatus === 'preparing' ? '準備中' 
                          : a.currentStatus === 'completed' ? '完了'
                          : '途中離脱'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.currentStatus === 'preparing' || a.currentStatus === 'abandoned' ? (
                        <span className="text-slate-400">-</span>
                      ) : a.recommendationRank ? (
                        <span className="text-gray-700 font-semibold text-base">{a.recommendationRank}</span>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {a.currentStatus === 'preparing' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setStatusDropdownApplicantId(statusDropdownApplicantId === a.id ? null : a.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-90 ${
                              a.status == null ? 'bg-gray-100 text-gray-600' :
                              a.status === 'considering' ? 'bg-yellow-100 text-yellow-600' :
                              a.status === 'second_pass' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                            }`}
                          >
                            {a.status == null ? '未対応' : a.status === 'considering' ? '検討中' : a.status === 'second_pass' ? '二次通過' : '不採用'}
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          </button>
                          {statusDropdownApplicantId === a.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-[50]" 
                                onClick={() => setStatusDropdownApplicantId(null)} 
                              />
                              <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[60] min-w-[120px] py-1">
                                <button onClick={() => handleStatusUpdate(a.id, null)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">未対応</button>
                                <button onClick={() => handleStatusUpdate(a.id, 'considering')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">検討中</button>
                                <button onClick={() => handleStatusUpdate(a.id, 'second_pass')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">二次通過</button>
                                <button onClick={() => handleStatusUpdate(a.id, 'rejected')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">不採用</button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <a
                          href={`tel:${a.phone}`}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="電話"
                        >
                          <PhoneIcon className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => openMailModal(new Set([a.id]))}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="メール"
                        >
                          <MailIcon className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/client/applicants/${a.id}`}
                          onClick={() => {
                          }}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors"
                        >
                          詳細
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル: カード表示 */}
          <div className="md:hidden divide-y divide-slate-100">
            {filtered.map((a) => (
              <div key={a.id} className="p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{a.name}</p>
                    <p className="text-xs text-slate-500 truncate">{a.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-slate-500">{a.interviewAt}</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full font-medium ${
                      a.currentStatus === 'preparing' ? 'bg-gray-100 text-gray-600' 
                      : a.currentStatus === 'completed' ? 'bg-green-100 text-green-600'
                      : 'bg-red-100 text-red-600' // 途中離脱
                    }`}
                  >
                    {a.currentStatus === 'preparing' ? '準備中' 
                      : a.currentStatus === 'completed' ? '完了'
                      : '途中離脱'}
                  </span>
                  {a.currentStatus === 'completed' && a.score != null && (
                    <span className="inline-flex items-center gap-1">
                      {a.score}点
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${gradeColor(scoreToGrade(a.score))}`}>
                        {scoreToGrade(a.score)}
                      </span>
                    </span>
                  )}
                  {a.currentStatus === 'completed' && (
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => setStatusDropdownApplicantId(statusDropdownApplicantId === a.id ? null : a.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-xs cursor-pointer hover:opacity-90 ${
                          a.status == null ? 'bg-gray-100 text-gray-600' :
                          a.status === 'considering' ? 'bg-orange-100 text-orange-600' :
                          a.status === 'second_pass' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {a.status == null ? '未対応' : a.status === 'considering' ? '検討中' : a.status === 'second_pass' ? '二次通過' : '不採用'}
                        <ChevronDownIcon className="w-3.5 h-3.5" />
                      </button>
                      {statusDropdownApplicantId === a.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-[50]" 
                            onClick={() => setStatusDropdownApplicantId(null)} 
                          />
                          <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-[60] min-w-[120px] py-1">
                            <button onClick={() => handleStatusUpdate(a.id, null)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">未対応</button>
                            <button onClick={() => handleStatusUpdate(a.id, 'considering')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">検討中</button>
                            <button onClick={() => handleStatusUpdate(a.id, 'second_pass')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">二次通過</button>
                            <button onClick={() => handleStatusUpdate(a.id, 'rejected')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">不採用</button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <a href={`tel:${a.phone}`} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <PhoneIcon className="w-4 h-4" />
                  </a>
                  <button type="button" onClick={() => openMailModal(new Set([a.id]))} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <MailIcon className="w-4 h-4" />
                  </button>
                  <Link
                    href={`/client/applicants/${a.id}`}
                    onClick={() => {
                    }}
                    className="inline-flex items-center px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg"
                  >
                    詳細
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* ページネーション（見た目のみ） */}
          {/* TODO: ページネーション実装 */}
          <div className="px-3 sm:px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-sm">
            <p className="text-sm text-slate-500">
              全{filtered.length}件
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-400 cursor-not-allowed"
              >
                前へ
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-sm font-medium bg-blue-600 text-white rounded-lg"
                >
                  1
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  2
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  3
                </button>
              </div>
              <button
                type="button"
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                次へ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* メール送信モーダル */}
      {mailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeMailModal} aria-hidden />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-6">メール送信</h3>

              {/* ステップ1: テンプレート選択 */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">テンプレート選択</label>
                <select
                  value={mailTemplateId}
                  onChange={(e) => handleMailTemplateChange(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                >
                  {templates.map((t: Template) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 送信対象一覧 */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  送信先（<span className="text-blue-600 font-semibold">{mailSelectedApplicants.length}</span>名）
                </p>
                <div className="relative rounded-xl border border-gray-200 bg-slate-50/50 overflow-hidden">
                  <div
                    ref={sendListRef}
                    onScroll={checkSendListFade}
                    className="p-4 max-h-32 overflow-y-auto"
                  >
                    <ul className="text-sm">
                      {mailSelectedApplicants.map((a) => (
                        <li key={a.id} className="flex justify-between py-1.5">
                          <span className="font-medium text-gray-800">{a.name}</span>
                          <span className="text-gray-600">{a.email}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {sendListShowFade && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none"
                      aria-hidden
                    />
                  )}
                </div>
              </div>

              {/* ステップ2: プレビュー */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-2">プレビュー</p>
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                  {selectedTemplate && (
                    <>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">件名</p>
                        <p className="text-sm font-medium text-gray-800">{selectedTemplate.subject}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-2">本文</p>
                        {mailSelectedApplicants.length === 1 ? (
                          <>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">
                              {mailSelectedApplicants[0].name} 様
                              {'\n'}この度はご応募いただきありがとうございます。
                            </p>
                            <textarea
                              value={mailBody.replace(/\{\{応募者名\}\}/g, mailSelectedApplicants[0].name)}
                              onChange={(e) =>
                                setMailBody(e.target.value.split(mailSelectedApplicants[0].name).join('{{応募者名}}'))
                              }
                              rows={8}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                            />
                          </>
                        ) : (
                          <>
                            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-3">
                              <p className="text-sm text-yellow-800">
                                応募者様ごとのお名前は自動で記載されますが、テンプレート文章の追加・変更はできません。本当に送信してもよろしいでしょうか？
                              </p>
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-4 border border-slate-200 rounded-xl divide-y divide-slate-200">
                              {mailSelectedApplicants.map((a, idx) => (
                                <div key={a.id} className="p-4 first:pt-4">
                                  <p className="text-xs font-semibold text-slate-500 mb-2">
                                    {idx + 1}通目: {a.name} 様
                                  </p>
                                  <p className="text-sm text-gray-600 whitespace-pre-wrap mb-2">
                                    {a.name} 様
                                    {'\n'}この度はご応募いただきありがとうございます。
                                  </p>
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {mailBody.replace(/\{\{応募者名\}\}/g, a.name)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ステップ3: 送信確認 */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleMailSend}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  送信する
                </button>
                <button
                  type="button"
                  onClick={closeMailModal}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 送信成功トースト */}
      {mailToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          送信しました
        </div>
      )}

      {/* CSVダウンロード成功トースト */}
      {csvDownloadToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          CSVをダウンロードしました
        </div>
      )}

      {/* CSVダウンロード 案内モーダル（ライトプランの場合） */}
      {csvInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCsvInfoModalOpen(false)} aria-hidden />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-slate-900 mb-4">CSVダウンロードについて</h3>
            <p className="text-sm text-slate-600 mb-6">
              CSVダウンロード機能はスタンダード以上でご利用いただけます。
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setCsvInfoModalOpen(false)}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                閉じる
              </button>
              <Link
                href="/client/plan"
                className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                プランを確認する
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 結果更新トースト */}
      {statusToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          結果を更新しました
        </div>
      )}

      {/* CSVダウンロード 管理者認証モーダル */}
      <AdminAuthModal
        isOpen={csvAdminAuthModalOpen}
        onClose={() => setCsvAdminAuthModalOpen(false)}
        onConfirm={() => handleCsvDownload(filtered)}
      />
    </div>
  )
}

export default function ApplicantsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-500">読み込み中...</div></div>}>
      <ApplicantsContent />
    </Suspense>
  )
}

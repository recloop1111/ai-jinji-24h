'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useTemplates, type Template } from '../../contexts/TemplatesContext'

// currentStatus: preparing=準備中(システム), completed=完了(システム)
// status: considering=検討中, second_pass=二次通過, rejected=不採用(企業担当者が手動管理)
// TODO: 実データに差替え
const DUMMY_APPLICANTS = [
  { id: '1', name: '山田 太郎', email: 'yamada@example.com', phone: '090-1234-5678', interviewAt: '2025-02-14 14:30', currentStatus: 'completed', status: 'second_pass', score: 85 },
  { id: '2', name: '佐藤 花子', email: 'sato@example.com', phone: '080-2345-6789', interviewAt: '2025-02-14 11:00', currentStatus: 'preparing', status: null, score: null },
  { id: '3', name: '鈴木 一郎', email: 'suzuki@example.com', phone: '070-3456-7890', interviewAt: '2025-02-13 16:00', currentStatus: 'completed', status: 'considering', score: 78 },
  { id: '4', name: '田中 美咲', email: 'tanaka@example.com', phone: '090-4567-8901', interviewAt: '2025-02-13 10:30', currentStatus: 'preparing', status: null, score: null },
  { id: '5', name: '高橋 健太', email: 'takahashi@example.com', phone: '080-5678-9012', interviewAt: '2025-02-12 15:00', currentStatus: 'completed', status: 'rejected', score: 92 },
  { id: '6', name: '伊藤 彩', email: 'ito@example.com', phone: '070-6789-0123', interviewAt: '2025-02-12 09:00', currentStatus: 'completed', status: 'considering', score: 45 },
  { id: '7', name: '渡辺 翔太', email: 'watanabe@example.com', phone: '090-7890-1234', interviewAt: '2025-02-11 14:00', currentStatus: 'completed', status: 'second_pass', score: 88 },
  { id: '8', name: '中村 理子', email: 'nakamura@example.com', phone: '080-8901-2345', interviewAt: '2025-02-11 11:30', currentStatus: 'preparing', status: null, score: null },
  { id: '9', name: '小林 大輔', email: 'kobayashi@example.com', phone: '070-9012-3456', interviewAt: '2025-02-10 16:30', currentStatus: 'completed', status: 'rejected', score: 72 },
  { id: '10', name: '加藤 恵子', email: 'kato@example.com', phone: '090-0123-4567', interviewAt: '2025-02-10 10:00', currentStatus: 'completed', status: 'second_pass', score: 90 },
  { id: '11', name: '吉田 雄太', email: 'yoshida@example.com', phone: '080-1234-5678', interviewAt: '2025-02-09 15:00', currentStatus: 'preparing', status: null, score: null },
  { id: '12', name: '山本 美香', email: 'yamamoto@example.com', phone: '070-2345-6789', interviewAt: '2025-02-09 09:30', currentStatus: 'completed', status: 'rejected', score: 38 },
  { id: '13', name: '松本 誠', email: 'matsumoto@example.com', phone: '090-3456-7890', interviewAt: '2025-02-08 14:00', currentStatus: 'completed', status: 'considering', score: 81 },
  { id: '14', name: '井上 直樹', email: 'inoue@example.com', phone: '080-4567-8901', interviewAt: '2025-02-08 11:00', currentStatus: 'preparing', status: null, score: null },
  { id: '15', name: '木村 由美', email: 'kimura@example.com', phone: '070-5678-9012', interviewAt: '2025-02-07 16:00', currentStatus: 'completed', status: 'second_pass', score: 76 },
]

type StatusFilterValue = 'all' | 'considering' | 'second_pass' | 'rejected'

const STATUS_FILTER_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'considering', label: '検討中' },
  { value: 'second_pass', label: '二次通過' },
  { value: 'rejected', label: '不採用' },
]

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function SearchEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

// TODO: 運営設定のパスワードでサーバー側認証に差替え
const CSV_DOWNLOAD_PASSWORD = 'admin123'

export default function ApplicantsPage() {
  const { templates } = useTemplates()
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement>(null)
  const sendListRef = useRef<HTMLDivElement>(null)
  const [sendListShowFade, setSendListShowFade] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mailModalOpen, setMailModalOpen] = useState(false)
  const [mailSelectedIds, setMailSelectedIds] = useState<Set<string>>(new Set())
  const [mailTemplateId, setMailTemplateId] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [mailToast, setMailToast] = useState(false)
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [csvPassword, setCsvPassword] = useState('')
  const [csvPasswordError, setCsvPasswordError] = useState('')
  const [csvSuccess, setCsvSuccess] = useState(false)
  const [csvShowPassword, setCsvShowPassword] = useState(false)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(target)) {
        setFilterDropdownOpen(false)
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

  const handleCsvDownloadClick = () => {
    setCsvModalOpen(true)
    setCsvPassword('')
    setCsvPasswordError('')
    setCsvSuccess(false)
  }

  const handleCsvModalDownload = () => {
    if (!csvPassword.trim()) {
      setCsvPasswordError('パスワードを入力してください')
      return
    }
    if (csvPassword !== CSV_DOWNLOAD_PASSWORD) {
      setCsvPasswordError('パスワードが正しくありません')
      return
    }
    setCsvPasswordError('')
    // TODO: CSV生成・ダウンロード実装
    setCsvSuccess(true)
    setTimeout(() => {
      setCsvModalOpen(false)
      setCsvSuccess(false)
      setCsvPassword('')
    }, 2000)
  }

  const handleCsvModalCancel = () => {
    setCsvModalOpen(false)
    setCsvPassword('')
    setCsvPasswordError('')
  }

  const filtered = useMemo(() => {
    return DUMMY_APPLICANTS.filter((a) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        if (!a.name.toLowerCase().includes(q)) return false
      }
      if (dateFrom || dateTo) {
        const at = a.interviewAt ? new Date(a.interviewAt.replace(' ', 'T')).getTime() : 0
        if (dateFrom && at < new Date(dateFrom).setHours(0, 0, 0, 0)) return false
        if (dateTo && at > new Date(dateTo).setHours(23, 59, 59, 999)) return false
      }
      if (statusFilter !== 'all') {
        if (a.status === null) return false
        if (a.status !== statusFilter) return false
      }
      return true
    })
  }, [searchQuery, dateFrom, dateTo, statusFilter])

  const handleStatusFilterSelect = (value: StatusFilterValue) => {
    setStatusFilter(value)
    setFilterDropdownOpen(false)
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
    return DUMMY_APPLICANTS.filter((a) => mailSelectedIds.has(a.id))
  }, [mailSelectedIds])

  const selectedTemplate = templates.find((t: Template) => t.id === mailTemplateId)

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
          <div ref={filterDropdownRef} className="relative flex justify-end lg:justify-start">
            <button
              type="button"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              className={`inline-flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50 transition relative shrink-0 ${statusFilter !== 'all' ? 'text-blue-600' : ''}`}
            >
              {statusFilter !== 'all' && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full" />
              )}
              <FilterIcon className="w-4 h-4 shrink-0" />
              {statusFilter !== 'all' ? '絞り込み中' : '絞り込み'}
            </button>
            {filterDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-50 min-w-[200px]">
                <p className="text-sm font-semibold text-gray-700 mb-2">ステータスで絞り込み</p>
                <div className="space-y-2">
                  {STATUS_FILTER_OPTIONS.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 -my-1">
                      <input
                        type="radio"
                        name="statusFilter"
                        checked={statusFilter === o.value}
                        onChange={() => handleStatusFilterSelect(o.value)}
                        className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* メール送信バー（選択時） */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
          <span className="text-sm font-medium text-slate-700">{selectedCount}名選択中</span>
          <button
            type="button"
            onClick={() => openMailModal(selectedIds)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700"
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="w-12 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">応募者名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">メールアドレス</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">電話番号</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">面接日時</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">現在状況</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">スコア</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ステータス</th>
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
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                    <td className="px-4 py-3 text-slate-600">{a.email}</td>
                    <td className="px-4 py-3 text-slate-600">{a.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{a.interviewAt}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          a.currentStatus === 'preparing' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'
                        }`}
                      >
                        {a.currentStatus === 'preparing' ? '準備中' : '完了'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.currentStatus === 'preparing' ? '' : a.score}
                    </td>
                    <td className="px-4 py-3">
                      {a.currentStatus === 'preparing' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            a.status === 'considering'
                              ? 'bg-orange-100 text-orange-600'
                              : a.status === 'second_pass'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-red-100 text-red-600'
                          }`}
                        >
                          {a.status === 'considering' ? '検討中' : a.status === 'second_pass' ? '二次通過' : '不採用'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`tel:${a.phone}`}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="電話"
                        >
                          <PhoneIcon className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => openMailModal(new Set([a.id]))}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="メール"
                        >
                          <MailIcon className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/client/applicants/${a.id}`}
                          className="inline-flex items-center px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-colors"
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

          {/* ページネーション（見た目のみ） */}
          {/* TODO: ページネーション実装 */}
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
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
                  className="w-8 h-8 flex items-center justify-center text-sm font-medium bg-indigo-600 text-white rounded-lg"
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
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
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none"
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
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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

      {/* CSVダウンロード パスワードモーダル */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={handleCsvModalCancel} aria-hidden />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">CSVダウンロード認証</h3>
            <p className="text-sm text-slate-600 mb-4">
              CSVダウンロードにはパスワードが必要です。パスワードは運営より発行されます。
            </p>
            {csvSuccess ? (
              <p className="py-4 text-center text-sm font-medium text-emerald-600">ダウンロードを開始します</p>
            ) : (
              <>
                <div className="mb-4">
                  <label htmlFor="csv-password" className="block text-sm font-medium text-slate-700 mb-2">パスワード</label>
                  <div className="relative">
                    <input
                      id="csv-password"
                      type={csvShowPassword ? 'text' : 'password'}
                      value={csvPassword}
                      onChange={(e) => { setCsvPassword(e.target.value); setCsvPasswordError('') }}
                      className="w-full px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pr-12"
                      placeholder="パスワードを入力"
                    />
                    <button
                      type="button"
                      onClick={() => setCsvShowPassword(!csvShowPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600"
                      aria-label={csvShowPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                    >
                      {csvShowPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                  {csvPasswordError && <p className="mt-1.5 text-sm text-red-600">{csvPasswordError}</p>}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCsvModalCancel}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleCsvModalDownload}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                  >
                    ダウンロード
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

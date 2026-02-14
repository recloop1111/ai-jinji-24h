'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

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

const CURRENT_STATUS_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'preparing', label: '準備中' },
  { value: 'completed', label: '完了' },
]

const STATUS_OPTIONS = [
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


// TODO: 運営設定のパスワードでサーバー側認証に差替え
const CSV_DOWNLOAD_PASSWORD = 'admin123'

export default function ApplicantsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCurrentStatus, setFilterCurrentStatus] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [csvModalOpen, setCsvModalOpen] = useState(false)
  const [csvPassword, setCsvPassword] = useState('')
  const [csvPasswordError, setCsvPasswordError] = useState('')
  const [csvSuccess, setCsvSuccess] = useState(false)
  const [csvShowPassword, setCsvShowPassword] = useState(false)

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
      if (filterCurrentStatus !== 'all' && a.currentStatus !== filterCurrentStatus) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      if (dateFrom || dateTo) {
        const at = a.interviewAt ? new Date(a.interviewAt.replace(' ', 'T')).getTime() : 0
        if (dateFrom && at < new Date(dateFrom).setHours(0, 0, 0, 0)) return false
        if (dateTo && at > new Date(dateTo).setHours(23, 59, 59, 999)) return false
      }
      return true
    })
  }, [searchQuery, filterCurrentStatus, filterStatus, dateFrom, dateTo])

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
        <div className="flex flex-col lg:flex-row gap-4">
          <input
            type="text"
            placeholder="応募者名で検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={filterCurrentStatus}
            onChange={(e) => setFilterCurrentStatus(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {CURRENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 border border-gray-300 bg-white rounded-lg text-sm text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
        </div>
      </div>

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
                      {/* TODO: 実際のIDに差替え */}
                      <Link
                        href={`/client/applicants/${a.id}`}
                        className="inline-flex items-center px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded-lg transition-colors"
                      >
                        詳細
                      </Link>
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

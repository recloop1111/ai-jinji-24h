'use client'

import { useState, useEffect } from 'react'

type SuspensionItem = {
  id: string
  company_name: string
  type: string
  status: string
  requested_at: string | null
  scheduled_stop_at: string | null
  created_at: string
}

function getTypeBadge(type: string): { label: string; className: string } {
  if (type === 'emergency') {
    return { label: '緊急', className: 'bg-red-500/10 text-red-400 border border-red-500/20' }
  }
  return { label: '通常', className: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' }
}

function getStatusBadge(status: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: '停止予定', className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
    pending_approval: { label: '承認待ち', className: 'bg-red-500/10 text-red-400 border border-red-500/20' },
    approved: { label: '承認済み', className: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
    executed: { label: '停止済み', className: 'bg-gray-500/10 text-gray-400 border border-gray-500/20' },
    cancelled: { label: '取消済み', className: 'bg-gray-500/10 text-gray-500 border border-gray-500/20' },
    rejected: { label: '却下', className: 'bg-gray-500/10 text-gray-500 border border-gray-500/20' },
  }
  return map[status] ?? { label: status, className: 'bg-gray-500/10 text-gray-400 border border-gray-500/20' }
}

function formatDateTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ja-JP')
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ja-JP')
}

export default function AdminSuspensionPage() {
  const [items, setItems] = useState<SuspensionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/admin/suspensions')
        if (!res.ok) {
          if (!cancelled) setError('停止申請の取得に失敗しました')
          return
        }
        const json = await res.json()
        if (cancelled) return
        setItems(Array.isArray(json?.suspensions) ? (json.suspensions as SuspensionItem[]) : [])
      } catch {
        if (!cancelled) setError('停止申請の取得に失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-white">停止申請管理</h1>
        <p className="text-sm text-gray-400 mt-1">企業からの一時停止・緊急停止申請の一覧</p>
      </div>

      {error ? (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : loading ? (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">読み込み中...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">停止申請はありません</p>
        </div>
      ) : (
        <>
          {/* テーブル（lg以上） */}
          <div className="hidden lg:block bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                    <th className="text-left text-xs text-gray-500 py-3 px-5">企業名</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">種別</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">ステータス</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">申請日時</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">予定停止日</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const typeBadge = getTypeBadge(item.type)
                    const statusBadge = getStatusBadge(item.status)
                    return (
                      <tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-4 px-5 text-sm font-medium text-white">{item.company_name || '—'}</td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 ${typeBadge.className}`}>
                            {typeBadge.label}
                          </span>
                        </td>
                        <td className="py-4 px-5">
                          <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 ${statusBadge.className}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-sm text-gray-400">{formatDateTime(item.requested_at)}</td>
                        <td className="py-4 px-5 text-sm text-gray-400">
                          {item.type === 'emergency' ? '即時（承認後）' : formatDate(item.scheduled_stop_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* カード（モバイル・タブレット） */}
          <div className="lg:hidden space-y-3">
            {items.map((item) => {
              const typeBadge = getTypeBadge(item.type)
              const statusBadge = getStatusBadge(item.status)
              return (
                <div key={item.id} className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-medium text-white">{item.company_name || '—'}</p>
                    <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 shrink-0 ${typeBadge.className}`}>
                      {typeBadge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex text-xs rounded-lg px-2.5 py-1 ${statusBadge.className}`}>
                      {statusBadge.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">申請日時: {formatDateTime(item.requested_at)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    予定停止日: {item.type === 'emergency' ? '即時（承認後）' : formatDate(item.scheduled_stop_at)}
                  </p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

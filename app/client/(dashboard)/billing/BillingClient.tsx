'use client'

import { useState, useEffect } from 'react'
import { Download as DownloadIcon, Landmark as BankIcon } from 'lucide-react'
import { PRICE_PER_INTERVIEW } from '@/types/database'

// payment_status の正式 domain（B-1: pending/paid/failed/refunded）に合わせた badge。未知は fallback。
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '振込待ち', className: 'bg-yellow-100 text-yellow-700' },
  paid: { label: '入金確認済み', className: 'bg-green-100 text-green-700' },
  failed: { label: '支払い失敗', className: 'bg-red-100 text-red-700' },
  refunded: { label: '返金済み', className: 'bg-slate-100 text-slate-500' },
}
// 請求書 DL 可能な status（server の isIssuableStatus と整合＝pending/paid のみ）。
const ISSUABLE = new Set(['pending', 'paid'])

type Invoice = { id: string; period: string; interview_count: number | null; amount: number; tax_amount: number | null; status: string; created_at: string }

// 請求履歴（表示・DL）。データは server API /api/client/billing（billing.read gate・service-role）から取得。
//   到達は Server Component (page.tsx) で billing.read を検証済み。ここでは browser 直読みしない。
export default function BillingClient() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [monthlyInterviewLimit, setMonthlyInterviewLimit] = useState(0)
  const [pricePerInterview, setPricePerInterview] = useState<number>(PRICE_PER_INTERVIEW)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [toastMsg, setToastMsg] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/client/billing', { cache: 'no-store' })
        if (!res.ok) { if (alive) setLoadError(true); return }
        const json = await res.json().catch(() => null)
        if (!alive || !json) { if (alive) setLoadError(true); return }
        setMonthlyCount(json.monthly_count ?? 0)
        setMonthlyInterviewLimit(json.monthly_interview_limit ?? 10)
        setPricePerInterview(json.price_per_interview ?? PRICE_PER_INTERVIEW)
        setInvoices(Array.isArray(json.records) ? (json.records as Invoice[]) : [])
      } catch {
        if (alive) setLoadError(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2500) }

  const handleInvoiceDownload = async (id: string) => {
    if (downloadingId) return
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/client/billing/${id}/invoice`)
      if (!res.ok) {
        showToast(res.status === 422 ? 'この請求は請求書を発行できません' : '請求書の取得に失敗しました')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="([^"]+)"/)
      a.download = m ? m[1] : `invoice-${id.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      showToast('請求書の取得に失敗しました')
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">請求履歴</h1>
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center"><p className="text-slate-500">読み込み中...</p></div>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">請求履歴</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">請求情報を取得できませんでした。時間をおいて再度お試しください。</div>
      </div>
    )
  }

  const currentCharge = monthlyCount * pricePerInterview
  const remaining = Math.max(0, monthlyInterviewLimit - monthlyCount)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">請求履歴</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">今月の請求見込み</p>
          <p className="text-2xl font-bold text-slate-900">¥{currentCharge.toLocaleString()}<span className="text-sm font-normal text-slate-500 ml-1">（税別）</span></p>
          <p className="text-xs text-slate-400 mt-2">{monthlyCount}人 × ¥{pricePerInterview.toLocaleString()} / 月末締め</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">月間利用状況</p>
          <p className="text-xl font-bold text-slate-900">{monthlyCount}<span className="text-sm font-normal text-slate-500 ml-1">/ {monthlyInterviewLimit}人</span></p>
          <p className="text-xs text-slate-400 mt-2">残り {remaining}人</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">支払い方法</p>
          <div className="flex items-center gap-2">
            <BankIcon className="w-8 h-8 text-slate-600" />
            <p className="text-base font-medium text-slate-900">請求書払い（銀行振込）</p>
          </div>
          <p className="text-xs text-slate-400 mt-2">請求は月末締めとなります</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200"><h2 className="text-sm font-semibold text-slate-700">過去の請求履歴</h2></div>
        {invoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">期間</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">内容</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">金額（税別）</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ステータス</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const status = STATUS_BADGE[inv.status] ?? { label: inv.status, className: 'bg-gray-100 text-gray-600' }
                  const interviewCount = inv.interview_count ?? 0
                  const invoiceUnitPrice = interviewCount > 0 ? Math.round(inv.amount / interviewCount) : pricePerInterview
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-600">{inv.period}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">面接 {interviewCount}人 × ¥{invoiceUnitPrice.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-slate-900">¥{inv.amount.toLocaleString()}</td>
                      <td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span></td>
                      <td className="px-4 py-3 text-right">
                        {ISSUABLE.has(inv.status) ? (
                          <button type="button" onClick={() => handleInvoiceDownload(inv.id)} disabled={downloadingId === inv.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                            <DownloadIcon className="w-4 h-4" />
                            {downloadingId === inv.id ? '生成中...' : '請求書DL'}
                          </button>
                        ) : (<span className="text-xs text-slate-400">—</span>)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-slate-500">請求履歴はまだありません</p>
            <p className="text-xs text-slate-400 mt-1">月末締めの請求が確定すると、ここに表示されます</p>
          </div>
        )}
      </div>

      {toastMsg && (<div className="fixed bottom-6 right-6 bg-slate-800 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">{toastMsg}</div>)}
    </div>
  )
}

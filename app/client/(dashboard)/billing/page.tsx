'use client'

import { useState } from 'react'
import { Download as DownloadIcon, Landmark as BankIcon } from 'lucide-react'

// TODO: 実データに差替え
const PAYMENT_INFO = {
  monthlyAmount: 120000,
  planLabel: 'プランB（11〜20件）',
  nextBillingDate: '2025-03-15',
  paymentMethod: '請求書払い（銀行振込）',
  transferBank: 'みずほ銀行 渋谷支店',
  transferAccountType: '普通',
  transferAccountNumber: '1234567',
  transferAccountName: 'カ）エーアイジンジニジュウヨジカン',
}

// TODO: 実データに差替え
const BILLING_RECORDS = [
  { id: '1', date: '2025-02-15', description: 'プランB 月額利用料（2月分）', amount: 120000, status: 'pending' as const },
  { id: '2', date: '2025-01-15', description: 'プランB 月額利用料（1月分）', amount: 120000, status: 'paid' as const },
  { id: '3', date: '2025-01-15', description: '初期費用', amount: 200000, status: 'paid' as const },
  { id: '4', date: '2025-01-15', description: '職種追加（営業職）', amount: 100000, status: 'paid' as const },
  { id: '5', date: '2024-12-20', description: 'プランA 月額利用料（12月分）', amount: 60000, status: 'paid' as const },
  { id: '6', date: '2024-11-20', description: 'プランA 月額利用料（11月分）', amount: 60000, status: 'paid' as const },
  { id: '7', date: '2024-10-20', description: 'プランA 月額利用料（10月分）', amount: 60000, status: 'paid' as const },
  { id: '8', date: '2024-09-20', description: 'プランA 月額利用料（9月分）', amount: 60000, status: 'paid' as const },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: '入金確認済み', className: 'bg-green-100 text-green-700' },
  pending: { label: '振込待ち', className: 'bg-yellow-100 text-yellow-700' },
  processing: { label: '処理中', className: 'bg-yellow-100 text-yellow-700' },
}


export default function BillingPage() {
  const [downloadToast, setDownloadToast] = useState(false)
  const handleInvoiceDownload = () => {
    // TODO: Stripe APIから請求書PDFを取得してダウンロード
    setDownloadToast(true)
    setTimeout(() => setDownloadToast(false), 2000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">請求履歴</h1>

      {/* 上部: 支払い情報カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">今月の請求額</p>
          <p className="text-2xl font-bold text-slate-900">¥{PAYMENT_INFO.monthlyAmount.toLocaleString()}（税別）</p>
          <p className="text-xs text-slate-500 mt-2">{PAYMENT_INFO.planLabel}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">次回請求日</p>
          <p className="text-xl font-bold text-slate-900">{PAYMENT_INFO.nextBillingDate}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">支払い方法</p>
          <div className="flex items-center gap-2">
            <BankIcon className="w-8 h-8 text-slate-600" />
            <p className="text-base font-medium text-slate-900">{PAYMENT_INFO.paymentMethod}</p>
          </div>
          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500">振込先: {PAYMENT_INFO.transferBank}</p>
            <p className="text-xs text-gray-500">{PAYMENT_INFO.transferAccountType} {PAYMENT_INFO.transferAccountNumber}</p>
            <p className="text-xs text-gray-500">{PAYMENT_INFO.transferAccountName}</p>
          </div>
          {/* TODO: 実際の振込先情報に差替え */}
        </div>
      </div>

      {/* 中部: 請求履歴テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">請求日</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">内容</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">金額（税別）</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ステータス</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BILLING_RECORDS.map((r) => {
                const status = STATUS_BADGE[r.status] ?? { label: r.status, className: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-600">{r.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.description}</td>
                    <td className="px-4 py-3 text-right text-slate-900">¥{r.amount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={handleInvoiceDownload}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <DownloadIcon className="w-4 h-4" />
                        請求書DL
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ダウンロード成功トースト */}
      {downloadToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          請求書をダウンロードしました
        </div>
      )}
    </div>
  )
}

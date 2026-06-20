'use client'

import { useState, useEffect } from 'react'
import { Download as DownloadIcon, Landmark as BankIcon } from 'lucide-react'
import { createClientBrowserClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'
import { PRICE_PER_INTERVIEW } from '@/types/database'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: '入金確認済み', className: 'bg-green-100 text-green-700' },
  pending: { label: '振込待ち', className: 'bg-yellow-100 text-yellow-700' },
  billed: { label: '請求済み', className: 'bg-blue-100 text-blue-700' },
  overdue: { label: '支払い遅延', className: 'bg-red-100 text-red-700' },
  draft: { label: '下書き', className: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'キャンセル', className: 'bg-slate-100 text-slate-500' },
}

type Invoice = {
  id: string
  period: string
  interview_count: number | null
  amount: number
  tax_amount: number | null
  status: string
  stripe_invoice_url: string | null
  created_at: string
}

export default function BillingPage() {
  const { companyId, loading: companyIdLoading } = useCompanyId()
  const supabase = createClientBrowserClient()

  const [loading, setLoading] = useState(true)
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [monthlyInterviewLimit, setMonthlyInterviewLimit] = useState(0)
  const [pricePerInterview, setPricePerInterview] = useState<number>(PRICE_PER_INTERVIEW)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [downloadToast, setDownloadToast] = useState(false)

  useEffect(() => {
    if (!companyId) {
      if (!companyIdLoading) setLoading(false)
      return
    }

    async function fetchBillingData() {
      setLoading(true)
      try {
        // 企業情報
        const { data: company } = await supabase
          .from('companies')
          .select('monthly_interview_limit, price_per_interview')
          .eq('id', companyId)
          .single()

        setMonthlyInterviewLimit(company?.monthly_interview_limit ?? 10)
        setPricePerInterview(company?.price_per_interview ?? PRICE_PER_INTERVIEW)

        // 当月の billable 面接数
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        const { count } = await supabase
          .from('interviews')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('is_billable', true)
          .gte('created_at', monthStart)

        setMonthlyCount(count ?? 0)

        // 過去請求履歴（確定請求は実DBの billing_records。invoices テーブルは存在しない）
        // マッピング: amount=amount_jpy(税抜) / tax_amount=tax_jpy / status=payment_status / period=billing_month(date)→YYYY-MM / stripe_invoice_url=invoice_pdf_url
        const { data: recordData } = await supabase
          .from('billing_records')
          .select('id, billing_month, interview_count, amount_jpy, tax_jpy, payment_status, invoice_pdf_url, created_at')
          .eq('company_id', companyId)
          .order('billing_month', { ascending: false })
          .limit(20)

        setInvoices(
          (recordData ?? []).map((r) => ({
            id: r.id,
            period: r.billing_month ? String(r.billing_month).slice(0, 7) : '',
            interview_count: r.interview_count,
            amount: r.amount_jpy ?? 0,
            tax_amount: r.tax_jpy,
            status: r.payment_status,
            stripe_invoice_url: r.invoice_pdf_url,
            created_at: r.created_at,
          })),
        )
      } catch {
        // エラー時はデフォルト値のまま
      } finally {
        setLoading(false)
      }
    }

    fetchBillingData()
  }, [companyId, companyIdLoading, supabase])

  const handleInvoiceDownload = () => {
    // TODO: Stripe APIから請求書PDFを取得してダウンロード
    setDownloadToast(true)
    setTimeout(() => setDownloadToast(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">請求履歴</h1>
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center">
          <p className="text-slate-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  const currentCharge = monthlyCount * pricePerInterview
  const remaining = Math.max(0, monthlyInterviewLimit - monthlyCount)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">請求履歴</h1>

      {/* 上部: 今月の請求見込み・利用状況・支払い方法 */}
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

      {/* 請求履歴テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">過去の請求履歴</h2>
        </div>
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
                  // 過去請求の内訳は当時の実単価（金額÷人数）を表示。人数0/不明時は現単価でフォールバック
                  const invoiceUnitPrice = interviewCount > 0 ? Math.round(inv.amount / interviewCount) : pricePerInterview
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-600">{inv.period}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        面接 {interviewCount}人 × ¥{invoiceUnitPrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">¥{inv.amount.toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={handleInvoiceDownload}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
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
        ) : (
          <div className="p-8 text-center">
            <p className="text-slate-500">請求履歴はまだありません</p>
            <p className="text-xs text-slate-400 mt-1">月末締めの請求が確定すると、ここに表示されます</p>
          </div>
        )}
      </div>

      {/* ダウンロードトースト */}
      {downloadToast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          請求書ダウンロード機能は今後実装予定です
        </div>
      )}
    </div>
  )
}

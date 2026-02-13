'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type BillingRecord = {
  id: string
  billing_month: string
  plan_at_billing: string
  auto_upgrade_applied: boolean
  interview_count: number
  amount_jpy: number
  tax_jpy: number
  total_jpy: number
  payment_status: string
  invoice_pdf_url: string | null
  paid_at: string | null
  created_at: string
}

const PLAN_NAMES: Record<string, string> = {
  plan_a: 'プランA',
  plan_b: 'プランB',
  plan_c: 'プランC',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: '支払済', className: 'bg-green-100 text-green-800' },
  pending: { label: '未払い', className: 'bg-yellow-100 text-yellow-800' },
  failed: { label: '失敗', className: 'bg-red-100 text-red-800' },
  refunded: { label: '返金済', className: 'bg-gray-100 text-gray-600' },
}

export default function BillingPage() {
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchBilling()
  }, [])

  const fetchBilling = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!company) return

    const { data } = await supabase
      .from('billing_records')
      .select('*')
      .eq('company_id', company.id)
      .order('billing_month', { ascending: false })

    if (data) setRecords(data)
    setLoading(false)
  }

  const formatMonth = (month: string) => {
    if (!month) return '—'
    const [y, m] = month.split('-')
    return `${y}年${parseInt(m)}月`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">請求履歴</h1>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">読み込み中...</div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">請求履歴はまだありません。</p>
          <p className="text-sm text-gray-400">利用開始後、毎月の請求情報がここに表示されます。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-600">
                <th className="px-4 py-3">請求月</th>
                <th className="px-4 py-3">プラン</th>
                <th className="px-4 py-3">面接件数</th>
                <th className="px-4 py-3 text-right">税抜金額</th>
                <th className="px-4 py-3 text-right">消費税</th>
                <th className="px-4 py-3 text-right">合計</th>
                <th className="px-4 py-3">ステータス</th>
                <th className="px-4 py-3">支払日</th>
                <th className="px-4 py-3">請求書</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => {
                const status = STATUS_BADGE[r.payment_status] || { label: r.payment_status, className: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{formatMonth(r.billing_month)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {PLAN_NAMES[r.plan_at_billing] || r.plan_at_billing}
                      {r.auto_upgrade_applied && (
                        <span className="ml-1 text-xs text-orange-600">（自動繰上）</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.interview_count}件</td>
                    <td className="px-4 py-3 text-right text-gray-900">¥{r.amount_jpy.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-600">¥{r.tax_jpy.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">¥{r.total_jpy.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.paid_at)}</td>
                    <td className="px-4 py-3">
                      {r.invoice_pdf_url ? (
                        <a href={r.invoice_pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-500 text-sm">
                          PDF
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

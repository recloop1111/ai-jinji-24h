'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type SuspensionRequest = {
  id: string
  request_type: string
  reason: string
  status: string
  requested_start_date: string | null
  review_comment: string | null
  reviewed_at: string | null
  created_at: string
}

const REQUEST_TYPES: Record<string, string> = {
  suspension: '一時停止',
  cancellation: '解約',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '審査中', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: '承認済', className: 'bg-green-100 text-green-800' },
  rejected: { label: '却下', className: 'bg-red-100 text-red-800' },
}

export default function SuspensionPage() {
  const [requests, setRequests] = useState<SuspensionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState('suspension')
  const [formReason, setFormReason] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!company) return

    setCompanyId(company.id)

    const { data } = await supabase
      .from('suspension_requests')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })

    if (data) setRequests(data)
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!companyId || !formReason.trim()) return
    setSaving(true)
    setMessage(null)

    const { error } = await supabase.from('suspension_requests').insert({
      company_id: companyId,
      request_type: formType,
      reason: formReason,
      requested_start_date: formStartDate || null,
      status: 'pending',
    })

    if (error) {
      setMessage({ type: 'error', text: '申請の送信に失敗しました。' })
    } else {
      setMessage({ type: 'success', text: '申請を送信しました。運営チームが確認次第、ご連絡いたします。' })
      setShowForm(false)
      setFormReason('')
      setFormStartDate('')
      setFormType('suspension')
      fetchRequests()
    }
    setSaving(false)
    setTimeout(() => setMessage(null), 5000)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const hasPendingRequest = requests.some(r => r.status === 'pending')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">停止・解約申請</h1>
        {!showForm && !hasPendingRequest && (
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700">
            新規申請
          </button>
        )}
      </div>

      {message && (
        <div className={`rounded-md p-3 mb-4 ${message.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <p className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>
        </div>
      )}

      {hasPendingRequest && !showForm && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <p className="text-sm text-yellow-800">現在審査中の申請があります。審査完了までお待ちください。</p>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">停止・解約申請フォーム</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">申請種別</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="suspension">一時停止</option>
                <option value="cancellation">解約</option>
              </select>
            </div>

            {formType === 'suspension' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">希望停止開始日</label>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={e => setFormStartDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">理由 <span className="text-red-500">*</span></label>
              <textarea
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                rows={5}
                placeholder="停止・解約の理由をご記入ください。"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">{formReason.length} 文字</p>
            </div>

            {formType === 'cancellation' && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-700">解約を行うと、すべてのデータが削除され、復元できません。面接URLも無効になります。</p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t">
              <button
                onClick={handleSubmit}
                disabled={saving || !formReason.trim()}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '送信中...' : '申請を送信'}
              </button>
              <button onClick={() => { setShowForm(false); setFormReason(''); setFormStartDate('') }} className="px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-md hover:bg-gray-50">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">読み込み中...</div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">申請履歴はありません。</p>
          <p className="text-sm text-gray-400">停止や解約が必要な場合は「新規申請」から手続きしてください。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map(r => {
            const status = STATUS_BADGE[r.status] || { label: r.status, className: 'bg-gray-100 text-gray-600' }
            return (
              <div key={r.id} className="bg-white rounded-lg shadow p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-800">
                      {REQUEST_TYPES[r.request_type] || r.request_type}
                    </span>
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                </div>

                <p className="text-sm text-gray-700 mb-2">{r.reason}</p>

                {r.requested_start_date && (
                  <p className="text-xs text-gray-500">希望停止開始日: {formatDate(r.requested_start_date)}</p>
                )}

                {r.review_comment && (
                  <div className="mt-3 bg-gray-50 rounded p-3">
                    <p className="text-xs text-gray-500 mb-1">運営からのコメント（{formatDate(r.reviewed_at)}）</p>
                    <p className="text-sm text-gray-700">{r.review_comment}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

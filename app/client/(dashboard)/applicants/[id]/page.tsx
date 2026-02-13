'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type TabName = 'basic' | 'recording' | 'evaluation' | 'memo' | 'status'

type Applicant = {
  id: string
  last_name: string
  first_name: string
  phone_number: string
  email: string
  selection_status: string
  created_at: string
  job_types: { name: string } | null
}

type Memo = {
  id: string
  content: string
  created_at: string
  updated_at: string
}

const STATUS_OPTIONS = [
  { value: 'pending', label: '未対応' },
  { value: 'second_interview', label: '二次面接へ' },
  { value: 'rejected', label: '不採用' },
]

const statusLabel = (status: string) =>
  STATUS_OPTIONS.find(s => s.value === status)?.label ?? status

const statusBadge = (status: string) => {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    second_interview: 'bg-green-100 text-green-800',
    rejected: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {statusLabel(status)}
    </span>
  )
}

export default function ApplicantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const applicantId = params.id as string
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<TabName>('basic')
  const [loading, setLoading] = useState(true)
  const [applicant, setApplicant] = useState<Applicant | null>(null)
  const [companyId, setCompanyId] = useState('')

  // メモ関連
  const [memos, setMemos] = useState<Memo[]>([])
  const [newMemo, setNewMemo] = useState('')
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)

  // ステータス変更関連
  const [selectedStatus, setSelectedStatus] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    fetchData()
  }, [applicantId])

  const fetchData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/client/login'); return }

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!company) return
    setCompanyId(company.id)

    const { data: app } = await supabase
      .from('applicants')
      .select('id, last_name, first_name, phone_number, email, selection_status, created_at, job_types(name)')
      .eq('id', applicantId)
      .eq('company_id', company.id)
      .single()

    if (!app) { setLoading(false); return }
    setApplicant(app as unknown as Applicant)
    setSelectedStatus(app.selection_status)

    await fetchMemos()
    setLoading(false)
  }

  const fetchMemos = async () => {
    const { data } = await supabase
      .from('internal_memos')
      .select('id, content, created_at, updated_at')
      .eq('applicant_id', applicantId)
      .order('created_at', { ascending: false })
    setMemos(data || [])
  }

  // --- メモ CRUD ---
  const handleCreateMemo = async () => {
    if (!newMemo.trim()) return
    setMemoSaving(true)
    await supabase.from('internal_memos').insert({
      applicant_id: applicantId,
      company_id: companyId,
      content: newMemo.trim(),
    })
    setNewMemo('')
    await fetchMemos()
    setMemoSaving(false)
  }

  const handleUpdateMemo = async (memoId: string) => {
    if (!editingContent.trim()) return
    setMemoSaving(true)
    await supabase
      .from('internal_memos')
      .update({ content: editingContent.trim(), updated_at: new Date().toISOString() })
      .eq('id', memoId)
    setEditingMemoId(null)
    setEditingContent('')
    await fetchMemos()
    setMemoSaving(false)
  }

  const handleDeleteMemo = async (memoId: string) => {
    if (!confirm('このメモを削除しますか？')) return
    await supabase.from('internal_memos').delete().eq('id', memoId)
    await fetchMemos()
  }

  const startEditing = (memo: Memo) => {
    setEditingMemoId(memo.id)
    setEditingContent(memo.content)
  }

  // --- ステータス変更 ---
  const handleStatusChange = async () => {
    if (!selectedStatus || selectedStatus === applicant?.selection_status) return
    setStatusSaving(true)
    setStatusMessage('')

    const { error } = await supabase
      .from('applicants')
      .update({ selection_status: selectedStatus, updated_at: new Date().toISOString() })
      .eq('id', applicantId)

    if (!error) {
      await supabase.from('selection_status_histories').insert({
        applicant_id: applicantId,
        old_status: applicant!.selection_status,
        new_status: selectedStatus,
      })
      setApplicant({ ...applicant!, selection_status: selectedStatus })
      setStatusMessage('ステータスを更新しました')
    } else {
      setStatusMessage('更新に失敗しました')
    }
    setStatusSaving(false)
  }

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  if (loading) return <div className="text-center py-12 text-gray-500">読み込み中...</div>
  if (!applicant) return <div className="text-center py-12 text-gray-500">応募者が見つかりません</div>

  const tabs: { key: TabName; label: string }[] = [
    { key: 'basic', label: '基本情報' },
    { key: 'recording', label: '面接録画' },
    { key: 'evaluation', label: 'AI評価' },
    { key: 'memo', label: 'メモ' },
    { key: 'status', label: 'ステータス変更' },
  ]

  return (
    <div>
      {/* 戻るボタン */}
      <Link
        href="/client/applicants"
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-500 mb-4"
      >
        ← 応募者一覧に戻る
      </Link>

      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {applicant.last_name} {applicant.first_name}
        </h1>
        {statusBadge(applicant.selection_status)}
      </div>

      {/* タブナビゲーション */}
      <div className="border-b mb-6">
        <nav className="flex gap-0 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 基本情報タブ */}
      {activeTab === 'basic' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">基本情報</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-gray-500">応募者名</dt>
              <dd className="mt-1 text-gray-900 font-medium">{applicant.last_name} {applicant.first_name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">電話番号</dt>
              <dd className="mt-1 text-gray-900">{applicant.phone_number || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">メールアドレス</dt>
              <dd className="mt-1 text-gray-900">{applicant.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">応募日時</dt>
              <dd className="mt-1 text-gray-900">{formatDate(applicant.created_at)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">ステータス</dt>
              <dd className="mt-1">{statusBadge(applicant.selection_status)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">希望職種</dt>
              <dd className="mt-1 text-gray-900">{applicant.job_types?.name || '—'}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* 面接録画タブ */}
      {activeTab === 'recording' && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-400 text-4xl mb-3">🎥</div>
          <p className="text-gray-500 font-medium">録画データなし</p>
          <p className="text-sm text-gray-400 mt-1">面接録画がある場合、ここに表示されます。</p>
        </div>
      )}

      {/* AI評価タブ */}
      {activeTab === 'evaluation' && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="text-gray-400 text-4xl mb-3">📊</div>
          <p className="text-gray-500 font-medium">評価データなし</p>
          <p className="text-sm text-gray-400 mt-1">AI評価レポートがある場合、ここにスコアが表示されます。</p>
        </div>
      )}

      {/* メモタブ */}
      {activeTab === 'memo' && (
        <div className="space-y-6">
          {/* メモ作成 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">新しいメモを追加</h2>
            <textarea
              value={newMemo}
              onChange={e => setNewMemo(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="メモを入力..."
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">{newMemo.length}/2000</span>
              <button
                onClick={handleCreateMemo}
                disabled={memoSaving || !newMemo.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {memoSaving ? '保存中...' : '追加'}
              </button>
            </div>
          </div>

          {/* メモ一覧 */}
          {memos.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              メモはまだありません
            </div>
          ) : (
            <div className="space-y-3">
              {memos.map(memo => (
                <div key={memo.id} className="bg-white rounded-lg shadow p-4">
                  {editingMemoId === memo.id ? (
                    <>
                      <textarea
                        value={editingContent}
                        onChange={e => setEditingContent(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleUpdateMemo(memo.id)}
                          disabled={memoSaving}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => { setEditingMemoId(null); setEditingContent('') }}
                          className="px-3 py-1.5 border border-gray-300 text-sm text-gray-700 rounded-md hover:bg-gray-50"
                        >
                          キャンセル
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{memo.content}</p>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <span className="text-xs text-gray-400">
                          {formatDate(memo.created_at)}
                          {memo.updated_at !== memo.created_at && ` (編集: ${formatDate(memo.updated_at)})`}
                        </span>
                        <div className="flex gap-3">
                          <button
                            onClick={() => startEditing(memo)}
                            className="text-xs text-blue-600 hover:text-blue-500"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDeleteMemo(memo.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ステータス変更タブ */}
      {activeTab === 'status' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ステータス変更</h2>
          <p className="text-sm text-gray-500 mb-4">
            現在のステータス: {statusBadge(applicant.selection_status)}
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                新しいステータス
              </label>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleStatusChange}
              disabled={statusSaving || selectedStatus === applicant.selection_status}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {statusSaving ? '更新中...' : '変更を保存'}
            </button>
          </div>
          {statusMessage && (
            <p className={`text-sm mt-3 ${statusMessage.includes('失敗') ? 'text-red-600' : 'text-green-600'}`}>
              {statusMessage}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

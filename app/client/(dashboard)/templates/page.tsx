'use client'

import { useState } from 'react'
import { useTemplates, type Template } from '../../contexts/TemplatesContext'

const VARIABLES = [
  { key: '{{応募者名}}' },
  { key: '{{面接日時}}' },
  { key: '{{面接URL}}' },
  { key: '{{企業名}}' },
]

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

export default function TemplatesPage() {
  const { templates, updateTemplate, addTemplate, deleteTemplate } = useTemplates()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formSubject, setFormSubject] = useState('')
  const [formBody, setFormBody] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const copyToClipboard = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(msg)
    } catch {
      showToast('コピーに失敗しました')
    }
  }

  const openCreate = () => {
    setEditingId(null)
    setFormName('')
    setFormSubject('')
    setFormBody('')
    setModalOpen(true)
  }

  const openEdit = (t: Template) => {
    setEditingId(t.id)
    setFormName(t.name)
    setFormSubject(t.subject)
    setFormBody(t.body)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
  }

  const insertVariable = (key: string) => {
    setFormBody((prev) => prev + key)
  }

  const handleSave = () => {
    if (!formName.trim() || !formSubject.trim() || !formBody.trim()) return
    // TODO: API連携
    if (editingId) {
      updateTemplate(editingId, { name: formName, subject: formSubject, body: formBody })
    } else {
      addTemplate({ name: formName, subject: formSubject, description: '', body: formBody })
    }
    closeModal()
    showToast('保存しました')
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('このテンプレートを削除しますか？')) return
    deleteTemplate(id)
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10">
      <div className="rounded-2xl bg-slate-50/70 sm:bg-slate-50/50 border border-slate-200/60 p-4 sm:p-6 shadow-inner">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">メールテンプレート</h1>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all shadow-md shadow-indigo-500/20 shrink-0"
            >
              <PlusIcon className="w-4 h-4" />
              新規作成
            </button>
          </div>

          {/* テンプレート一覧 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {templates.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 hover:shadow-md transition-shadow"
              >
                <h2 className="text-base font-bold text-gray-900 mb-1">{t.name}</h2>
                <p className="text-xs text-gray-500 mb-3">更新日: {t.updatedAt}</p>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-gray-700">件名: {t.subject}</p>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(t.subject, 'コピーしました')}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 shrink-0"
                    title="件名をコピー"
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                    コピー
                  </button>
                </div>
                <p className="text-sm text-gray-600 mb-3">{t.description}</p>
                <div className="relative rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4">
                  <div className="absolute top-2 right-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(t.body, 'コピーしました')}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                      本文をコピー
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap pr-24">{t.body}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  >
                    <PencilIcon className="w-4 h-4" />
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  >
                    <TrashIcon className="w-4 h-4" />
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 新規作成・編集モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
            aria-hidden
          />
          <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6">
                {editingId ? 'テンプレート編集' : '新規作成'}
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">テンプレート名</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="例: 面接案内メール"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">件名</label>
                  <input
                    type="text"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    placeholder="例: 【AI人事24h】面接のご案内"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">本文</label>
                  <p className="text-xs text-gray-500 mb-2">利用可能な変数（クリックで挿入）</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    rows={10}
                    placeholder="メール本文を入力してください"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!formName.trim() || !formSubject.trim() || !formBody.trim()}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500/30"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

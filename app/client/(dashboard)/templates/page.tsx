'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type EmailTemplate = {
  id: string
  template_type: string
  subject: string
  body: string
  created_at: string
  updated_at: string
}

const VARIABLES = [
  { key: '{applicant_name}', label: '応募者氏名' },
  { key: '{company_name}', label: '企業名' },
  { key: '{interview_date}', label: '面接日時' },
  { key: '{job_type}', label: '希望職種' },
]

const SAMPLE_DATA: Record<string, string> = {
  '{applicant_name}': '山田 太郎',
  '{company_name}': '株式会社サンプル',
  '{interview_date}': '2026年2月20日 14:00',
  '{job_type}': '営業職',
}

function replaceVariables(text: string): string {
  let result = text
  for (const [key, value] of Object.entries(SAMPLE_DATA)) {
    result = result.replaceAll(key, value)
  }
  return result
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [formSubject, setFormSubject] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formType, setFormType] = useState('')
  const [saving, setSaving] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
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
      .from('email_templates')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: true })

    if (data) setTemplates(data)
    setLoading(false)
  }

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template)
    setIsCreating(false)
    setFormSubject(template.subject)
    setFormBody(template.body)
    setFormType(template.template_type)
    setShowPreview(false)
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    setIsCreating(true)
    setFormSubject('')
    setFormBody('')
    setFormType('')
    setShowPreview(false)
  }

  const handleCancel = () => {
    setEditingTemplate(null)
    setIsCreating(false)
    setShowPreview(false)
  }

  const handleSave = async () => {
    if (!companyId || !formSubject.trim() || !formBody.trim() || !formType.trim()) return
    setSaving(true)

    if (isCreating) {
      await supabase.from('email_templates').insert({
        company_id: companyId,
        template_type: formType,
        subject: formSubject,
        body: formBody,
      })
    } else if (editingTemplate) {
      await supabase.from('email_templates').update({
        template_type: formType,
        subject: formSubject,
        body: formBody,
        updated_at: new Date().toISOString(),
      }).eq('id', editingTemplate.id)
    }

    setSaving(false)
    handleCancel()
    fetchTemplates()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除してもよろしいですか？')) return
    await supabase.from('email_templates').delete().eq('id', id)
    fetchTemplates()
  }

  const insertVariable = (variable: string) => {
    setFormBody(prev => prev + variable)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">テンプレートメール設定</h1>
        {!isCreating && !editingTemplate && (
          <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
            新規テンプレート作成
          </button>
        )}
      </div>

      {(isCreating || editingTemplate) ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isCreating ? 'テンプレート新規作成' : 'テンプレート編集'}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">テンプレート名（種別）</label>
              <input
                type="text"
                value={formType}
                onChange={e => setFormType(e.target.value)}
                placeholder="例: 二次面接案内、選考結果通知"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">件名</label>
              <input
                type="text"
                value={formSubject}
                onChange={e => setFormSubject(e.target.value)}
                placeholder="例: 【{company_name}】二次面接のご案内"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">本文</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {VARIABLES.map(v => (
                  <button
                    key={v.key}
                    onClick={() => insertVariable(v.key)}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded border border-gray-300 hover:bg-gray-200"
                  >
                    {v.label}: {v.key}
                  </button>
                ))}
              </div>
              <textarea
                value={formBody}
                onChange={e => setFormBody(e.target.value)}
                rows={10}
                placeholder="テンプレート本文を入力してください。変数（例: {applicant_name}）を使用できます。"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">{formBody.length} 文字</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-md hover:bg-gray-50"
              >
                {showPreview ? 'プレビューを閉じる' : 'プレビュー表示'}
              </button>
            </div>

            {showPreview && (
              <div className="border border-blue-200 bg-blue-50 rounded-md p-4">
                <p className="text-xs text-blue-600 font-medium mb-2">プレビュー（サンプルデータで変数を展開）</p>
                <p className="text-sm font-medium text-gray-900 mb-2">件名: {replaceVariables(formSubject)}</p>
                <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white rounded p-3 border border-blue-100">
                  {replaceVariables(formBody)}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t">
              <button
                onClick={handleSave}
                disabled={saving || !formSubject.trim() || !formBody.trim() || !formType.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={handleCancel} className="px-4 py-2 border border-gray-300 text-sm text-gray-700 rounded-md hover:bg-gray-50">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">読み込み中...</div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 mb-2">テンプレートがまだ登録されていません。</p>
          <p className="text-sm text-gray-400">「新規テンプレート作成」ボタンからテンプレートを追加してください。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-lg shadow p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-800 mb-1">{t.template_type}</span>
                  <h3 className="text-base font-bold text-gray-900">{t.subject}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(t)} className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
                    編集
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50">
                    削除
                  </button>
                </div>
              </div>
              <div className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{t.body}</div>
              <p className="text-xs text-gray-400 mt-2">最終更新: {formatDate(t.updated_at || t.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

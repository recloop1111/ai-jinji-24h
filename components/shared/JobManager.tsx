'use client'

import { useState } from 'react'
import { Plus, Pencil, MessageSquare, Pause, Play, X } from 'lucide-react'

// TODO: 段階4 - Supabase経由でcompanyIdに紐づく求人データを読み書き

type JobStatus = 'active' | 'paused' | 'draft'

type Job = {
  id: string
  jobType: string
  jobTypeOther?: string
  employmentType: string
  status: JobStatus
  createdAt: string
}

const JOB_TYPES = ['営業', '事務', '経理・財務', '人事・総務', '企画・マーケティング', 'エンジニア・技術職', 'デザイナー', '販売・接客', '製造・工場', '物流・配送', '医療・介護', '教育・講師', '飲食・調理', '建設・施工管理', 'カスタマーサポート', 'その他'] as const

const EMPLOYMENT_TYPES = ['正社員', 'アルバイト', '契約社員', 'パート'] as const

const DUMMY_JOBS: Job[] = [
  { id: '1', jobType: '営業', employmentType: '正社員', status: 'active', createdAt: '2025-02-10' },
  { id: '2', jobType: '事務', employmentType: 'アルバイト', status: 'active', createdAt: '2025-02-12' },
  { id: '3', jobType: 'エンジニア・技術職', employmentType: '正社員', status: 'draft', createdAt: '2025-02-14' },
]

function getStatusBadge(status: JobStatus, theme: 'light' | 'dark'): { label: string; className: string } {
  if (theme === 'dark') {
    const map: Record<JobStatus, { label: string; className: string }> = {
      active: { label: '募集中', className: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
      paused: { label: '募集停止', className: 'bg-gray-500/20 text-gray-400 border border-gray-500/30' },
      draft: { label: '下書き', className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
    }
    return map[status]
  }
  const map: Record<JobStatus, { label: string; className: string }> = {
    active: { label: '募集中', className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
    paused: { label: '募集停止', className: 'bg-slate-100 text-slate-600 border border-slate-200' },
    draft: { label: '下書き', className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  }
  return map[status]
}

type JobManagerProps = {
  companyId: string
  theme: 'light' | 'dark'
}

export default function JobManager({ companyId, theme }: JobManagerProps) {
  const [jobs, setJobs] = useState<Job[]>(DUMMY_JOBS)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    jobType: '',
    jobTypeOther: '',
    employmentType: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const isDark = theme === 'dark'

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }

  const openCreateModal = () => {
    setForm({
      jobType: '',
      jobTypeOther: '',
      employmentType: '',
    })
    setFormErrors({})
    setCreateModalOpen(true)
  }

  const setFormField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const handleCreateJob = () => {
    const err: Record<string, string> = {}
    if (!form.jobType) err.jobType = '職種を選択してください'
    if (form.jobType === 'その他' && !form.jobTypeOther.trim()) err.jobTypeOther = '職種名を入力してください'
    if (!form.employmentType) err.employmentType = '雇用形態を選択してください'
    setFormErrors(err)
    if (Object.keys(err).length > 0) return

    const newJob: Job = {
      id: `job-${Date.now()}`,
      jobType: form.jobType === 'その他' ? form.jobTypeOther.trim() : form.jobType,
      jobTypeOther: form.jobType === 'その他' ? form.jobTypeOther.trim() : undefined,
      employmentType: form.employmentType,
      status: 'draft',
      createdAt: new Date().toISOString().split('T')[0],
    }
    setJobs((prev) => [...prev, newJob])
    setCreateModalOpen(false)
    showToast('求人を作成しました。質問設定を行ってください。')
  }

  const handleToggleStatus = (id: string) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== id) return j
        if (j.status === 'active') return { ...j, status: 'paused' as JobStatus }
        if (j.status === 'paused') return { ...j, status: 'active' as JobStatus }
        return j
      })
    )
    const job = jobs.find((j) => j.id === id)
    if (job?.status === 'active') {
      showToast('募集を停止しました')
    } else if (job?.status === 'paused') {
      showToast('募集を再開しました')
    }
  }

  const cn = {
    title: isDark ? 'text-white' : 'text-slate-900',
    subtext: isDark ? 'text-gray-400' : 'text-slate-500',
    card: isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200',
    cardHover: isDark ? 'hover:shadow-lg' : 'hover:shadow-md',
    btnPrimary: isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#6366f1] hover:bg-[#5855eb]',
    btnSecondary: isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    btnQuestion: isDark ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700',
    btnPause: isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400' : 'bg-amber-50 hover:bg-amber-100 text-amber-700',
    btnPlay: isDark ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
    emptyText: isDark ? 'text-gray-400' : 'text-slate-600',
    emptySubtext: isDark ? 'text-gray-500' : 'text-slate-500',
    modal: isDark ? 'bg-gray-800 border-gray-700' : 'bg-white',
    modalTitle: isDark ? 'text-white' : 'text-slate-900',
    modalClose: isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
    label: isDark ? 'text-gray-400' : 'text-slate-700',
    select: isDark ? 'bg-gray-900 border-gray-700 text-white focus:ring-blue-500' : 'border-slate-200 text-slate-900 focus:ring-indigo-500',
    input: isDark ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:ring-blue-500' : 'border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-indigo-500',
    cancel: isDark ? 'text-gray-400 bg-gray-700 hover:bg-gray-600' : 'text-slate-600 bg-slate-100 hover:bg-slate-200',
  }

  return (
    <div className="min-w-0 max-w-[100vw] pb-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${cn.title}`}>求人管理</h1>
          <p className={`text-sm mt-1 ${cn.subtext}`}>募集中の求人を管理します。求人ごとに面接の質問を設定できます。</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className={`inline-flex items-center gap-2 ${cn.btnPrimary} text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-all duration-200 shrink-0 shadow-sm`}
        >
          <Plus className="w-4 h-4" />
          新規求人を作成
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className={`rounded-xl border p-12 text-center ${cn.card}`}>
          <p className={`mb-4 ${cn.emptyText}`}>まだ求人が登録されていません。</p>
          <p className={`text-sm ${cn.emptySubtext}`}>「新規求人を作成」ボタンから最初の求人を登録しましょう。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => {
            const statusBadge = getStatusBadge(job.status, theme)
            return (
              <div key={job.id} className={`rounded-xl border p-5 transition-shadow ${cn.card} ${cn.cardHover}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-lg font-semibold mb-1 truncate ${cn.title}`}>{job.jobType} × {job.employmentType}</h3>
                    {job.employmentType === '正社員' && (
                      <p className={`text-xs mt-1 ${cn.subtext}`}>新卒・中途の2パターンの質問が設定されます</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </div>
                <div className={`text-xs mb-4 ${cn.subtext}`}>作成日: {job.createdAt}</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => showToast('編集機能は今後実装予定です')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${cn.btnSecondary}`}
                  >
                    <Pencil className="w-4 h-4" />
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => showToast('質問設定ページに遷移します')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${cn.btnQuestion}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    質問設定
                  </button>
                  {job.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(job.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${cn.btnPause}`}
                    >
                      <Pause className="w-4 h-4" />
                      募集停止
                    </button>
                  ) : job.status === 'paused' ? (
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(job.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${cn.btnPlay}`}
                    >
                      <Play className="w-4 h-4" />
                      再開
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={(e) => e.target === e.currentTarget && (setCreateModalOpen(false), setFormErrors({}))}>
          <div className={`rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border ${cn.modal}`} onClick={(e) => e.stopPropagation()}>
            <div className={`sticky top-0 border-b px-6 py-4 flex items-center justify-between rounded-t-2xl ${cn.modal} ${isDark ? 'border-gray-700' : 'border-slate-200'}`}>
              <h2 className={`text-lg font-bold ${cn.modalTitle}`}>新規求人を作成</h2>
              <button type="button" onClick={() => (setCreateModalOpen(false), setFormErrors({}))} className={`p-2 rounded-lg transition-colors ${cn.modalClose}`} aria-label="閉じる">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreateJob() }} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${cn.label}`}>職種 <span className="text-red-500">*</span></label>
                  <select value={form.jobType} onChange={(e) => setFormField('jobType', e.target.value)} className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.select}`}>
                    <option value="">選択してください</option>
                    {JOB_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {formErrors.jobType && <p className="mt-1 text-xs text-red-500">{formErrors.jobType}</p>}
                  {form.jobType === 'その他' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={form.jobTypeOther}
                        onChange={(e) => setFormField('jobTypeOther', e.target.value)}
                        placeholder="職種名を入力してください"
                        className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.input}`}
                      />
                      {formErrors.jobTypeOther && <p className="mt-1 text-xs text-red-500">{formErrors.jobTypeOther}</p>}
                    </div>
                  )}
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${cn.label}`}>雇用形態 <span className="text-red-500">*</span></label>
                  <select value={form.employmentType} onChange={(e) => setFormField('employmentType', e.target.value)} className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.select}`}>
                    <option value="">選択してください</option>
                    {EMPLOYMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {formErrors.employmentType && <p className="mt-1 text-xs text-red-500">{formErrors.employmentType}</p>}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => (setCreateModalOpen(false), setFormErrors({}))} className={`px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${cn.cancel}`}>
                  キャンセル
                </button>
                <button type="submit" className={`px-5 py-2.5 text-sm font-medium text-white rounded-xl transition-colors ${cn.btnPrimary}`}>
                  登録する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

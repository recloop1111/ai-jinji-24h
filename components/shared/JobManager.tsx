'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Pencil, MessageSquare, Pause, Play, X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type JobStatus = 'active' | 'paused' | 'draft'

type Job = {
  id: string
  jobType: string
  employmentType: string
  employmentTypeLabel: string
  description?: string
  status: JobStatus
  createdAt: string
  applicantCount: number
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  fulltime: '正社員',
  contract: '契約社員',
  temporary: '派遣社員',
  parttime: 'パート・アルバイト',
  freelance: '業務委託',
  intern: 'インターン',
  other: 'その他',
}

const EMPLOYMENT_TYPES = ['正社員', '契約社員', '派遣社員', 'パート・アルバイト', '業務委託', 'インターン', 'その他'] as const

const EMPLOYMENT_TYPE_TO_DB: Record<string, string> = {
  正社員: 'fulltime',
  契約社員: 'contract',
  派遣社員: 'temporary',
  'パート・アルバイト': 'parttime',
  業務委託: 'freelance',
  インターン: 'intern',
  その他: 'other',
}

const EMPLOYMENT_TYPE_FROM_DB: Record<string, string> = {
  fulltime: '正社員',
  contract: '契約社員',
  temporary: '派遣社員',
  parttime: 'パート・アルバイト',
  freelance: '業務委託',
  intern: 'インターン',
  other: 'その他',
}

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

const CURRENT_COMPANY_ID = '7a58cc1b-9f81-4da5-ae2c-fd3abea05c33' // TODO: 認証実装後に動的取得に変更

export default function JobManager({ companyId, theme }: JobManagerProps) {
  const supabase = createClient()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editEmploymentType, setEditEmploymentType] = useState('')
  const [editEmploymentTypeOther, setEditEmploymentTypeOther] = useState('')
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({
    jobType: '',
    employmentType: '',
    employmentTypeOther: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const isDark = theme === 'dark'
  const resolvedCompanyId = companyId === 'current' ? CURRENT_COMPANY_ID : companyId

  useEffect(() => {
    fetchJobs()
  }, [resolvedCompanyId])

  async function fetchJobs() {
    if (!resolvedCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: jobsData, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('company_id', resolvedCompanyId)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (jobsData && jobsData.length > 0) {
        const jobIds = jobsData.map((j) => j.id)
        const countMap: Record<string, number> = {}
        jobIds.forEach((id) => { countMap[id] = 0 })
        try {
          const { data: countsData } = await supabase
            .from('applicants')
            .select('job_id')
            .in('job_id', jobIds)
          countsData?.forEach((a) => {
            if (a.job_id && countMap[a.job_id] !== undefined) {
              countMap[a.job_id] = (countMap[a.job_id] || 0) + 1
            }
          })
        } catch {
          // job_idカラムがない場合等はスキップ
        }

        setJobs(
          jobsData.map((j) => {
            const empType = j.employment_type || ''
            const label = empType === 'other' && j.description
              ? j.description
              : (EMPLOYMENT_TYPE_LABELS[empType] ?? empType)
            return {
            id: j.id,
            jobType: j.title || '',
            employmentType: empType,
            employmentTypeLabel: label,
            description: j.description,
            status: (j.is_active === true ? 'active' : 'paused') as JobStatus,
            createdAt: j.created_at ? new Date(j.created_at).toISOString().split('T')[0] : '',
            applicantCount: countMap[j.id] ?? 0,
          }
          })
        )
      } else {
        setJobs([])
      }
    } catch (err) {
      console.error('求人取得エラー:', err)
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2500)
  }

  const openCreateModal = () => {
    setForm({
      jobType: '',
      employmentType: '',
      employmentTypeOther: '',
    })
    setFormErrors({})
    setCreateModalOpen(true)
  }

  const openEditModal = (job: Job) => {
    setEditingJobId(job.id)
    setEditTitle(job.jobType)
    setEditEmploymentType(job.employmentType === 'other' ? 'その他' : EMPLOYMENT_TYPE_FROM_DB[job.employmentType] || '')
    setEditEmploymentTypeOther(job.employmentType === 'other' ? (job.description || '') : '')
    setEditErrors({})
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingJobId(null)
    setEditTitle('')
    setEditEmploymentType('')
    setEditEmploymentTypeOther('')
    setEditErrors({})
  }

  const setFormField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (formErrors[key as string]) setFormErrors((prev) => ({ ...prev, [key]: '' }))
  }

  async function handleCreateJob() {
    const err: Record<string, string> = {}
    if (!form.jobType.trim()) err.jobType = '職種を入力してください'
    if (!form.employmentType) err.employmentType = '雇用形態を選択してください'
    if (form.employmentType === 'その他' && !form.employmentTypeOther.trim()) err.employmentTypeOther = '雇用形態を入力してください'
    setFormErrors(err)
    if (Object.keys(err).length > 0) return

    const title = form.jobType.trim()
    const employmentTypeDb = EMPLOYMENT_TYPE_TO_DB[form.employmentType] || form.employmentType
    const payload: Record<string, unknown> = {
      company_id: resolvedCompanyId,
      title,
      employment_type: employmentTypeDb,
      experience_type: 'none',
      pattern_key: `${employmentTypeDb}-default`,
      is_active: false,
    }
    if (employmentTypeDb === 'other') {
      payload.description = form.employmentTypeOther.trim()
    }

    try {
      const { data, error } = await supabase
        .from('jobs')
        .insert(payload)
        .select()
        .single()

      if (error) throw error
      setCreateModalOpen(false)
      showToast('求人を作成しました。質問設定を行ってください。')
      fetchJobs()
    } catch (err) {
      console.error('求人作成エラー:', err)
      showToast('求人の作成に失敗しました。')
    }
  }

  async function handleSaveEdit() {
    if (!editingJobId) return
    const err: Record<string, string> = {}
    const title = editTitle.trim()
    if (!title) err.jobType = '職種を入力してください'
    if (!editEmploymentType) err.employmentType = '雇用形態を選択してください'
    if (editEmploymentType === 'その他' && !editEmploymentTypeOther.trim()) err.employmentTypeOther = '雇用形態を入力してください'
    setEditErrors(err)
    if (Object.keys(err).length > 0) return

    const employmentTypeDb = EMPLOYMENT_TYPE_TO_DB[editEmploymentType] || editEmploymentType
    const updatePayload: Record<string, unknown> = {
      title,
      employment_type: employmentTypeDb,
    }
    if (employmentTypeDb === 'other') {
      updatePayload.description = editEmploymentTypeOther.trim()
    } else {
      updatePayload.description = null
    }

    try {
      const { error } = await supabase
        .from('jobs')
        .update(updatePayload)
        .eq('id', editingJobId)

      if (error) throw error
      closeEditModal()
      showToast('求人を更新しました。')
      fetchJobs()
    } catch (err) {
      console.error('求人更新エラー:', err)
      showToast('求人の更新に失敗しました。')
    }
  }

  async function handleToggleStatus(id: string) {
    const job = jobs.find((j) => j.id === id)
    if (!job) return
    const newIsActive = job.status === 'active' ? false : true

    try {
      const { error } = await supabase
        .from('jobs')
        .update({ is_active: newIsActive })
        .eq('id', id)

      if (error) throw error
      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== id) return j
          return { ...j, status: (newIsActive ? 'active' : 'paused') as JobStatus }
        })
      )
      showToast(newIsActive ? '募集を再開しました' : '募集を停止しました')
    } catch (err) {
      console.error('ステータス変更エラー:', err)
      showToast('ステータスの変更に失敗しました。')
    }
  }

  async function handleDeleteJob(jobId: string) {
    if (!confirm('この求人を削除しますか？関連する質問データも削除されます。')) return
    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobId)
      if (error) throw error
      showToast('求人を削除しました')
      fetchJobs()
    } catch (err) {
      console.error('求人削除エラー:', err)
      showToast('求人の削除に失敗しました')
    }
  }

  const cn = {
    title: isDark ? 'text-white' : 'text-slate-900',
    subtext: isDark ? 'text-gray-400' : 'text-slate-500',
    card: isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200',
    cardHover: isDark ? 'hover:shadow-lg' : 'hover:shadow-md',
    btnPrimary: isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700',
    btnSecondary: isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    btnQuestion: isDark ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400' : 'bg-blue-50 hover:bg-blue-100 text-blue-700',
    btnPause: isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400' : 'bg-amber-50 hover:bg-amber-100 text-amber-700',
    btnPlay: isDark ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
    btnDelete: isDark ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-700',
    emptyText: isDark ? 'text-gray-400' : 'text-slate-600',
    emptySubtext: isDark ? 'text-gray-500' : 'text-slate-500',
    modal: isDark ? 'bg-gray-800 border-gray-700' : 'bg-white',
    modalTitle: isDark ? 'text-white' : 'text-slate-900',
    modalClose: isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
    label: isDark ? 'text-gray-400' : 'text-slate-700',
    select: isDark ? 'bg-gray-900 border-gray-700 text-white focus:ring-blue-500' : 'border-slate-200 text-slate-900 focus:ring-blue-500',
    input: isDark ? 'bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:ring-blue-500' : 'border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-blue-500',
    cancel: isDark ? 'text-gray-400 bg-gray-700 hover:bg-gray-600' : 'text-slate-600 bg-slate-100 hover:bg-slate-200',
  }

  if (loading) {
    return (
      <div className="min-w-0 max-w-[100vw] pb-10 flex items-center justify-center py-16">
        <svg
          className={`animate-spin h-10 w-10 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    )
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
                    <h3 className={`text-lg font-semibold mb-1 truncate ${cn.title}`}>{job.jobType} × {job.employmentTypeLabel}</h3>
                    {job.employmentType === 'fulltime' && (
                      <p className={`text-xs mt-1 ${cn.subtext}`}>新卒・中途の2パターンの質問が設定されます</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </div>
                <div className={`text-xs mb-4 ${cn.subtext}`}>
                  作成日: {job.createdAt}
                  {job.applicantCount !== undefined && job.applicantCount > 0 && (
                    <span className="ml-2">応募者: {job.applicantCount}名</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(job)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${cn.btnSecondary}`}
                  >
                    <Pencil className="w-4 h-4" />
                    編集
                  </button>
                  <Link
                    href={`/client/questions?jobId=${job.id}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${cn.btnQuestion}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    質問設定
                  </Link>
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
                  <button
                    type="button"
                    onClick={() => handleDeleteJob(job.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${cn.btnDelete}`}
                  >
                    <Trash2 className="w-4 h-4" />
                    削除
                  </button>
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
                  <input
                    type="text"
                    value={form.jobType}
                    onChange={(e) => setFormField('jobType', e.target.value)}
                    placeholder="例：営業、エンジニア、ホールスタッフ"
                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.input}`}
                  />
                  {formErrors.jobType && <p className="mt-1 text-xs text-red-500">{formErrors.jobType}</p>}
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
                  {form.employmentType === 'その他' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={form.employmentTypeOther}
                        onChange={(e) => setFormField('employmentTypeOther', e.target.value)}
                        placeholder="雇用形態を入力してください"
                        className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.input}`}
                      />
                      {formErrors.employmentTypeOther && <p className="mt-1 text-xs text-red-500">{formErrors.employmentTypeOther}</p>}
                    </div>
                  )}
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

      {editModalOpen && editingJobId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={(e) => e.target === e.currentTarget && closeEditModal()}>
          <div className={`rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border ${cn.modal}`} onClick={(e) => e.stopPropagation()}>
            <div className={`sticky top-0 border-b px-6 py-4 flex items-center justify-between rounded-t-2xl ${cn.modal} ${isDark ? 'border-gray-700' : 'border-slate-200'}`}>
              <h2 className={`text-lg font-bold ${cn.modalTitle}`}>求人を編集</h2>
              <button type="button" onClick={closeEditModal} className={`p-2 rounded-lg transition-colors ${cn.modalClose}`} aria-label="閉じる">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit() }} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${cn.label}`}>職種 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => { setEditTitle(e.target.value); setEditErrors({}); }}
                    placeholder="例：営業、エンジニア、ホールスタッフ"
                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.input}`}
                  />
                  {editErrors.jobType && <p className="mt-1 text-xs text-red-500">{editErrors.jobType}</p>}
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${cn.label}`}>雇用形態 <span className="text-red-500">*</span></label>
                  <select
                    value={editEmploymentType}
                    onChange={(e) => {
                      setEditEmploymentType(e.target.value)
                      if (e.target.value !== 'その他') setEditEmploymentTypeOther('')
                      setEditErrors({})
                    }}
                    className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.select}`}
                  >
                    <option value="">選択してください</option>
                    {EMPLOYMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {editErrors.employmentType && <p className="mt-1 text-xs text-red-500">{editErrors.employmentType}</p>}
                  {editEmploymentType === 'その他' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={editEmploymentTypeOther}
                        onChange={(e) => { setEditEmploymentTypeOther(e.target.value); setEditErrors({}); }}
                        placeholder="雇用形態を入力してください"
                        className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${cn.input}`}
                      />
                      {editErrors.employmentTypeOther && <p className="mt-1 text-xs text-red-500">{editErrors.employmentTypeOther}</p>}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={closeEditModal} className={`px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${cn.cancel}`}>
                  キャンセル
                </button>
                <button type="submit" className={`px-5 py-2.5 text-sm font-medium text-white rounded-xl transition-colors ${cn.btnPrimary}`}>
                  保存する
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

'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Link as LinkIcon, User, Info, X } from 'lucide-react'
import JobManager from '@/components/shared/JobManager'
import QuestionEditor from '@/components/shared/QuestionEditor'

const CARD_BASE = 'bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]'

const EVALUATION_AXES = [
  { name: 'コミュニケーション力', weight: 20 },
  { name: '論理的思考力', weight: 20 },
  { name: '業界適性・経験値', weight: 15 },
  { name: '主体性・意欲', weight: 20 },
  { name: '組織適合性（チームフィット）', weight: 15 },
  { name: 'ストレス耐性', weight: 10 },
]

const TABS = ['基本情報', 'ブランド設定', 'アバター設定', '質問設定', '評価設定', '求人管理', '利用状況', 'セキュリティ'] as const

export default function CompanyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const companyId = params.id as string
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('基本情報')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // モーダル state
  const [stopModalOpen, setStopModalOpen] = useState(false)
  const [resumeModalOpen, setResumeModalOpen] = useState(false)
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [newLimitStr, setNewLimitStr] = useState('20')
  const [limitSaving, setLimitSaving] = useState(false)
  const [monthlyUsedCount, setMonthlyUsedCount] = useState(0)
  const [adminPassword, setAdminPassword] = useState('')
  const [limitError, setLimitError] = useState('')
  const [showAdminPassword, setShowAdminPassword] = useState(false)

  // 企業情報編集 state
  const [editName, setEditName] = useState('')
  const [editContactName, setEditContactName] = useState('')
  const [editContactEmail, setEditContactEmail] = useState('')
  const [editContactPhone, setEditContactPhone] = useState('')
  const [editIndustry, setEditIndustry] = useState('')

  // ブランド設定 state
  const [displayName, setDisplayName] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [completeMessage, setCompleteMessage] = useState('本日は面接にご参加いただき、誠にありがとうございました。選考結果は1週間以内にメールにてご連絡いたします。')
  const logoInputRef = useRef<HTMLInputElement>(null)

  // アバター設定 state
  const [avatarName, setAvatarName] = useState('採用担当のさくら')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarFileRef = useRef<HTMLInputElement>(null)
  const [voiceType, setVoiceType] = useState<'alloy' | 'nova' | 'echo'>('alloy')
  const [toneTemplate, setToneTemplate] = useState('です・ます調（丁寧）')

  // 評価設定 state
  const [axes, setAxes] = useState(EVALUATION_AXES.map((a) => ({ ...a })))
  const totalWeight = axes.reduce((sum, a) => sum + a.weight, 0)

  useEffect(() => {
    async function fetchCompany() {
      try {
        const res = await fetch(`/api/admin/companies/${companyId}`)
        const json = await res.json()
        if (res.ok && json.company) {
          const data = json.company
          setCompany(data)
          setDisplayName(data.name || '')
          setLogoPreview(data.logo_url || null)
          setMonthlyUsedCount(data.monthly_interview_count_actual ?? data.monthly_interview_count ?? 0)
        }
      } catch {
        // fetch failed
      }
      setLoading(false)
    }
    if (companyId) {
      setLoading(true)
      fetchCompany()
    }
  }, [companyId, refreshTrigger])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const interviewUrl = company?.interview_slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/interview/${company.interview_slug}`
    : ''

  const copyInterviewUrl = async () => {
    if (!interviewUrl) {
      showToast('面接URLが設定されていません')
      return
    }
    try {
      await navigator.clipboard.writeText(interviewUrl)
      showToast('面接URLをコピーしました')
    } catch {
      showToast('コピーに失敗しました')
    }
  }

  const openEditModal = () => {
    setEditName(company?.name || '')
    setEditContactName(company?.contact_person || '')
    setEditContactEmail(company?.contact_email || company?.email || '')
    setEditContactPhone(company?.phone || '')
    setEditIndustry(company?.industry || '')
    setEditModalOpen(true)
  }

  async function patchCompany(updates: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        return { ok: false, error: json?.error?.message || '更新に失敗しました' }
      }
      return { ok: true }
    } catch {
      return { ok: false, error: '通信エラーが発生しました' }
    }
  }

  async function saveCompanyInfo() {
    const result = await patchCompany({
      name: editName,
      contact_person: editContactName,
      contact_email: editContactEmail,
      phone: editContactPhone,
      industry: editIndustry,
    })
    if (!result.ok) {
      showToast(result.error || '保存に失敗しました')
      return
    }
    setEditModalOpen(false)
    showToast('企業情報を保存しました')
    setRefreshTrigger((t) => t + 1)
  }

  async function saveLimitChange() {
    const parsedLimit = parseInt(newLimitStr, 10)
    if (isNaN(parsedLimit) || parsedLimit < 5) {
      setLimitError('月間上限は5件以上の数値を入力してください')
      return
    }
    if (parsedLimit < monthlyUsedCount) {
      setLimitError(`当月利用人数（${monthlyUsedCount}件）未満には設定できません`)
      return
    }
    if (!adminPassword) {
      setLimitError('管理者パスワードを入力してください')
      return
    }
    setLimitError('')
    setLimitSaving(true)
    try {
      const res = await fetch(`/api/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthly_interview_limit: parsedLimit, adminPassword }),
      })
      const json = await res.json()
      setLimitSaving(false)
      if (!res.ok) {
        setLimitError(json.error?.message || '更新に失敗しました')
        return
      }
      setLimitModalOpen(false)
      setAdminPassword('')
      setLimitError('')
      showToast('月間上限を変更しました')
      setRefreshTrigger((t) => t + 1)
    } catch {
      setLimitSaving(false)
      setLimitError('通信エラーが発生しました')
    }
  }

  async function saveBrandSettings() {
    const result = await patchCompany({ name: displayName, logo_url: logoPreview })
    showToast(result.ok ? 'ブランド設定を保存しました' : (result.error || '保存に失敗しました'))
    if (result.ok) setRefreshTrigger((t) => t + 1)
  }

  async function handleStopContract() {
    const result = await patchCompany({ is_suspended: true, status: 'suspended' })
    if (result.ok) {
      setStopModalOpen(false)
      showToast('契約を停止しました')
      setRefreshTrigger((t) => t + 1)
    } else {
      showToast(result.error || '停止に失敗しました')
    }
  }

  async function handleResumeContract() {
    const result = await patchCompany({ is_suspended: false, status: 'active' })
    if (result.ok) {
      setResumeModalOpen(false)
      showToast('契約を再開しました')
      setRefreshTrigger((t) => t + 1)
    } else {
      showToast(result.error || '再開に失敗しました')
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setLogoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function saveAvatarSettings() {
    const result = await patchCompany({ avatar_url: avatarPreview })
    showToast(result.ok ? 'アバター設定を保存しました' : (result.error || '保存に失敗しました'))
  }

  async function deleteAvatarImage() {
    const result = await patchCompany({ avatar_url: null })
    if (result.ok) {
      setAvatarPreview(null)
      showToast('アバター画像を削除しました')
    } else {
      showToast(result.error || '削除に失敗しました')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const statusType = company?.is_suspended ? 'suspended' : company?.status === 'suspended' ? 'suspended' : company?.is_active === false ? 'cancelled' : 'active'
  const statusConfig = {
    active: { label: 'アクティブ', className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' },
    suspended: { label: '停止中', className: 'bg-red-500/15 text-red-400 border border-red-500/20' },
    cancelled: { label: '解約済み', className: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' },
  }[statusType] ?? { label: statusType, className: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`,
        }}
      />
      <div className="space-y-6">
        {/* ヘッダー部 */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push('/admin/companies')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white cursor-pointer transition-colors mb-2"
            >
              <ArrowLeft className="w-4 h-4" />
              企業一覧に戻る
            </button>
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-2xl font-bold text-white">{company?.name || '読み込み中...'}</h1>
              <span className={`inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs ${statusConfig.className}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusType === 'active' ? 'bg-emerald-400' : statusType === 'suspended' ? 'bg-red-400' : 'bg-gray-500'}`} />
                {statusConfig.label}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={copyInterviewUrl}
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-sm rounded-xl px-4 py-2.5 transition-all shrink-0"
          >
            <LinkIcon className="w-4 h-4" />
            面接URLをコピー
          </button>
        </div>

        {/* タブ */}
        <div className="flex gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.06] overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300 rounded-lg cursor-pointer'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* タブ1: 基本情報 */}
        {activeTab === '基本情報' && (
          <div className={`${CARD_BASE} p-6`}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 mb-8">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">企業名</label>
                <p className="text-sm text-white mt-1">{company?.name || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者名</label>
                <p className="text-sm text-white mt-1">{company?.contact_person || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者メール</label>
                <p className="text-sm text-white mt-1">{company?.contact_email || company?.email || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者電話</label>
                <p className="text-sm text-white mt-1">{company?.phone || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">業種</label>
                <p className="text-sm text-white mt-1">{company?.industry || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">契約プラン</label>
                <p className="text-sm text-white mt-1">
                  {company?.plan === 'custom' ? 'カスタム' : '従量課金'}
                  <span className="text-xs text-gray-400 ml-2">¥4,000 / 面接・人（税別）</span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">月間面接上限</label>
                <p className="text-sm text-white mt-1">{company?.monthly_interview_limit ?? 0}件</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">当月利用人数</label>
                <p className="text-sm text-white mt-1">{monthlyUsedCount}件</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</label>
                <p className="text-sm mt-1">
                  <span className={`inline-flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs ${statusConfig.className}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusType === 'active' ? 'bg-emerald-400' : statusType === 'suspended' ? 'bg-red-400' : 'bg-gray-500'}`} />
                    {statusConfig.label}
                  </span>
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">面接URL</label>
                <button type="button" onClick={copyInterviewUrl} className="block text-sm text-blue-400 hover:text-blue-300 mt-1 break-all text-left">
                  {interviewUrl || '未設定'}
                </button>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">作成日</label>
                <p className="text-sm text-white mt-1">{company?.created_at ? new Date(company.created_at).toLocaleDateString('ja-JP') : '未設定'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { setNewLimitStr(String(company?.monthly_interview_limit ?? 20)); setAdminPassword(''); setLimitError(''); setShowAdminPassword(false); setLimitModalOpen(true) }}
                className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 border border-blue-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                上限人数を変更
              </button>
              {statusType === 'active' ? (
                <button
                  type="button"
                  onClick={() => setStopModalOpen(true)}
                  className="bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
                >
                  契約停止
                </button>
              ) : statusType === 'suspended' ? (
                <button
                  type="button"
                  onClick={() => setResumeModalOpen(true)}
                  className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 border border-emerald-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
                >
                  停止を解除する
                </button>
              ) : null}
              <button
                type="button"
                onClick={openEditModal}
                className="bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                企業情報編集
              </button>
            </div>
          </div>
        )}

        {/* タブ2: ブランド設定 */}
        {activeTab === 'ブランド設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <div className="flex flex-col lg:flex-row lg:gap-8">
              <div className="flex-1 space-y-6">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">応募者画面に表示する企業名</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-full max-w-md focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">応募者の面接画面に表示される企業名です</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">企業ロゴ画像</label>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="w-20 h-20 bg-white/[0.05] border border-white/[0.08] rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white/30 text-xs">{displayName?.slice(0, 2) || company?.name?.slice(0, 2) || '—'}</span>
                      )}
                    </div>
                    <div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl px-4 py-2 text-sm"
                        >
                          画像をアップロード
                        </button>
                        {logoPreview && (
                          <button
                            type="button"
                            onClick={async () => {
                              const result = await patchCompany({ logo_url: null })
                              if (result.ok) {
                                setLogoPreview(null)
                                showToast('ロゴ画像を削除しました')
                              } else {
                                showToast(result.error || '削除に失敗しました')
                              }
                            }}
                            className="text-red-400 text-xs cursor-pointer hover:text-red-300"
                          >
                            削除
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">推奨サイズ: 200x200px、PNG/JPG</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">面接完了後に表示するメッセージ</label>
                  <textarea
                    rows={4}
                    value={completeMessage}
                    onChange={(e) => setCompleteMessage(e.target.value)}
                    className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-3 text-sm w-full max-w-lg focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveBrandSettings}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                >
                  保存する
                </button>
              </div>
              <div className="lg:w-96 shrink-0 mt-8 lg:mt-0">
                <p className="text-sm text-gray-400 mb-3">プレビュー（応募者に表示される画面）</p>
                <div className="bg-white rounded-2xl shadow-lg p-0 w-full max-w-sm mx-auto overflow-hidden">
                  {/* ヘッダー */}
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 py-4 px-6 text-center">
                    <div className="flex flex-col items-center">
                      {logoPreview ? (
                        <img src={logoPreview} alt="Logo" className="w-12 h-12 rounded object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                          {(displayName || company?.name || '企')?.slice(0, 1)}
                        </div>
                      )}
                      <p className="text-gray-800 font-bold text-sm mt-2">{displayName || company?.name || '企業名'}</p>
                    </div>
                  </div>
                  {/* 本文エリア */}
                  <div className="p-6">
                    <p className="text-gray-900 font-bold text-base text-center">ご参加ありがとうございます！</p>
                    <p className="text-gray-500 text-xs text-center mt-1">AI面接官が質問します。リラックスしてお話しください。</p>
                    <p className="text-gray-800 font-semibold text-sm mt-4">面接の流れ</p>
                    <div className="mt-3 space-y-2">
                      {[
                        { step: 1, text: '基本情報の入力' },
                        { step: 2, text: '本人確認' },
                        { step: 3, text: 'カメラ・マイクの確認' },
                        { step: 4, text: '面接練習（約3分）' },
                        { step: 5, text: 'AI面接（最大60分）' },
                      ].map((item) => (
                        <div key={item.step} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {item.step}
                          </div>
                          <span className="text-xs text-gray-600">STEP {item.step}: {item.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <div className="w-4 h-4 border border-gray-300 rounded" />
                      <span className="text-xs text-gray-500">利用規約・プライバシーポリシーに同意する</span>
                    </div>
                    <button type="button" className="w-full bg-gradient-to-r from-blue-400 to-purple-400 text-white rounded-full py-2 text-sm font-medium mt-4">
                      面接を始める
                    </button>
                    <p className="text-blue-500 text-xs text-center mt-2 cursor-pointer">お困りの方はこちら</p>
                  </div>
                </div>
                {/* 完了画面プレビュー */}
                <div className="mt-4">
                  <p className="text-gray-400 text-xs mb-1">完了画面プレビュー</p>
                  <div className="bg-white rounded-lg p-4">
                    <p className="text-gray-700 text-xs whitespace-pre-wrap">{completeMessage || '（完了メッセージ未設定）'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* タブ3: アバター設定 */}
        {activeTab === 'アバター設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <div className="flex flex-col lg:flex-row lg:gap-8">
              <div className="flex-1 space-y-6 max-w-2xl">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">面接官の表示名</label>
                  <input
                    type="text"
                    value={avatarName}
                    onChange={(e) => setAvatarName(e.target.value)}
                    className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-full max-w-md focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">面接中にこの名前で自己紹介します</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">アバター画像</label>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 text-gray-500" />
                      )}
                    </div>
                    <div>
                      <input
                        ref={avatarFileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => avatarFileRef.current?.click()}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl px-4 py-2 text-sm"
                        >
                          画像をアップロード
                        </button>
                        {avatarPreview && (
                          <button
                            type="button"
                            onClick={deleteAvatarImage}
                            className="text-red-400 text-xs cursor-pointer hover:text-red-300"
                          >
                            削除
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">推奨サイズ: 256x256px、PNG/JPG/WebP</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">音声タイプ</label>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {(['alloy', 'nova', 'echo'] as const).map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setVoiceType(v)}
                          className={`rounded-xl p-3 cursor-pointer border transition-colors ${
                            voiceType === v ? 'border-blue-500/50 bg-blue-500/10' : 'bg-white/[0.05] border-white/[0.08] hover:border-white/15'
                          }`}
                        >
                          <span className="text-sm text-white block">{v}</span>
                          <span className="text-xs text-gray-500 block mt-0.5">
                            {v === 'alloy' && '落ち着いた女性の声'}
                            {v === 'nova' && '明るい女性の声'}
                            {v === 'echo' && '落ち着いた男性の声'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => alert('音声サンプルはAPI接続後に再生可能になります')}
                          className="text-blue-400 hover:text-blue-300 text-lg"
                          title="サンプル再生"
                        >
                          ▶
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">※API接続後にサンプル再生が有効になります</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">口調テンプレート</label>
                  <select
                    value={toneTemplate}
                    onChange={(e) => setToneTemplate(e.target.value)}
                    className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-full max-w-md focus:border-blue-500/50 outline-none"
                  >
                    <option value="です・ます調（丁寧）">です・ます調（丁寧）</option>
                    <option value="フレンドリー">フレンドリー</option>
                    <option value="ビジネスフォーマル">ビジネスフォーマル</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">面接官の話し方のトーンを設定します</p>
                </div>
                <button
                  type="button"
                  onClick={saveAvatarSettings}
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                >
                  保存する
                </button>
              </div>
              {/* 面接画面プレビュー */}
              <div className="lg:w-96 shrink-0 mt-8 lg:mt-0">
                <p className="text-sm text-gray-400 mb-3">プレビュー（面接中の画面イメージ）</p>
                <div className="bg-gray-900 rounded-2xl overflow-hidden w-full max-w-sm aspect-[4/3] relative">
                  {/* 中央メイン領域（AIアバター） */}
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="w-24 h-24 text-gray-500" />
                    </div>
                  )}
                  {/* 左上小窓（応募者カメラ） */}
                  <div className="absolute top-3 left-3 w-20 h-15 bg-gray-700 rounded-lg flex items-center justify-center px-2 py-3">
                    <span className="text-[10px] text-gray-400">応募者</span>
                  </div>
                  {/* 右下UIパーツ */}
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <div className="w-6 h-6 bg-gray-700 rounded-full" />
                    <div className="w-6 h-6 bg-gray-700 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* タブ4: 質問設定 */}
        {activeTab === '質問設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <QuestionEditor companyId={companyId} theme="dark" onNavigateToJobs={() => setActiveTab('求人管理')} />
          </div>
        )}

        {/* タブ5: 評価設定 */}
        {activeTab === '評価設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <h2 className="text-base font-semibold text-white mb-1">評価軸設定</h2>
            <p className="text-sm text-gray-400 mb-6">各評価軸の名称と重み（合計100%）を設定してください</p>
            <div className="space-y-0">
              {axes.map((ax, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-white/[0.04]">
                  <span className="text-sm text-gray-500 w-6 shrink-0">{i + 1}.</span>
                  <input
                    type="text"
                    value={ax.name}
                    onChange={(e) => {
                      const next = [...axes]
                      next[i] = { ...next[i], name: e.target.value }
                      setAxes(next)
                    }}
                    className="bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-3 py-2 text-sm w-56 focus:border-blue-500/50 outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={ax.weight}
                      onChange={(e) => {
                        const next = [...axes]
                        next[i] = { ...next[i], weight: Number(e.target.value) || 0 }
                        setAxes(next)
                      }}
                      min={0}
                      max={100}
                      className="bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-3 py-2 text-sm w-20 text-center focus:border-blue-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className={`mt-4 text-sm ${totalWeight === 100 ? 'text-gray-400' : 'text-red-400'}`}>
              合計: {totalWeight}%{totalWeight !== 100 && '（100%にしてください）'}
            </p>
            <button
              type="button"
              onClick={() => showToast('評価設定を保存しました')}
              className="mt-6 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
            >
              保存する
            </button>
          </div>
        )}

        {/* タブ6: 求人管理 */}
        {activeTab === '求人管理' && (
          <div className={`${CARD_BASE} p-6`}>
            <JobManager companyId={companyId} theme="dark" />
          </div>
        )}

        {/* タブ7: 利用状況 */}
        {activeTab === '利用状況' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">当月面接実施数</p>
                <p className="text-2xl font-bold text-white mb-2">{monthlyUsedCount}/{company?.monthly_interview_limit ?? 0}件</p>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${(company?.monthly_interview_limit ?? 0) > 0 ? Math.min(100, (monthlyUsedCount / (company?.monthly_interview_limit ?? 1)) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">残り面接枠</p>
                <p className="text-2xl font-bold text-white">{Math.max(0, (company?.monthly_interview_limit ?? 0) - monthlyUsedCount)}件</p>
              </div>
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">消化率</p>
                <p className="text-2xl font-bold text-white">
                  {(company?.monthly_interview_limit ?? 0) > 0
                    ? Math.round((monthlyUsedCount / (company?.monthly_interview_limit ?? 1)) * 100)
                    : 0}%
                </p>
              </div>
            </div>
            <div className={`${CARD_BASE} p-6`}>
              <button
                type="button"
                onClick={() => router.push(`/admin/applicants?company=${companyId}`)}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                この企業の応募者一覧を見る →
              </button>
            </div>
          </div>
        )}

        {/* タブ8: セキュリティ */}
        {activeTab === 'セキュリティ' && (
          <div className="space-y-6">
            <div className={`${CARD_BASE} p-6`}>
              <h2 className="text-base font-semibold text-white mb-4">セキュリティポリシー</h2>
              <div className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-blue-400 mb-2">パスワードポリシー</h3>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    企業アカウントのパスワードは12文字以上（大文字・小文字・数字・特殊文字を各1文字以上）が必要です。
                    NISTガイドラインに準拠し、定期的なパスワード変更は求めません。
                    漏洩が検知された場合のみ変更を要求します。
                  </p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-blue-400 mb-2">セッション管理</h3>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    企業アカウント: 最終操作から24時間でタイムアウト。同時ログイン制限なし。
                    運営管理者: 最終操作から8時間でタイムアウト。同時ログイン制限なし。
                  </p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-blue-400 mb-2">MFA（多要素認証）</h3>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    運営管理者: TOTP必須。企業アカウント: 推奨（任意）。
                    Google AuthenticatorやAuthyなどのアプリで6桁コードを生成します。
                  </p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-blue-400 mb-2">異常検知・ログイン通知</h3>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    通常と異なる国やIPアドレスからのログインが検知された場合、
                    登録メールアドレスに自動通知が送信されます。
                  </p>
                </div>
              </div>
            </div>

            <div className={`${CARD_BASE} p-6`}>
              <h2 className="text-base font-semibold text-white mb-2">アカウントロック管理</h2>
              <p className="text-sm text-gray-400 mb-4">
                企業アカウントが10回連続ログイン失敗でロックされた場合、ここから手動で解除できます。
                通常は30分後に自動解除されます。
              </p>
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white">アカウント状態</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {company?.is_locked
                        ? `ロック中（${company?.locked_at ? new Date(company.locked_at).toLocaleString('ja-JP') : ''}）`
                        : 'ロックなし（正常）'}
                    </p>
                  </div>
                  {company?.is_locked && (
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await patchCompany({ is_locked: false, locked_at: null, login_fail_count: 0 })
                        if (result.ok) {
                          showToast('アカウントロックを解除しました')
                          setRefreshTrigger((t) => t + 1)
                        } else {
                          showToast(result.error || '解除に失敗しました')
                        }
                      }}
                      className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 border border-emerald-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
                    >
                      ロック解除
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 契約停止確認モーダル */}
      {stopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStopModalOpen(false)} aria-hidden />
          <div className={`relative ${CARD_BASE} p-6 max-w-md w-full`}>
            <h3 className="text-lg font-semibold text-white mb-2">契約停止の確認</h3>
            <p className="text-sm text-gray-400 mb-6">本当に停止しますか？停止すると新規面接の受付が停止されます。</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setStopModalOpen(false)}
                className="bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleStopContract}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                停止する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 契約再開確認モーダル */}
      {resumeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setResumeModalOpen(false)} aria-hidden />
          <div className={`relative ${CARD_BASE} p-6 max-w-md w-full`}>
            <h3 className="text-lg font-semibold text-white mb-2">契約再開の確認</h3>
            <p className="text-sm text-gray-400 mb-6">契約を再開しますか？再開すると面接の受付が再開されます。</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setResumeModalOpen(false)}
                className="bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleResumeContract}
                className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 border border-emerald-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                再開する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 月間上限変更モーダル */}
      {limitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setLimitModalOpen(false)} aria-hidden />
          <div className={`relative ${CARD_BASE} p-6 max-w-md w-full`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">月間上限人数を変更</h3>
              <button type="button" onClick={() => setLimitModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-amber-400">上限変更は料金に影響するため、管理者パスワードの再確認が必要です</p>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">現在の上限</p>
                <p className="text-sm text-white">{company?.monthly_interview_limit ?? 0}件</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">当月利用人数</p>
                <p className="text-sm text-white">{monthlyUsedCount}件</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">新しい上限</label>
                <input
                  type="number"
                  min={5}
                  value={newLimitStr}
                  onChange={(e) => setNewLimitStr(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm focus:border-blue-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {parseInt(newLimitStr, 10) > 0 && parseInt(newLimitStr, 10) < 5 && (
                  <p className="text-xs text-red-400 mt-1">最低5件以上に設定してください</p>
                )}
                {parseInt(newLimitStr, 10) >= 5 && parseInt(newLimitStr, 10) < monthlyUsedCount && (
                  <p className="text-xs text-red-400 mt-1">当月利用人数（{monthlyUsedCount}件）未満には設定できません</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">管理者パスワード</label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => { setAdminPassword(e.target.value); setLimitError('') }}
                    placeholder="現在のパスワードを入力"
                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm focus:border-blue-500/50 outline-none pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-300"
                  >
                    {showAdminPassword ? '隠す' : '表示'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">料金: ¥4,000 / 面接・人（税別）</p>
              {limitError && (
                <p className="text-xs text-red-400">{limitError}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setLimitModalOpen(false)}
                className="bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveLimitChange}
                disabled={limitSaving || !newLimitStr || isNaN(parseInt(newLimitStr, 10)) || parseInt(newLimitStr, 10) < 5 || parseInt(newLimitStr, 10) < monthlyUsedCount || !adminPassword}
                className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {limitSaving ? '確認中...' : '変更する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 企業情報編集モーダル */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} aria-hidden />
          <div className={`relative ${CARD_BASE} p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">企業情報編集</h3>
              <button type="button" onClick={() => setEditModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">企業名</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm focus:border-blue-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">担当者名</label>
                <input
                  type="text"
                  value={editContactName}
                  onChange={(e) => setEditContactName(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm focus:border-blue-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">担当者メール</label>
                <input
                  type="email"
                  value={editContactEmail}
                  onChange={(e) => setEditContactEmail(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm focus:border-blue-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">担当者電話</label>
                <input
                  type="tel"
                  value={editContactPhone}
                  onChange={(e) => setEditContactPhone(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm focus:border-blue-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">業種</label>
                <input
                  type="text"
                  value={editIndustry}
                  onChange={(e) => setEditIndustry(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm focus:border-blue-500/50 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveCompanyInfo}
                className="bg-blue-600 text-white hover:bg-blue-700 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toastVisible && (
        <div
          className="fixed bottom-6 right-6 z-[60] flex items-center px-5 py-3 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-2xl border border-white/10 text-gray-300 text-sm rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          <Info className="w-4 h-4 text-blue-400 mr-2 shrink-0" />
          {toastMessage}
        </div>
      )}
    </>
  )
}

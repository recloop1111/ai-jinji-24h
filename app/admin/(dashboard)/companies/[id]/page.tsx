'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Link as LinkIcon, User, Info, X, Check } from 'lucide-react'
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

const MONTHLY_USAGE = [
  { month: '2025-02', used: 14, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2025-01', used: 18, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2024-12', used: 12, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2024-11', used: 20, limit: 20, plan: 'プランB', atLimit: true },
  { month: '2024-10', used: 8, limit: 20, plan: 'プランB', atLimit: false },
]

const PLAN_OPTIONS = [
  { 
    value: 'light', 
    label: 'ライト', 
    interviews: '月1〜10件',
    price: '¥40,000（税別）/ 月',
    features: ['CSVダウンロード: 利用可能', 'データ保持: 無期限（動画のみ180日で自動削除）']
  },
  { 
    value: 'standard', 
    label: 'スタンダード', 
    interviews: '月11〜20件',
    price: '¥80,000（税別）/ 月',
    features: ['CSVダウンロード: 利用可能', 'データ保持: 無期限（動画のみ180日で自動削除）']
  },
  { 
    value: 'pro', 
    label: 'プロ', 
    interviews: '月21〜30件',
    price: '¥120,000（税別）/ 月',
    features: ['CSVダウンロード: 利用可能', 'データ保持: 無期限（動画のみ180日で自動削除）']
  },
  { 
    value: 'payperuse', 
    label: '31件目以降', 
    interviews: '月31件以上',
    price: '¥3,500/件（従量課金）',
    features: ['31件目以降は自動的に¥3,500/件で従量課金', 'CSVダウンロード: 利用可能', 'データ保持: 無期限（動画のみ180日で自動削除）']
  },
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
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('')

  // 企業情報編集 state
  const [editName, setEditName] = useState('')
  const [editRepresentativeName, setEditRepresentativeName] = useState('')
  const [editContactName, setEditContactName] = useState('')
  const [editContactEmail, setEditContactEmail] = useState('')
  const [editContactPhone, setEditContactPhone] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editIndustry, setEditIndustry] = useState('')
  const [editEmployeeCount, setEditEmployeeCount] = useState('')

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
      const supabase = createClient()
      const { data } = await supabase.from('companies').select('*').eq('id', companyId).single()
      if (data) {
        setCompany(data)
        setDisplayName(data.name || '')
        setSelectedPlan(data.plan || 'free')
        setLogoPreview(data.logo_url || null)
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
    setEditRepresentativeName(company?.representative_name || '')
    setEditContactName(company?.contact_name || company?.contact_person || '')
    setEditContactEmail(company?.contact_email || company?.email || '')
    setEditContactPhone(company?.contact_phone || company?.phone || '')
    setEditAddress(company?.address || '')
    setEditIndustry(company?.industry || '')
    setEditEmployeeCount(company?.employee_count?.toString() || '')
    setEditModalOpen(true)
  }

  async function saveCompanyInfo() {
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({
        name: editName,
        representative_name: editRepresentativeName,
        contact_name: editContactName,
        contact_email: editContactEmail,
        contact_phone: editContactPhone,
        address: editAddress,
        industry: editIndustry,
        employee_count: editEmployeeCount ? parseInt(editEmployeeCount) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    setEditModalOpen(false)
    showToast('企業情報を保存しました')
    setRefreshTrigger((t) => t + 1)
  }

  async function savePlanChange(planValue?: string) {
    const newPlan = planValue || selectedPlan
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({
        plan: newPlan,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    setSelectedPlan(newPlan)
    setPlanModalOpen(false)
    showToast('プランを変更しました')
    setRefreshTrigger((t) => t + 1)
  }

  async function saveBrandSettings() {
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({
        name: displayName,
        logo_url: logoPreview,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    showToast('ブランド設定を保存しました')
    setRefreshTrigger((t) => t + 1)
  }

  async function handleStopContract() {
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({
        is_suspended: true,
        status: 'suspended',
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    setStopModalOpen(false)
    showToast('契約を停止しました')
    setRefreshTrigger((t) => t + 1)
  }

  async function handleResumeContract() {
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({
        is_suspended: false,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    setResumeModalOpen(false)
    showToast('契約を再開しました')
    setRefreshTrigger((t) => t + 1)
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
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({
        avatar_url: avatarPreview,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    showToast('アバター設定を保存しました')
  }

  async function deleteAvatarImage() {
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', companyId)
    setAvatarPreview(null)
    showToast('アバター画像を削除しました')
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
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">代表者名</label>
                <p className="text-sm text-white mt-1">{company?.representative_name || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者名</label>
                <p className="text-sm text-white mt-1">{company?.contact_name || company?.contact_person || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者メール</label>
                <p className="text-sm text-white mt-1">{company?.contact_email || company?.email || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">担当者電話</label>
                <p className="text-sm text-white mt-1">{company?.contact_phone || company?.phone || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">所在地</label>
                <p className="text-sm text-white mt-1">{company?.address || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">業種</label>
                <p className="text-sm text-white mt-1">{company?.industry || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">従業員数</label>
                <p className="text-sm text-white mt-1">{company?.employee_count ? `${company.employee_count}名` : '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">契約プラン</label>
                <p className="text-sm text-white mt-1">{PLAN_OPTIONS.find(p => p.value === company?.plan)?.label || company?.plan || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">契約開始日</label>
                <p className="text-sm text-white mt-1">{company?.contract_start_date || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">次回更新日</label>
                <p className="text-sm text-white mt-1">{company?.next_renewal_date || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">面接URL</label>
                <button type="button" onClick={copyInterviewUrl} className="block text-sm text-blue-400 hover:text-blue-300 mt-1 break-all text-left">
                  {interviewUrl || '未設定'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { setSelectedPlan(company?.plan || 'free'); setPlanModalOpen(true) }}
                className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 border border-blue-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                プラン変更
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
                              const supabase = createClient()
                              await supabase
                                .from('companies')
                                .update({ logo_url: null, updated_at: new Date().toISOString() })
                                .eq('id', companyId)
                              setLogoPreview(null)
                              showToast('ロゴ画像を削除しました')
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
                        { step: 5, text: 'AI面接（最大40分）' },
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
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">面接実施数</p>
                <p className="text-2xl font-bold text-white mb-2">{company?.monthly_interview_count ?? 0}/{company?.monthly_interview_limit ?? 0}件</p>
                <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${(company?.monthly_interview_limit ?? 0) > 0 ? Math.min(100, ((company?.monthly_interview_count ?? 0) / (company?.monthly_interview_limit ?? 1)) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">残り面接枠</p>
                <p className="text-2xl font-bold text-white">{Math.max(0, (company?.monthly_interview_limit ?? 0) - (company?.monthly_interview_count ?? 0))}件</p>
              </div>
              <div className={`${CARD_BASE} p-5`}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">プラン消化率</p>
                <p className="text-2xl font-bold text-white">
                  {(company?.monthly_interview_limit ?? 0) > 0
                    ? Math.round(((company?.monthly_interview_count ?? 0) / (company?.monthly_interview_limit ?? 1)) * 100)
                    : 0}%
                </p>
              </div>
            </div>
            <div className={`${CARD_BASE} overflow-hidden`}>
              <div className="p-6 pb-0">
                <h2 className="text-base font-semibold text-white mb-4">月別利用推移</h2>
                <p className="text-xs text-amber-400/70 px-4 pb-2">※ 現在はサンプルデータを表示しています。実データは今後のアップデートで反映されます。</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4 text-left">月</th>
                      <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4 text-left">利用件数</th>
                      <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-4 text-left">プラン</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTHLY_USAGE.map((m) => (
                      <tr
                        key={m.month}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${m.atLimit ? 'bg-yellow-500/5' : ''}`}
                      >
                        <td className="py-3 px-4 text-sm text-gray-300">{m.month}</td>
                        <td className="py-3 px-4 text-sm text-gray-300">
                          {m.used}/{m.limit}件
                          {m.atLimit && <span className="text-yellow-400 text-xs ml-1">上限到達</span>}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-400">({m.plan})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-6 pt-4 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => router.push(`/admin/applicants?company=${companyId}`)}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  この企業の応募者一覧を見る →
                </button>
              </div>
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
                        const supabase = createClient()
                        await supabase
                          .from('companies')
                          .update({ is_locked: false, locked_at: null, login_fail_count: 0, updated_at: new Date().toISOString() })
                          .eq('id', companyId)
                        showToast('アカウントロックを解除しました')
                        setRefreshTrigger((t) => t + 1)
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

      {/* プラン変更モーダル */}
      {planModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setPlanModalOpen(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-3xl w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">プラン変更</h3>
              <button type="button" onClick={() => setPlanModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {PLAN_OPTIONS.map((plan) => {
                const isCurrent = company?.plan === plan.value
                return (
                  <div
                    key={plan.value}
                    className={`relative bg-gray-800 rounded-lg p-3 ${
                      isCurrent ? 'border border-blue-500' : 'border border-gray-700'
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute -top-2 left-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">
                        現在のプラン
                      </span>
                    )}
                    <h4 className="text-sm font-bold text-white mb-1 mt-1">{plan.label}</h4>
                    <p className="text-xs text-gray-400">{plan.interviews}</p>
                    <p className="text-sm font-bold text-blue-400 my-2">{plan.price}</p>
                    <div className="space-y-1 mb-3">
                      {plan.features.map((feature, idx) => (
                        <p key={idx} className="text-[10px] text-gray-400 leading-tight">{feature}</p>
                      ))}
                    </div>
                    {isCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="w-full bg-gray-700 text-gray-400 cursor-not-allowed text-xs py-1.5 rounded-lg"
                      >
                        現在のプラン
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => savePlanChange(plan.value)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg py-1.5 transition-colors"
                      >
                        このプランに変更
                      </button>
                    )}
                  </div>
                )
              })}
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
                <label className="block text-xs font-medium text-gray-500 mb-1">代表者名</label>
                <input
                  type="text"
                  value={editRepresentativeName}
                  onChange={(e) => setEditRepresentativeName(e.target.value)}
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
                <label className="block text-xs font-medium text-gray-500 mb-1">所在地</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
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
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">従業員数</label>
                <input
                  type="number"
                  value={editEmployeeCount}
                  onChange={(e) => setEditEmployeeCount(e.target.value)}
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

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Link as LinkIcon, User, Info, X } from 'lucide-react'
import JobManager from '@/components/shared/JobManager'
import QuestionEditor from '@/components/shared/QuestionEditor'

const CARD_BASE = 'bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]'

// TODO: 実データに差替え
const EVALUATION_AXES = [
  { name: 'コミュニケーション力', weight: 20 },
  { name: '論理的思考力', weight: 20 },
  { name: '業界適性・経験値', weight: 15 },
  { name: '主体性・意欲', weight: 20 },
  { name: '組織適合性（チームフィット）', weight: 15 },
  { name: 'ストレス耐性', weight: 10 },
]

// TODO: 実データに差替え
const MONTHLY_USAGE = [
  { month: '2025-02', used: 14, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2025-01', used: 18, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2024-12', used: 12, limit: 20, plan: 'プランB', atLimit: false },
  { month: '2024-11', used: 20, limit: 20, plan: 'プランB', atLimit: true },
  { month: '2024-10', used: 8, limit: 20, plan: 'プランB', atLimit: false },
]

const TABS = ['基本情報', 'ブランド設定', 'アバター設定', '質問設定', '評価設定', '求人管理', '利用状況'] as const

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
  const [stopModalOpen, setStopModalOpen] = useState(false)

  // ブランド設定 state
  const [displayName, setDisplayName] = useState('')
  const [brandColor, setBrandColor] = useState('#2563EB')
  const [completeMessage, setCompleteMessage] = useState('本日は面接にご参加いただき、誠にありがとうございました。選考結果は1週間以内にメールにてご連絡いたします。')

  // アバター設定 state
  const [avatarName, setAvatarName] = useState('採用担当のさくら')
  const [voiceType, setVoiceType] = useState<'alloy' | 'nova' | 'echo'>('alloy')
  const [toneTemplate, setToneTemplate] = useState('です・ます調（丁寧）')
  const [customInstructions, setCustomInstructions] = useState('')

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
        setBrandColor(data.brand_color || '#2563EB')
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
    ? `${window.location.origin}/interview/${company.interview_slug}`
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

  const copyUrlFromField = async () => {
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

  async function saveBrandSettings() {
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({
        name: displayName,
        brand_color: brandColor,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    showToast('ブランド設定を保存しました')
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const statusType = company?.is_suspended ? 'suspended' : company?.is_active === false ? 'cancelled' : 'active'
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
                <p className="text-sm text-white mt-1">{company?.contact_person || '未設定'}</p>
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
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">所在地</label>
                <p className="text-sm text-white mt-1">未設定</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">業種</label>
                <p className="text-sm text-white mt-1">{company?.industry || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">従業員数</label>
                <p className="text-sm text-white mt-1">未設定</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">契約プラン</label>
                <p className="text-sm text-white mt-1">{company?.plan || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">契約開始日</label>
                <p className="text-sm text-white mt-1">{company?.contract_start_date || '未設定'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">次回更新日</label>
                <p className="text-sm text-white mt-1">未設定</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">面接URL</label>
                <button type="button" onClick={copyUrlFromField} className="block text-sm text-blue-400 hover:text-blue-300 mt-1 break-all text-left">
                  {interviewUrl || '未設定'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => showToast('プラン変更は課金管理から行ってください')}
                className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 border border-blue-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                プラン変更
              </button>
              <button
                type="button"
                onClick={() => setStopModalOpen(true)}
                className="bg-red-500/10 text-red-400 hover:bg-red-500/15 border border-red-500/20 rounded-xl px-4 py-2 text-sm transition-colors"
              >
                契約停止
              </button>
              <button
                type="button"
                onClick={() => showToast('編集機能は今後実装予定です')}
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
                    <div className="w-20 h-20 bg-white/[0.05] border border-white/[0.08] rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-white/30 text-xs">{displayName?.slice(0, 2) || company?.name?.slice(0, 2) || '—'}</span>
                    </div>
                    <div>
                      <button type="button" className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl px-4 py-2 text-sm">
                        画像をアップロード
                      </button>
                      <p className="text-xs text-gray-500 mt-1">推奨サイズ: 200x200px、PNG/JPG</p>
                      {/* TODO: Cloudflare R2にアップロード実装 */}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">メインカラー</label>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="w-10 h-10 rounded-xl border border-white/10 shrink-0" style={{ backgroundColor: brandColor }} />
                    <input
                      type="text"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="bg-white/[0.05] border border-white/[0.08] rounded-xl text-white px-4 py-2.5 text-sm w-32 focus:border-blue-500/50 outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">応募者画面のアクセントカラーに使用されます</p>
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
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                >
                  保存する
                </button>
              </div>
              <div className="lg:w-72 shrink-0">
                <p className="text-xs text-gray-500 mb-2">プレビュー</p>
                <div className="w-full max-w-[288px] bg-gray-900 rounded-2xl border border-white/10 p-4">
                  <div className="w-12 h-12 bg-white/[0.05] rounded-xl flex items-center justify-center mb-3">
                    <span className="text-white/30 text-xs">{displayName?.slice(0, 2) || company?.name?.slice(0, 2) || '—'}</span>
                  </div>
                  <p className="text-sm font-medium mb-3" style={{ color: brandColor }}>
                    {displayName}
                  </p>
                  <button type="button" className="w-full py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: brandColor }}>
                    面接を開始する
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* タブ3: アバター設定 */}
        {activeTab === 'アバター設定' && (
          <div className={`${CARD_BASE} p-6`}>
            <div className="space-y-6 max-w-2xl">
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
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center shrink-0">
                    <User className="w-10 h-10 text-gray-500" />
                  </div>
                  <div>
                    <button type="button" className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl px-4 py-2 text-sm">
                      画像をアップロード
                    </button>
                    <p className="text-xs text-gray-500 mt-1">推奨サイズ: 256x256px、PNG/JPG</p>
                    {/* TODO: Cloudflare R2にアップロード実装 */}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">音声タイプ</label>
                <div className="flex flex-wrap gap-3 mt-2">
                  {(['alloy', 'nova', 'echo'] as const).map((v) => (
                    <button
                      key={v}
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
                  ))}
                </div>
                {/* TODO: OpenAI Realtime APIの最新音声リストに差替え */}
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
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">追加の指示（任意）</label>
                <textarea
                  rows={3}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="例: 応募者の緊張をほぐすため、面接開始時にアイスブレイクを入れてください"
                  className="mt-2 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 px-4 py-3 text-sm w-full focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">OpenAI APIのシステムプロンプトに追加される指示です</p>
              </div>
              <button
                type="button"
                onClick={() => showToast('アバター設定を保存しました')}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
              >
                保存する
              </button>
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
              className="mt-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
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
                  onClick={() => {
                    showToast('応募者管理は次のステップで実装します')
                    // TODO: router.push(`/admin/applicants?company=${params.id}`)
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  この企業の応募者一覧を見る →
                </button>
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
            <p className="text-sm text-gray-400 mb-6">{company?.name || 'この企業'}の契約を停止しますか？停止すると新規面接の受付が停止されます。</p>
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

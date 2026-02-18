'use client'

import { useState } from 'react'
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react'

// 管理者認証モーダルコンポーネント
function AdminAuthModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const [adminPassword, setAdminPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!adminPassword.trim()) {
      setError('パスワードを入力してください')
      return
    }
    // TODO: Phase 4 - Supabaseで管理者認証
    setError('')
    onConfirm()
    setAdminPassword('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-slate-900 mb-2">管理者認証</h3>
        <p className="text-sm text-slate-600 mb-4">
          この操作には管理者用パスワードが必要です。
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            管理者用パスワード
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value)
                setError('')
              }}
              className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="管理者用パスワードを入力"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
            </button>
          </div>
          {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            認証して実行
          </button>
        </div>
      </div>
    </div>
  )
}

// TODO: 実データに差替え
const CONTRACT_INFO = {
  contractStart: '2025-01-15',
  nextRenewal: '2025-03-15',
}

// TODO: 実データに差替え
const USAGE = {
  used: 14,
}

const PLANS = [
  { key: 'light', name: 'ライト', description: '月1〜10件', price: 40000, isCustom: false },
  { key: 'standard', name: 'スタンダード', description: '月11〜20件', price: 80000, isCustom: false },
  { key: 'pro', name: 'プロ', description: '月21〜30件', price: 120000, isCustom: false },
  { key: 'overage', name: '31件目以降', description: '月31件以上', price: null, isCustom: true },
]

const PLAN_ORDER = ['light', 'standard', 'pro']

function getProgressBarColor(percent: number) {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 80) return 'bg-yellow-500'
  return 'bg-blue-500'
}

type PlanChangeModal = {
  type: 'upgrade'
  plan: { key: string; name: string; description: string; price: number }
}

// TODO: 実際のサポートメールアドレスに差替え
const SUPPORT_EMAIL = 'support@ai-jinji-24h.com'

function maxInterviewsToPlanKey(max: number): string {
  if (max <= 10) return 'light'
  if (max <= 20) return 'standard'
  return 'pro'
}

export default function PlanPage() {
  const [currentPlan, setCurrentPlan] = useState({
    name: 'スタンダード',
    range: '11〜20件',
    price: 80000,
    maxInterviews: 20,
  })
  const [autoUpgrade, setAutoUpgrade] = useState(false)
  const [planChangeModal, setPlanChangeModal] = useState<PlanChangeModal | null>(null)
  const [downgradeInfoModal, setDowngradeInfoModal] = useState<{
    targetPlan: { name: string; description: string }
  } | null>(null)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [autoUpgradeConfirmOpen, setAutoUpgradeConfirmOpen] = useState(false)
  const [contactEmail, setContactEmail] = useState('info@sample-corp.co.jp') // TODO: 実データに差替え（ログイン中企業メール）
  const [contactMessage, setContactMessage] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [planChangeAuthModalOpen, setPlanChangeAuthModalOpen] = useState(false)
  const [pendingPlanChange, setPendingPlanChange] = useState<{ key: string; name: string; description: string; price: number } | null>(null)

  const currentPlanKey = maxInterviewsToPlanKey(currentPlan.maxInterviews)
  const usagePercent =
    currentPlan.maxInterviews > 0
      ? Math.min(100, Math.round((USAGE.used / currentPlan.maxInterviews) * 100))
      : 0
  const remaining = Math.max(0, currentPlan.maxInterviews - USAGE.used)

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2000)
  }

  const handlePlanChangeClick = (planKey: string) => {
    const plan = PLANS.find((p) => p.key === planKey)
    if (!plan || plan.isCustom || plan.price === null) return
    const currentIdx = PLAN_ORDER.indexOf(currentPlanKey)
    const targetIdx = PLAN_ORDER.indexOf(planKey)
    const isUpgrade = targetIdx > currentIdx
    if (isUpgrade) {
      // まず管理者認証モーダルを表示（プラン情報を一時保存）
      setPendingPlanChange({ key: plan.key, name: plan.name, description: plan.description, price: plan.price })
      setPlanChangeAuthModalOpen(true)
    } else {
      setDowngradeInfoModal({ targetPlan: { name: plan.name, description: plan.description } })
    }
  }

  const handleAdminAuthConfirm = () => {
    // 管理者認証成功後、プラン変更確認モーダルを表示
    if (!pendingPlanChange) return
    setPlanChangeAuthModalOpen(false)
    setPlanChangeModal({
      type: 'upgrade',
      plan: pendingPlanChange,
    })
  }

  const handleExecutePlanChange = () => {
    if (!planChangeModal) return
    const targetKey = planChangeModal.plan.key
    if (targetKey === 'light') {
      setCurrentPlan({ name: 'ライト', range: '1〜10件', price: 40000, maxInterviews: 10 })
    } else if (targetKey === 'standard') {
      setCurrentPlan({ name: 'スタンダード', range: '11〜20件', price: 80000, maxInterviews: 20 })
    } else if (targetKey === 'pro') {
      setCurrentPlan({ name: 'プロ', range: '21〜30件', price: 120000, maxInterviews: 30 })
    }
    // TODO: Stripe APIでプラン変更を実装
    setPlanChangeModal(null)
    setPendingPlanChange(null)
    showToast('プランを変更しました')
  }

  const getDowngradeMailtoHref = () => {
    if (!downgradeInfoModal) return '#'
    const currentPlanFull = `${currentPlan.name}（${currentPlan.range}）`
    const targetPlanFull = `${downgradeInfoModal.targetPlan.name}（${downgradeInfoModal.targetPlan.description}）`
    const subject = encodeURIComponent('プランダウングレードのご相談')
    const body = encodeURIComponent(
      `現在のプラン：${currentPlanFull}\nご希望のプラン：${targetPlanFull}\n\nダウングレードを希望します。`
    )
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
  }

  const handleContactClick = () => {
    setContactModalOpen(true)
  }

  const handleContactSubmit = () => {
    // TODO: Resend APIでお問い合わせメール送信を実装
    setContactModalOpen(false)
    setContactMessage('')
    showToast('お問い合わせを送信しました')
  }

  const handleAutoUpgradeToggle = () => {
    if (autoUpgrade) {
      setAutoUpgrade(false)
      showToast('自動繰上げプランを無効にしました')
    } else {
      setAutoUpgradeConfirmOpen(true)
    }
  }

  const handleAutoUpgradeConfirm = () => {
    // TODO: API連携
    setAutoUpgrade(true)
    setAutoUpgradeConfirmOpen(false)
    showToast('自動繰上げプランを有効にしました')
  }

  return (
    <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">プラン・契約管理</h1>

        {/* 上部: 現在のプラン情報カード */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            {currentPlan.name}（{currentPlan.range}）
          </h2>
          <p className="text-slate-600 mb-2">
            ¥{currentPlan.price.toLocaleString()}（税別）/ 月
          </p>
          <p className="text-sm text-slate-500 mb-2">契約開始日: {CONTRACT_INFO.contractStart}</p>
          <p className="text-sm text-slate-500 mb-2">次回更新日: {CONTRACT_INFO.nextRenewal}</p>
          <p className="text-sm text-gray-600 mb-1">データ保持: 無期限（動画のみ180日で自動削除）</p>
          <p className="text-sm text-green-600 mb-4">CSVダウンロード: 利用可能</p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={autoUpgrade}
              onClick={handleAutoUpgradeToggle}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                autoUpgrade ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  autoUpgrade ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-slate-700">
              自動繰上げプラン: {autoUpgrade ? 'ON' : 'OFF'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-3">
            {autoUpgrade
              ? '最大プロ・月30件まで。31件目以降は¥3,500/件で自動従量課金'
              : 'プラン上限に達した場合、新規面接の受付を停止します'}
          </p>
        </div>

        {/* 中部: 今月の利用状況 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500 mb-2">面接実施数</p>
            <p className="text-xl font-bold text-slate-900 mb-3">
              {USAGE.used} / {currentPlan.maxInterviews}件
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${getProgressBarColor(usagePercent)}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500 mb-2">残り面接枠</p>
            <p className="text-2xl font-bold text-slate-900">{autoUpgrade ? '制限なし' : `${remaining}件`}</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          ※ 面接時間が10分未満の場合、プラン件数にはカウントされません
        </p>

        {/* 下部: プラン一覧（変更用） */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">プラン一覧</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map((plan) => {
              const isCurrent = plan.key === currentPlanKey
              const currentIdx = PLAN_ORDER.indexOf(currentPlanKey)
              const planIdx = PLAN_ORDER.indexOf(plan.key)
              const isUpgrade = !plan.isCustom && planIdx > currentIdx
              const isDowngrade = !plan.isCustom && planIdx < currentIdx

              return (
                <div
                  key={plan.key}
                  className={`rounded-xl border p-5 shadow-sm ${
                    isCurrent ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="shrink-0 px-2 py-0.5 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full">
                        現在のプラン
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mb-3">{plan.description}</p>
                  {plan.price !== null && (
                    <p className="text-lg font-bold text-slate-900 mb-2">
                      ¥{plan.price.toLocaleString()}（税別）/ 月
                    </p>
                  )}
                  {plan.key === 'overage' ? (
                    <div className="mb-4 space-y-1">
                      <p className="text-lg font-bold text-slate-900 mb-2">¥3,500/件（従量課金）</p>
                      <p className="text-xs text-gray-500">31件目以降は自動的に¥3,500/件で従量課金されます</p>
                      <p className="text-xs text-green-600 mt-2">CSVダウンロード: 利用可能</p>
                      <p className="text-xs text-gray-500">データ保持: 無期限（動画のみ180日で自動削除）</p>
                    </div>
                  ) : (
                    <div className="mb-4 space-y-1">
                      <p className="text-xs text-green-600">CSVダウンロード: 利用可能</p>
                      <p className="text-xs text-gray-500">データ保持: 無期限（動画のみ180日で自動削除）</p>
                    </div>
                  )}

                  {isCurrent && (
                    <button
                      type="button"
                      disabled
                      className="w-full px-4 py-2 text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
                    >
                      現在のプラン
                    </button>
                  )}
                  {isUpgrade && (
                    <button
                      type="button"
                      onClick={() => handlePlanChangeClick(plan.key)}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      アップグレード
                    </button>
                  )}
                  {isDowngrade && (
                    <button
                      type="button"
                      onClick={() => handlePlanChangeClick(plan.key)}
                      className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      お問い合わせ
                    </button>
                  )}
                  {plan.key === 'overage' && null}
                </div>
              )
            })}
          </div>
        </div>

        {/* プラン変更確認モーダル（アップグレード） */}
        {planChangeModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setPlanChangeModal(null)}
              aria-hidden
            />
            <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">プラン変更の確認</h3>
              <p className="text-sm text-slate-600 mb-6">
                プランを{planChangeModal.plan.name}（{planChangeModal.plan.description}）にアップグレードします。次回請求から
                ¥{planChangeModal.plan.price.toLocaleString()}（税別）/月
                が適用されます。よろしいですか？
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPlanChangeModal(null)}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleExecutePlanChange}
                  className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  変更する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ダウングレード案内モーダル */}
        {downgradeInfoModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setDowngradeInfoModal(null)}
              aria-hidden
            />
            <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">プランのダウングレードについて</h3>
              <p className="text-sm text-slate-600 mb-4">
                プランのダウングレードにつきましては、自動でのお手続きを承っておりません。ダウングレードをご希望の場合は、運営事務局までお問い合わせください。
              </p>
              <p className="text-sm text-slate-600 mb-4">
                現在のプラン：{currentPlan.name}（{currentPlan.range}）
              </p>
              <p className="text-sm text-slate-600 mb-6">
                ご希望のプラン：{downgradeInfoModal.targetPlan.name}（{downgradeInfoModal.targetPlan.description}）
              </p>
              <p className="text-sm text-slate-600 mb-6">
                メール: {SUPPORT_EMAIL}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDowngradeInfoModal(null)}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  閉じる
                </button>
                <a
                  href={getDowngradeMailtoHref()}
                  className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  メールで問い合わせる
                </a>
              </div>
            </div>
          </div>
        )}

        {/* カスタムプランお問い合わせモーダル */}
        {contactModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setContactModalOpen(false)}
              aria-hidden
            />
            <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">31件目以降の従量課金について</h3>
              <p className="text-sm text-slate-600 mb-4">
                月31件目以降は自動的に¥3,500/件で従量課金されます。お問い合わせは不要です。
              </p>
              <div className="mb-4">
                <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700 mb-1">
                  メールアドレス
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <div className="mb-6">
                <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700 mb-1">
                  お問い合わせ内容
                </label>
                <textarea
                  id="contact-message"
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="ご希望の月間面接件数や、ご質問内容をご記入ください"
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-slate-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setContactModalOpen(false)}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleContactSubmit}
                  className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  送信する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 自動繰上げプラン有効化確認モーダル */}
        {autoUpgradeConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setAutoUpgradeConfirmOpen(false)}
              aria-hidden
            />
            <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-900 mb-4">自動繰上げプランの有効化</h3>
              <p className="text-sm text-slate-600 mb-6">
                自動繰上げプランをONにすると、現在のプランの面接件数上限を超えた場合に自動的に上位プランへ繰り上げられます（最大プロ・月30件まで）。31件目以降は¥3,500/件で自動従量課金されます。これにより月額料金が増加する可能性があります。よろしいですか？
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAutoUpgradeConfirmOpen(false)}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleAutoUpgradeConfirm}
                  className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  有効にする
                </button>
              </div>
            </div>
          </div>
        )}

        {/* トースト */}
        {toast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[110] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
            {toast}
          </div>
        )}

        {/* プラン変更 管理者認証モーダル */}
        <AdminAuthModal
          isOpen={planChangeAuthModalOpen}
          onClose={() => {
            setPlanChangeAuthModalOpen(false)
            setPendingPlanChange(null)
          }}
          onConfirm={handleAdminAuthConfirm}
        />
      </div>
    )
}

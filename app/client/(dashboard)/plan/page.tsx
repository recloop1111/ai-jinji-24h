'use client'

import { useState } from 'react'

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
  { key: 'A', name: 'プランA', description: '月1〜10件', price: 60000, isCustom: false },
  { key: 'B', name: 'プランB（11〜20件）', description: '月11〜20件', price: 120000, isCustom: false },
  { key: 'C', name: 'プランC', description: '月21〜30件', price: 180000, isCustom: false },
  { key: 'custom', name: 'カスタムプラン', description: '月31件以上', price: null, isCustom: true },
]

const PLAN_ORDER = ['A', 'B', 'C']

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
  if (max <= 10) return 'A'
  if (max <= 20) return 'B'
  return 'C'
}

export default function PlanPage() {
  const [currentPlan, setCurrentPlan] = useState({
    name: 'プランB',
    range: '11〜20件',
    price: 120000,
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
      setPlanChangeModal({
        type: 'upgrade',
        plan: { key: plan.key, name: plan.name, description: plan.description, price: plan.price },
      })
    } else {
      setDowngradeInfoModal({ targetPlan: { name: plan.name, description: plan.description } })
    }
  }

  const handleConfirmPlanChange = () => {
    if (!planChangeModal) return
    const targetKey = planChangeModal.plan.key
    if (targetKey === 'A') {
      setCurrentPlan({ name: 'プランA', range: '1〜10件', price: 60000, maxInterviews: 10 })
    } else if (targetKey === 'B') {
      setCurrentPlan({ name: 'プランB', range: '11〜20件', price: 120000, maxInterviews: 20 })
    } else if (targetKey === 'C') {
      setCurrentPlan({ name: 'プランC', range: '21〜30件', price: 180000, maxInterviews: 30 })
    }
    // TODO: Stripe APIでプラン変更を実装
    setPlanChangeModal(null)
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
          {currentPlanKey === 'A' ? (
            <>
              <p className="text-sm text-gray-600 mb-1">データ保持期間: 90日（すべてのデータ）</p>
              <p className="text-sm text-red-500 mb-2">CSVダウンロード: ご利用いただけません</p>
              <p className="text-xs text-blue-600 mb-4">
                プランB以上にアップグレードすると、応募者データの無期限保持とCSVダウンロードが利用可能になります。
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-1">データ保持期間: 無期限（動画のみ90日で自動削除）</p>
              <p className="text-sm text-green-600 mb-4">CSVダウンロード: 利用可能</p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={autoUpgrade}
              onClick={handleAutoUpgradeToggle}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${
                autoUpgrade ? 'bg-indigo-600' : 'bg-gray-300'
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
              ? 'プラン上限を超えた場合、自動的に上位プランに繰り上げます（最大プランC・月30件まで）'
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
            <p className="text-2xl font-bold text-slate-900">{remaining}件</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500 mb-2">プラン消化率</p>
            <p
              className={`text-2xl font-bold ${
                usagePercent >= 90 ? 'text-red-600' : usagePercent >= 80 ? 'text-yellow-600' : 'text-blue-600'
              }`}
            >
              {usagePercent}%
            </p>
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
                    isCurrent ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                    {isCurrent && (
                      <span className="shrink-0 px-2 py-0.5 text-xs font-semibold text-indigo-700 bg-indigo-100 rounded-full">
                        現在のプラン
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mb-3">{plan.description}</p>
                  {plan.price !== null ? (
                    <p className="text-lg font-bold text-slate-900 mb-2">
                      ¥{plan.price.toLocaleString()}（税別）/ 月
                    </p>
                  ) : (
                    <p className="text-lg font-bold text-slate-900 mb-2">要相談</p>
                  )}
                  {plan.key === 'A' && (
                    <div className="mb-4 space-y-1">
                      <p className="text-xs text-red-500">CSVダウンロード: 不可</p>
                      <p className="text-xs text-gray-500">データ保持: 90日（動画・応募者情報すべて）</p>
                    </div>
                  )}
                  {(plan.key === 'B' || plan.key === 'C') && (
                    <div className="mb-4 space-y-1">
                      <p className="text-xs text-green-600">CSVダウンロード: 可</p>
                      <p className="text-xs text-gray-500">データ保持: 無期限（動画のみ90日で削除）</p>
                    </div>
                  )}
                  {plan.key === 'custom' && (
                    <div className="mb-4 space-y-1">
                      <p className="text-xs text-green-600">CSVダウンロード: 可</p>
                      <p className="text-xs text-gray-500">データ保持: 無期限（動画のみ90日で削除）</p>
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
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
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
                  {plan.isCustom && (
                    <button
                      type="button"
                      onClick={handleContactClick}
                      className="w-full px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      お問い合わせ
                    </button>
                  )}
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
                  onClick={handleConfirmPlanChange}
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
              <h3 className="text-lg font-bold text-slate-900 mb-4">カスタムプランのお問い合わせ</h3>
              <p className="text-sm text-slate-600 mb-4">
                月31件以上のカスタムプランをご希望の場合、担当者よりご連絡いたします。
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-slate-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-none"
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
                自動繰上げプランをONにすると、現在のプランの面接件数上限を超えた場合に自動的に上位プランへ繰り上げられます（最大プランC・月30件まで）。これにより月額料金が増加する可能性があります。よろしいですか？
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
      </div>
    )
}

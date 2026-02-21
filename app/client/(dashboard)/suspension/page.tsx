'use client'

import { useState } from 'react'
import { Pause as PauseIcon, AlertTriangle as AlertIcon, ChevronDown as ChevronDownIcon, ChevronUp as ChevronUpIcon, Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react'

// TODO: 実データに差替え
const FAQ_ITEMS = [
  {
    id: 1,
    question: '一時停止中に既存の応募者データは閲覧できますか？',
    answer: 'はい、一時停止中でも既存の応募者データ、面接録画、評価レポートはすべて閲覧可能です。新規面接の受付のみ停止されます。',
  },
  {
    id: 2,
    question: '一時停止を取り消した場合、追加費用は発生しますか？',
    answer: 'いいえ、取り消しに追加費用は発生しません。取り消し後は通常通りのプラン料金でサービスをご利用いただけます。',
  },
  {
    id: 3,
    question: '停止後に再開するにはどうすればいいですか？',
    answer: '運営チームまでメールまたは管理画面のお問い合わせフォームからご連絡ください。通常1〜2営業日以内に再開手続きを行います。',
  },
  {
    id: 4,
    question: 'プランの変更と停止はどちらが先に適用されますか？',
    answer: 'プラン変更申請と停止申請を同時に行った場合、停止申請が優先されます。プラン変更は停止が解除された後に改めて申請してください。',
  },
]


export default function SuspensionPage() {
  const [currentStatus, setCurrentStatus] = useState<'active' | 'pending_suspension' | 'suspended'>('active')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [suspensionModal, setSuspensionModal] = useState({ isOpen: false })
  const [adminAuthModalOpen, setAdminAuthModalOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminAuthError, setAdminAuthError] = useState('')
  const [showAdminPassword, setShowAdminPassword] = useState(false)
  const [cancelModal, setCancelModal] = useState({ isOpen: false })
  const [emergencyModal, setEmergencyModal] = useState({ isOpen: false, reason: '' })
  const [faqOpen, setFaqOpen] = useState<Record<number, boolean>>({})

  // TODO: 実データに差替え
  const applyDate = '2026-02-15'
  const scheduledDate = '2026-03-15'
  const daysRemaining = 28

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 3000)
  }

  const toggleFaq = (id: number) => {
    setFaqOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSuspensionApplyClick = () => {
    setSuspensionModal({ isOpen: false })
    setAdminAuthModalOpen(true)
    setAdminPassword('')
    setAdminAuthError('')
  }

  const handleAdminAuthConfirm = () => {
    if (!adminPassword.trim()) {
      setAdminAuthError('パスワードを入力してください')
      return
    }
    // TODO: Phase 4 - Supabaseで管理者認証・一時停止処理
    setCurrentStatus('pending_suspension')
    setAdminAuthModalOpen(false)
    setAdminPassword('')
    setAdminAuthError('')
    showToast('一時停止を申請しました')
  }

  const handleCancelConfirm = () => {
    setCurrentStatus('active')
    showToast('申請を取り消しました')
    setCancelModal({ isOpen: false })
  }

  const handleEmergencyConfirm = () => {
    showToast('緊急停止申請を送信しました。運営チームが確認次第ご連絡いたします。')
    setEmergencyModal({ isOpen: false, reason: '' })
    // TODO: Supabaseに保存, // TODO: 運営に通知
  }

  const getStatusLabel = () => {
    switch (currentStatus) {
      case 'active':
        return '稼働中'
      case 'pending_suspension':
        return '一時停止申請済み'
      case 'suspended':
        return '停止中'
      default:
        return '稼働中'
    }
  }

  const getStatusColor = () => {
    switch (currentStatus) {
      case 'active':
        return 'text-emerald-700'
      case 'pending_suspension':
        return 'text-amber-700'
      case 'suspended':
        return 'text-gray-600'
      default:
        return 'text-emerald-700'
    }
  }

  const getStatusDotColor = () => {
    switch (currentStatus) {
      case 'active':
        return 'bg-emerald-500'
      case 'pending_suspension':
        return 'bg-amber-500'
      case 'suspended':
        return 'bg-gray-500'
      default:
        return 'bg-emerald-500'
    }
  }

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* セクション1: ヘッダー */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">停止申請</h1>
          <p className="text-sm text-gray-500 mt-1">サービスの一時停止・緊急停止の申請ができます</p>
        </div>

        {/* セクション2: 現在のステータスカード */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full shrink-0 ${getStatusDotColor()}`} />
              <span className={`font-semibold ${getStatusColor()}`}>
                現在のステータス: {getStatusLabel()}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              スタンダード | 契約開始日: 2025-04-01
            </p>
          </div>
          {/* TODO: 実データに差替え */}
        </div>

        {/* セクション3: 一時停止申請カード */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <PauseIcon className="w-5 h-5 text-amber-500 shrink-0" />
            一時停止申請
          </h2>

          {currentStatus === 'active' && (
            <>
              <p className="text-sm text-gray-600 leading-relaxed mb-2">
                一時停止を申請すると、申請日から1ヶ月後にサービスが自動停止します。
              </p>
              <p className="text-sm text-gray-600 leading-relaxed mb-2">
                停止前であればいつでも取り消し可能です。
              </p>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                停止中は新規面接の受付が停止されますが、既存データの閲覧は引き続き可能です。
              </p>
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-4">
                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                  <li>停止中も月額費用は停止予定日まで発生します</li>
                  <li>停止後の再開は運営へのお問い合わせが必要です</li>
                  <li>停止中は応募者が面接URLにアクセスできなくなります</li>
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setSuspensionModal({ isOpen: true })}
                className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
              >
                一時停止を申請する
              </button>
            </>
          )}

          {currentStatus === 'pending_suspension' && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700">申請日: {applyDate}</p>
                <p className="text-sm text-gray-700 font-semibold mt-1">停止予定日: {scheduledDate}</p>
                <p className="text-sm text-amber-600 mt-1">残り{daysRemaining}日で停止されます</p>
              </div>
              {/* TODO: 実データに差替え */}
              <button
                type="button"
                onClick={() => setCancelModal({ isOpen: true })}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
              >
                申請を取り消す
              </button>
            </>
          )}
        </div>

        {/* セクション4: 緊急停止申請カード */}
        <div className="bg-white border border-red-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <AlertIcon className="w-5 h-5 text-red-500 shrink-0" />
            緊急停止申請
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-2">
            緊急停止は運営チームの承認後に即時適用されます。
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            不正利用やセキュリティ上の問題が発生した場合にご利用ください。
          </p>
          <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-4">
            <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
              <li>緊急停止は即時適用のため、進行中の面接も中断されます</li>
              <li>運営チームの承認が必要です（通常1営業日以内）</li>
              <li>緊急停止後の再開には運営との協議が必要です</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setEmergencyModal({ isOpen: true, reason: '' })}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
          >
            緊急停止を申請する
          </button>
        </div>

        {/* セクション5: よくある質問 */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">よくある質問</h2>
          <div className="space-y-0">
            {FAQ_ITEMS.map((item) => (
              <div key={item.id} className="border-b border-gray-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleFaq(item.id)}
                  className="w-full flex items-center justify-between cursor-pointer py-3 text-left"
                >
                  <span className="text-sm font-medium text-gray-800 pr-4">{item.question}</span>
                  <span className="shrink-0 transition-transform duration-200">
                    {faqOpen[item.id] ? (
                      <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </span>
                </button>
                {faqOpen[item.id] && (
                  <p className="text-sm text-gray-600 leading-relaxed py-3">{item.answer}</p>
                )}
              </div>
            ))}
          </div>
          {/* TODO: 実データに差替え */}
        </div>
      </div>

      {/* 一時停止確認モーダル */}
      {suspensionModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">一時停止を申請しますか？</h3>
            <p className="text-sm text-gray-600 mt-2">
              申請日から1ヶ月後（2026年3月15日）にサービスが停止されます。停止前であれば取り消し可能です。
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleSuspensionApplyClick}
                className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                申請する
              </button>
              <button
                type="button"
                onClick={() => setSuspensionModal({ isOpen: false })}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 管理者認証モーダル */}
      {adminAuthModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">管理者認証</h3>
            <p className="text-sm text-gray-600 mt-2">
              一時停止の申請には管理者用パスワードが必要です。
            </p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
              <div className="relative">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value)
                    setAdminAuthError('')
                  }}
                  placeholder="管理者用パスワードを入力"
                  className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showAdminPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
              {adminAuthError && <p className="mt-1.5 text-sm text-red-600">{adminAuthError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setAdminAuthModalOpen(false)
                  setAdminPassword('')
                  setAdminAuthError('')
                }}
                className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleAdminAuthConfirm}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                認証して申請
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 取消確認モーダル */}
      {cancelModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">申請を取り消しますか？</h3>
            <p className="text-sm text-gray-600 mt-2">
              一時停止申請を取り消すと、サービスは通常通り継続されます。
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleCancelConfirm}
                className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                取り消す
              </button>
              <button
                type="button"
                onClick={() => setCancelModal({ isOpen: false })}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 緊急停止モーダル */}
      {emergencyModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-red-600">緊急停止を申請しますか？</h3>
            <p className="text-sm text-gray-600 mt-2">
              緊急停止は運営の承認後に即時適用されます。
            </p>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">停止理由（必須）</label>
              <textarea
                value={emergencyModal.reason}
                onChange={(e) => setEmergencyModal((prev) => ({ ...prev, reason: e.target.value }))}
                rows={4}
                placeholder="緊急停止が必要な理由をご入力ください"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={handleEmergencyConfirm}
                disabled={!emergencyModal.reason.trim()}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                申請する
              </button>
              <button
                type="button"
                onClick={() => setEmergencyModal({ isOpen: false, reason: '' })}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toastVisible && (
        <div className="fixed top-6 right-6 z-50 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-800">
          {toastMessage}
        </div>
      )}
    </>
  )
}

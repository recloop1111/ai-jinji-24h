'use client'

import { useState } from 'react'
import { Save as SaveIcon, Upload as UploadIcon, Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react'

type TabType = 'general' | 'notifications' | 'security'

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
              className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            認証して実行
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [toast, setToast] = useState(false)

  // 一般タブの状態
  const [companyName, setCompanyName] = useState('株式会社サンプル')
  const [interviewUrl] = useState('https://ai-jinji24h.com/interview/sample')

  // 通知タブの状態
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [notificationEmail, setNotificationEmail] = useState('contact@example.com')

  // セキュリティタブの状態 - ログインパスワード変更
  const [loginCurrentPassword, setLoginCurrentPassword] = useState('')
  const [loginNewPassword, setLoginNewPassword] = useState('')
  const [loginConfirmPassword, setLoginConfirmPassword] = useState('')
  const [showLoginCurrentPassword, setShowLoginCurrentPassword] = useState(false)
  const [showLoginNewPassword, setShowLoginNewPassword] = useState(false)
  const [showLoginConfirmPassword, setShowLoginConfirmPassword] = useState(false)
  const [loginAuthModalOpen, setLoginAuthModalOpen] = useState(false)

  // セキュリティタブの状態 - 管理者用パスワード変更
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('')
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('')
  const [showAdminCurrentPassword, setShowAdminCurrentPassword] = useState(false)
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false)
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false)
  const [adminAuthModalOpen, setAdminAuthModalOpen] = useState(false)

  // 二要素認証
  const [twoFactorAuth, setTwoFactorAuth] = useState(false)

  const showToast = () => {
    setToast(true)
    setTimeout(() => setToast(false), 2000)
  }

  const handleSave = () => {
    // TODO: Phase 4 - Supabaseと連携
    showToast()
  }

  const handleLoginPasswordChange = () => {
    // TODO: Phase 4 - Supabaseでログインパスワード変更
    setLoginCurrentPassword('')
    setLoginNewPassword('')
    setLoginConfirmPassword('')
    showToast()
  }

  const handleAdminPasswordChange = () => {
    // TODO: Phase 4 - Supabaseで管理者用パスワード変更
    setAdminCurrentPassword('')
    setAdminNewPassword('')
    setAdminConfirmPassword('')
    showToast()
  }

  const tabs = [
    { id: 'general' as TabType, label: '一般' },
    { id: 'notifications' as TabType, label: '通知' },
    { id: 'security' as TabType, label: 'セキュリティ' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">企業設定</h1>
      </div>

      {/* タブ */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* タブコンテンツ */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {/* 一般タブ */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                企業名
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="企業名を入力"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                企業ロゴ
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                <UploadIcon className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-600 mb-2">
                  画像をドラッグ＆ドロップまたは
                </p>
                <button
                  type="button"
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  ファイルを選択
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  PNG、JPG形式、最大5MB
                </p>
              </div>
              {/* TODO: Phase 4 - Supabase Storageに画像をアップロード */}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                面接URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={interviewUrl}
                  readOnly
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(interviewUrl)
                    showToast()
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  コピー
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                このURLを応募者に共有してください
              </p>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                <SaveIcon className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        )}

        {/* 通知タブ */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    メール通知
                  </label>
                  <p className="text-xs text-slate-500">
                    面接完了や応募者情報の更新をメールで通知します
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailNotifications(!emailNotifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    emailNotifications ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      emailNotifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                通知先メールアドレス
              </label>
              <input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                disabled={!emailNotifications}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                placeholder="notification@example.com"
              />
            </div>

            <div className="pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                <SaveIcon className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>
        )}

        {/* セキュリティタブ */}
        {activeTab === 'security' && (
          <div className="space-y-8">
            {/* セクションA: ログインパスワード変更 */}
            <div>
              <h3 className="text-base font-semibold text-slate-900 mb-4">ログインパスワード変更</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    現在のログインパスワード
                  </label>
                  <div className="relative">
                    <input
                      type={showLoginCurrentPassword ? 'text' : 'password'}
                      value={loginCurrentPassword}
                      onChange={(e) => setLoginCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="現在のログインパスワードを入力"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginCurrentPassword(!showLoginCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showLoginCurrentPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    新しいログインパスワード
                  </label>
                  <div className="relative">
                    <input
                      type={showLoginNewPassword ? 'text' : 'password'}
                      value={loginNewPassword}
                      onChange={(e) => setLoginNewPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="新しいログインパスワードを入力"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginNewPassword(!showLoginNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showLoginNewPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    8文字以上、英数字と記号を含む
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    新しいログインパスワード（確認）
                  </label>
                  <div className="relative">
                    <input
                      type={showLoginConfirmPassword ? 'text' : 'password'}
                      value={loginConfirmPassword}
                      onChange={(e) => setLoginConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="新しいログインパスワードを再入力"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginConfirmPassword(!showLoginConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showLoginConfirmPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setLoginAuthModalOpen(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    変更する
                  </button>
                </div>
              </div>
            </div>

            {/* セクションB: 管理者用パスワード変更 */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-base font-semibold text-slate-900 mb-2">管理者用パスワード変更</h3>
              <p className="text-sm text-slate-600 mb-4">
                管理者用パスワードはCSV出力や重要な設定変更時に必要です
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    現在の管理者用パスワード
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminCurrentPassword ? 'text' : 'password'}
                      value={adminCurrentPassword}
                      onChange={(e) => setAdminCurrentPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="現在の管理者用パスワードを入力"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminCurrentPassword(!showAdminCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showAdminCurrentPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    新しい管理者用パスワード
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminNewPassword ? 'text' : 'password'}
                      value={adminNewPassword}
                      onChange={(e) => setAdminNewPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="新しい管理者用パスワードを入力"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminNewPassword(!showAdminNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showAdminNewPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    8文字以上、英数字と記号を含む
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    新しい管理者用パスワード（確認）
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminConfirmPassword ? 'text' : 'password'}
                      value={adminConfirmPassword}
                      onChange={(e) => setAdminConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="新しい管理者用パスワードを再入力"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminConfirmPassword(!showAdminConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showAdminConfirmPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setAdminAuthModalOpen(true)}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    変更する
                  </button>
                </div>
              </div>
            </div>

            {/* 二要素認証 */}
            <div className="pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    二要素認証（2FA）
                  </label>
                  <p className="text-xs text-slate-500">
                    ログイン時に追加の認証コードが必要になります
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTwoFactorAuth(!twoFactorAuth)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    twoFactorAuth ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      twoFactorAuth ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* トースト */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl shadow-lg">
          保存しました
        </div>
      )}

      {/* 管理者認証モーダル - ログインパスワード変更用 */}
      <AdminAuthModal
        isOpen={loginAuthModalOpen}
        onClose={() => setLoginAuthModalOpen(false)}
        onConfirm={handleLoginPasswordChange}
      />

      {/* 管理者認証モーダル - 管理者用パスワード変更用 */}
      <AdminAuthModal
        isOpen={adminAuthModalOpen}
        onClose={() => setAdminAuthModalOpen(false)}
        onConfirm={handleAdminPasswordChange}
      />

      {/* TODO: Phase 4 - Supabaseと連携 */}
    </div>
  )
}

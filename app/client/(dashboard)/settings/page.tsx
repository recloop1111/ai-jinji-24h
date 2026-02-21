'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Save as SaveIcon, Upload as UploadIcon, Eye as EyeIcon, EyeOff as EyeOffIcon, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'

type TabType = 'general' | 'notifications' | 'security'

// 管理者認証モーダル（管理者用パスワード変更用・TODO: Supabase連携）
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

type CompanyForm = {
  name: string
  contact_person: string
  contact_email: string
  phone: string
}

function SettingsContent() {
  const router = useRouter()
  const { companyId, loading: companyIdLoading, error: companyIdError } = useCompanyId()
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [toast, setToast] = useState<string | null>(null)

  // 企業情報（一般タブ）
  const [company, setCompany] = useState<CompanyForm | null>(null)
  const [companyLoading, setCompanyLoading] = useState(true)
  const [companySaving, setCompanySaving] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanyForm>({
    name: '',
    contact_person: '',
    contact_email: '',
    phone: '',
  })
  const [interviewUrl, setInterviewUrl] = useState('')

  // 通知タブ
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [notificationEmail, setNotificationEmail] = useState('')

  // セキュリティ - ログインパスワード変更
  const [loginCurrentPassword, setLoginCurrentPassword] = useState('')
  const [loginNewPassword, setLoginNewPassword] = useState('')
  const [loginConfirmPassword, setLoginConfirmPassword] = useState('')
  const [loginPasswordError, setLoginPasswordError] = useState('')
  const [loginPasswordLoading, setLoginPasswordLoading] = useState(false)
  const [showLoginCurrentPassword, setShowLoginCurrentPassword] = useState(false)
  const [showLoginNewPassword, setShowLoginNewPassword] = useState(false)
  const [showLoginConfirmPassword, setShowLoginConfirmPassword] = useState(false)

  // 管理者用パスワード変更
  const [adminCurrentPassword, setAdminCurrentPassword] = useState('')
  const [adminNewPassword, setAdminNewPassword] = useState('')
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('')
  const [showAdminCurrentPassword, setShowAdminCurrentPassword] = useState(false)
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false)
  const [showAdminConfirmPassword, setShowAdminConfirmPassword] = useState(false)
  const [adminAuthModalOpen, setAdminAuthModalOpen] = useState(false)

  const [twoFactorAuth, setTwoFactorAuth] = useState(false)

  const showToastMessage = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  // 企業情報取得
  useEffect(() => {
    if (!companyId) {
      setCompanyLoading(false)
      return
    }
    let cancelled = false
    setCompanyLoading(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('name, contact_person, contact_email, phone, email, interview_slug')
        .eq('id', companyId)
        .single()
      if (cancelled) return
      if (error || !data) {
        setCompany(null)
        setCompanyLoading(false)
        return
      }
      const form = {
        name: data.name ?? '',
        contact_person: data.contact_person ?? '',
        contact_email: data.contact_email ?? data.email ?? '',
        phone: data.phone ?? '',
      }
      setCompany(form)
      setCompanyForm(form)
      setInterviewUrl(
        data.interview_slug
          ? `${typeof window !== 'undefined' ? window.location.origin : ''}/interview/${data.interview_slug}`
          : ''
      )
      setCompanyLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyId])

  const handleSaveCompany = async () => {
    if (!companyId) return
    setCompanySaving(true)
    const { error } = await supabase
      .from('companies')
      .update({
        name: companyForm.name,
        contact_person: companyForm.contact_person,
        contact_email: companyForm.contact_email,
        phone: companyForm.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId)
    setCompanySaving(false)
    if (error) {
      showToastMessage('保存に失敗しました: ' + error.message)
      return
    }
    setCompany({ ...companyForm })
    showToastMessage('企業情報を保存しました')
  }

  const handleLoginPasswordChange = async () => {
    setLoginPasswordError('')
    if (loginNewPassword !== loginConfirmPassword) {
      setLoginPasswordError('新しいパスワードと確認用が一致しません')
      return
    }
    if (!loginNewPassword.trim()) {
      setLoginPasswordError('新しいパスワードを入力してください')
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setLoginPasswordError('ログイン情報を取得できませんでした')
      return
    }
    setLoginPasswordLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: loginCurrentPassword,
    })
    if (signInError) {
      setLoginPasswordLoading(false)
      setLoginPasswordError('現在のパスワードが正しくありません')
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: loginNewPassword })
    setLoginPasswordLoading(false)
    if (updateError) {
      setLoginPasswordError(updateError.message)
      return
    }
    setLoginCurrentPassword('')
    setLoginNewPassword('')
    setLoginConfirmPassword('')
    showToastMessage('パスワードを変更しました')
  }

  const handleAdminPasswordChange = () => {
    setAdminCurrentPassword('')
    setAdminNewPassword('')
    setAdminConfirmPassword('')
    showToastMessage('管理者用パスワードの変更は今後実装予定です')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/client/login')
    router.refresh()
  }

  const tabs = [
    { id: 'general' as TabType, label: '一般' },
    { id: 'notifications' as TabType, label: '通知' },
    { id: 'security' as TabType, label: 'セキュリティ' },
  ]

  const cardClass = 'bg-white rounded-xl border border-slate-200 shadow-sm p-6'

  if (companyIdLoading || companyIdError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">企業設定</h1>
        {companyIdLoading && (
          <div className="flex items-center justify-center py-16">
            <span className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {companyIdError && !companyIdLoading && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-sm">
            {companyIdError}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">企業設定</h1>
      </div>

      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 一般タブ */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <h2 className="text-base font-semibold text-slate-900 mb-4">企業情報</h2>
            {companyLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">企業名</label>
                  <input
                    type="text"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="企業名を入力"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">担当者名</label>
                  <input
                    type="text"
                    value={companyForm.contact_person}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, contact_person: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="担当者名を入力"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">メールアドレス</label>
                  <input
                    type="email"
                    value={companyForm.contact_email}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, contact_email: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="contact@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">電話番号</label>
                  <input
                    type="tel"
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="03-1234-5678"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveCompany}
                  disabled={companySaving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70"
                >
                  <SaveIcon className="w-4 h-4" />
                  {companySaving ? '保存中...' : '保存'}
                </button>
              </div>
            )}
          </div>

          <div className={cardClass}>
            <h2 className="text-base font-semibold text-slate-900 mb-2">企業ロゴ</h2>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
              <UploadIcon className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-2">画像をドラッグ＆ドロップまたは</p>
              <button
                type="button"
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
              >
                ファイルを選択
              </button>
              <p className="text-xs text-slate-500 mt-2">PNG、JPG形式、最大5MB</p>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-base font-semibold text-slate-900 mb-2">面接URL</h2>
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
                  if (interviewUrl) {
                    navigator.clipboard.writeText(interviewUrl)
                    showToastMessage('コピーしました')
                  }
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                コピー
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">このURLを応募者に共有してください</p>
          </div>
        </div>
      )}

      {/* 通知タブ */}
      {activeTab === 'notifications' && (
        <div className={cardClass}>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">メール通知</label>
                <p className="text-xs text-slate-500">面接完了や応募者情報の更新をメールで通知します</p>
              </div>
              <button
                type="button"
                onClick={() => setEmailNotifications(!emailNotifications)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  emailNotifications ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    emailNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">通知先メールアドレス</label>
              <input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                disabled={!emailNotifications}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                placeholder="notification@example.com"
              />
            </div>
            <button
              type="button"
              onClick={() => showToastMessage('保存しました')}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <SaveIcon className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>
      )}

      {/* セキュリティタブ */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 mb-4">ログインパスワード変更</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">パスワードポリシー</h4>
              <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                <li>12文字以上（大文字・小文字・数字・特殊文字を各1文字以上含む）</li>
                <li>定期的なパスワード変更は不要です（NISTガイドライン準拠）</li>
                <li>パスワード漏洩が検知された場合のみ、変更をお願いします</li>
              </ul>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">現在のパスワード</label>
                <div className="relative">
                  <input
                    type={showLoginCurrentPassword ? 'text' : 'password'}
                    value={loginCurrentPassword}
                    onChange={(e) => setLoginCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="現在のパスワードを入力"
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
                <label className="block text-sm font-medium text-slate-700 mb-2">新しいパスワード</label>
                <div className="relative">
                  <input
                    type={showLoginNewPassword ? 'text' : 'password'}
                    value={loginNewPassword}
                    onChange={(e) => setLoginNewPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="新しいパスワードを入力"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginNewPassword(!showLoginNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showLoginNewPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">12文字以上、大文字・小文字・数字・特殊文字を各1文字以上含む</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">新しいパスワード（確認）</label>
                <div className="relative">
                  <input
                    type={showLoginConfirmPassword ? 'text' : 'password'}
                    value={loginConfirmPassword}
                    onChange={(e) => setLoginConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="新しいパスワードを再入力"
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
              {loginPasswordError && <p className="text-sm text-red-600">{loginPasswordError}</p>}
              <button
                type="button"
                onClick={handleLoginPasswordChange}
                disabled={loginPasswordLoading}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70"
              >
                {loginPasswordLoading ? '変更中...' : '変更する'}
              </button>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 mb-2">管理者用パスワード変更</h3>
            <p className="text-sm text-slate-600 mb-4">管理者用パスワードはCSV出力や重要な設定変更時に必要です</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">現在の管理者用パスワード</label>
                <div className="relative">
                  <input
                    type={showAdminCurrentPassword ? 'text' : 'password'}
                    value={adminCurrentPassword}
                    onChange={(e) => setAdminCurrentPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="現在の管理者用パスワードを入力"
                  />
                  <button type="button" onClick={() => setShowAdminCurrentPassword(!showAdminCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showAdminCurrentPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">新しい管理者用パスワード</label>
                <div className="relative">
                  <input
                    type={showAdminNewPassword ? 'text' : 'password'}
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="新しい管理者用パスワードを入力"
                  />
                  <button type="button" onClick={() => setShowAdminNewPassword(!showAdminNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showAdminNewPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">12文字以上、大文字・小文字・数字・特殊文字を各1文字以上含む</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">新しい管理者用パスワード（確認）</label>
                <div className="relative">
                  <input
                    type={showAdminConfirmPassword ? 'text' : 'password'}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="新しい管理者用パスワードを再入力"
                  />
                  <button type="button" onClick={() => setShowAdminConfirmPassword(!showAdminConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showAdminConfirmPassword ? <EyeOffIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminAuthModalOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                変更する
              </button>
            </div>
          </div>

          <div className={cardClass}>
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">二要素認証（2FA）</label>
                <p className="text-xs text-slate-500">
                  ログイン時にGoogle AuthenticatorなどのTOTPアプリで生成される6桁のコードが必要になります。アカウントの不正アクセス防止のため、有効化を強く推奨します。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTwoFactorAuth(!twoFactorAuth)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  twoFactorAuth ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${twoFactorAuth ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 mb-3">アカウント保護について</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-slate-700">セッション管理</h4>
                <p className="text-xs text-slate-500 mt-1">最終操作から24時間が経過すると自動的にログアウトされます。複数デバイスからの同時ログインに制限はありません。</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700">アカウントロック</h4>
                <p className="text-xs text-slate-500 mt-1">ログインに10回連続で失敗すると、30分間アカウントがロックされます。30分経過後に自動で解除されます。ロック中にお急ぎの場合は運営までご連絡ください。</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700">ログイン通知</h4>
                <p className="text-xs text-slate-500 mt-1">通常と異なるIPアドレスや地域からのログインが検知された場合、登録メールアドレスに通知が送信されます。</p>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 mb-2">ログアウト</h3>
            <p className="text-sm text-slate-600 mb-4">このアカウントからログアウトします。</p>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-300"
            >
              <LogOut className="w-4 h-4" />
              ログアウト
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-slate-900 text-white text-sm font-medium rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <AdminAuthModal
        isOpen={adminAuthModalOpen}
        onClose={() => setAdminAuthModalOpen(false)}
        onConfirm={handleAdminPasswordChange}
      />
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-500">読み込み中...</div></div>}>
      <SettingsContent />
    </Suspense>
  )
}

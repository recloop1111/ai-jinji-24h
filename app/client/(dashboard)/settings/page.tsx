'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Save as SaveIcon, Upload as UploadIcon, Eye as EyeIcon, EyeOff as EyeOffIcon, LogOut } from 'lucide-react'
import { createClientBrowserClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'
import PasswordInput from '@/components/shared/PasswordInput'

type TabType = 'general' | 'notifications' | 'security'

type CompanyForm = {
  name: string
  contact_person: string
  contact_email: string
  phone: string
}

function SettingsContent() {
  const router = useRouter()
  const { companyId, loading: companyIdLoading, error: companyIdError } = useCompanyId()
  const supabase = createClientBrowserClient()

  const [activeTab, setActiveTab] = useState<TabType>('general')
  const [toast, setToast] = useState<string | null>(null)

  // 企業情報（一般タブ）
  const [, setCompany] = useState<CompanyForm | null>(null)
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



  // 管理者設定用パスワード（ログインPWとは別）
  const [settingPwConfigured, setSettingPwConfigured] = useState<boolean | null>(null)
  const [settingPwCurrent, setSettingPwCurrent] = useState('')
  const [settingPwNew, setSettingPwNew] = useState('')
  const [settingPwConfirm, setSettingPwConfirm] = useState('')
  const [settingPwError, setSettingPwError] = useState('')
  const [settingPwLoading, setSettingPwLoading] = useState(false)

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

  // 管理者設定用パスワードの設定状況を取得
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/client/security/setting-password')
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        setSettingPwConfigured(res.ok ? !!json.configured : false)
      } catch {
        if (!cancelled) setSettingPwConfigured(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSettingPasswordSubmit = async () => {
    setSettingPwError('')
    if (!settingPwNew || !settingPwConfirm) {
      setSettingPwError('新しいパスワードを入力してください')
      return
    }
    if (settingPwNew.length < 8) {
      setSettingPwError('パスワードは8文字以上で設定してください')
      return
    }
    if (settingPwNew !== settingPwConfirm) {
      setSettingPwError('新しいパスワードと確認用パスワードが一致しません')
      return
    }
    if (settingPwConfigured && !settingPwCurrent) {
      setSettingPwError('現在の管理者設定用パスワードを入力してください')
      return
    }
    const wasConfigured = settingPwConfigured
    setSettingPwLoading(true)
    try {
      const res = await fetch('/api/client/security/setting-password', {
        method: wasConfigured ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          wasConfigured
            ? { currentPassword: settingPwCurrent, newPassword: settingPwNew }
            : { newPassword: settingPwNew },
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSettingPwError(json?.error?.message ?? '保存に失敗しました')
        return
      }
      setSettingPwConfigured(true)
      setSettingPwCurrent('')
      setSettingPwNew('')
      setSettingPwConfirm('')
      showToastMessage(wasConfigured ? '管理者設定用パスワードを変更しました' : '管理者設定用パスワードを設定しました')
    } catch {
      setSettingPwError('保存に失敗しました')
    } finally {
      setSettingPwLoading(false)
    }
  }

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
                <li>8文字以上で設定してください</li>
                <li>定期的なパスワード変更は求めていません</li>
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
                <p className="text-xs text-slate-500 mt-1">8文字以上で設定してください</p>
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

          {/* 管理者設定用パスワード（ログインPWとは別） */}
          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 mb-2">管理者設定用パスワード</h3>
            <p className="text-sm text-slate-600 mb-3">
              翌月の月間上限変更、CSV出力、重要設定の変更時に使用するパスワードです。ログインパスワードとは別に管理してください。
            </p>
            <p className="text-xs mb-4">
              {settingPwConfigured === null
                ? <span className="text-slate-400">状態を確認中...</span>
                : settingPwConfigured
                  ? <span className="text-emerald-600 font-medium">設定済み</span>
                  : <span className="text-amber-600 font-medium">未設定</span>}
            </p>
            <div className="space-y-4">
              {settingPwConfigured && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">現在の管理者設定用パスワード</label>
                  <PasswordInput
                    value={settingPwCurrent}
                    onChange={setSettingPwCurrent}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="現在の管理者設定用パスワードを入力"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">新しい管理者設定用パスワード</label>
                <PasswordInput
                  value={settingPwNew}
                  onChange={setSettingPwNew}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="新しいパスワードを入力"
                />
                <p className="text-xs text-slate-500 mt-1">8文字以上で設定してください</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">新しい管理者設定用パスワード（確認）</label>
                <PasswordInput
                  value={settingPwConfirm}
                  onChange={setSettingPwConfirm}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="新しいパスワードを再入力"
                />
              </div>
              {settingPwError && <p className="text-sm text-red-600">{settingPwError}</p>}
              <button
                type="button"
                onClick={handleSettingPasswordSubmit}
                disabled={settingPwLoading || settingPwConfigured === null}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70"
              >
                {settingPwLoading ? '保存中...' : settingPwConfigured ? '変更する' : '設定する'}
              </button>
            </div>
          </div>

          <div className={cardClass}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">二要素認証（2FA）</label>
              <p className="text-xs text-slate-500">
                TOTPアプリ（Google Authenticator等）による二要素認証は未実装です（今後実装予定）。現在は設定できません。
              </p>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 mb-3">アカウント保護について</h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div>
                <h4 className="text-sm font-medium text-slate-700">セッション管理</h4>
                <p className="text-xs text-slate-500 mt-1">運営・企業のセッションは別cookieで分離済みです。無操作タイムアウトの独自制御は未実装で、セッション期限は認証基盤（Supabase Auth）の既定に依存します。複数デバイスからの同時ログインに制限はありません。</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700">アカウントロック</h4>
                <p className="text-xs text-slate-500 mt-1">ロック管理用の基盤はありますが、ログイン失敗回数に基づく自動ロックは現在未実装です。</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-700">ログイン通知</h4>
                <p className="text-xs text-slate-500 mt-1">通常と異なるIPアドレスや地域からのログインを検知してメール通知する機能は未実装です（今後実装予定）。</p>
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

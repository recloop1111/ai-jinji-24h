'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ClientLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const validate = () => {
    const next: { email?: string; password?: string } = {}
    if (!email.trim()) next.email = 'メールアドレスを入力してください'
    else if (!EMAIL_REGEX.test(email.trim())) next.email = '正しいメールアドレスを入力してください'
    if (!resetMode && !password) next.password = 'パスワードを入力してください'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) return

    setLoading(true)
    // TODO: Supabase認証実装
    await new Promise((r) => setTimeout(r, 500))
    setLoading(false)
    router.push('/client/dashboard')
  }

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (!email.trim()) {
      setErrors({ email: 'メールアドレスを入力してください' })
      return
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setErrors({ email: '正しいメールアドレスを入力してください' })
      return
    }
    setErrors({})
    setLoading(true)
    // TODO: パスワードリセット実装
    await new Promise((r) => setTimeout(r, 500))
    setResetSent(true)
    setLoading(false)
  }

  if (resetMode && resetSent) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0">
          <div className="lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-16 lg:py-24">
            <div className="w-full max-w-md mx-auto lg:mx-0">
              <h1 className="text-2xl font-bold text-slate-900">AI人事24h</h1>
              <p className="mt-2 text-slate-600">パスワードリセット用のメールを送信しました。メールをご確認ください。</p>
              <button
                type="button"
                onClick={() => { setResetMode(false); setResetSent(false); setEmail('') }}
                className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                ログインに戻る
              </button>
            </div>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-slate-400">© 2025 AI人事24h</footer>
      </div>
    )
  }

  if (resetMode) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0">
          <div className="lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-16 lg:py-24">
            <div className="w-full max-w-md mx-auto lg:mx-0">
              <h1 className="text-2xl font-bold text-slate-900">AI人事24h</h1>
              <p className="mt-2 text-slate-600">パスワードをお忘れの方は、登録メールアドレスを入力してください。</p>
            </div>
          </div>
          <div className="lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-16 lg:py-24 bg-white lg:shadow-[rgba(0,0,0,0.04)_-8px_0_24px]">
            <div className="w-full max-w-md mx-auto lg:mx-0">
              <h2 className="text-lg font-semibold text-slate-900 mb-6">パスワードリセット</h2>
              <form onSubmit={handleResetSubmit}>
                {submitError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{submitError}</div>}
                <div className="mb-6">
                  <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-2">メールアドレス</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })) }}
                    className={`w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      errors.email ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
                    }`}
                    placeholder="example@company.co.jp"
                  />
                  {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email}</p>}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '送信中...' : 'リセットメールを送信'}
                </button>
                <button
                  type="button"
                  onClick={() => { setResetMode(false); setErrors({}); setSubmitError('') }}
                  className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700"
                >
                  ログインに戻る
                </button>
              </form>
            </div>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-slate-400">© 2025 AI人事24h</footer>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="flex-1 flex flex-col lg:flex-row lg:min-h-0">
        {/* 左側: ロゴ・キャッチコピー（PC） / 上部（モバイル） */}
        <div className="lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-16 lg:py-24 order-2 lg:order-1">
          <div className="w-full max-w-md mx-auto lg:mx-0">
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">AI人事24h</h1>
            <p className="mt-4 text-slate-600 leading-relaxed">
              採用業務を、AIが24時間サポート。<br />
              面接・評価・フィードバックまで、すべてを効率化します。
            </p>
            <div className="mt-8 hidden lg:block">
              <div className="flex gap-4 text-sm text-slate-500">
                <span>採用担当者向け</span>
                <span>面接・評価の自動化</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右側: ログインフォーム（PC） / 中央（モバイル） */}
        <div className="lg:w-1/2 flex flex-col justify-center px-6 py-12 lg:px-16 lg:py-24 bg-white lg:shadow-[rgba(0,0,0,0.04)_-8px_0_24px] order-1 lg:order-2">
          <div className="w-full max-w-md mx-auto lg:mx-0">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">ログイン</h2>
            <form onSubmit={handleSubmit}>
              {submitError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">{submitError}</div>}
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">メールアドレス</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); setSubmitError('') }}
                  className={`w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    errors.email ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
                  }`}
                  placeholder="example@company.co.jp"
                />
                {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email}</p>}
              </div>
              <div className="mb-6">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">パスワード</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); setSubmitError('') }}
                    className={`w-full px-4 py-3 pr-12 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      errors.password ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
                    }`}
                    placeholder="パスワード"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors"
                    aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1.5 text-sm text-red-600">{errors.password}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
              <p className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => { setResetMode(true); setErrors({}); setSubmitError('') }}
                  className="text-sm text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  パスワードをお忘れの方
                </button>
              </p>
            </form>
          </div>
        </div>
      </div>
      <footer className="py-4 text-center text-xs text-slate-400">© 2025 AI人事24h</footer>
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PasswordInput from '@/components/shared/PasswordInput'
import TurnstileWidget, { type TurnstileHandle } from '@/components/auth/TurnstileWidget'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, captchaToken }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error?.message || 'ログインに失敗しました')
        // token は単回使用のため、失敗後はウィジェットを reset して再取得
        setCaptchaToken('')
        turnstileRef.current?.reset()
        setLoading(false)
        return
      }
      router.push('/admin/dashboard')
      router.refresh()
    } catch {
      setError('ログインに失敗しました')
      setCaptchaToken('')
      turnstileRef.current?.reset()
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">AI人事24h</h1>
          <p className="text-sm text-slate-400 mt-1">運営管理画面</p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl shadow-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-sm font-medium text-slate-300 mb-1">
                メールアドレス
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-slate-300 mb-1">
                パスワード
              </label>
              <PasswordInput
                id="admin-password"
                value={password}
                onChange={setPassword}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                iconClassName="text-slate-400 hover:text-slate-200"
              />
            </div>
            {TURNSTILE_SITE_KEY && (
              <TurnstileWidget
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                action="admin_login"
                theme="dark"
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken('')}
              />
            )}
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || (!!TURNSTILE_SITE_KEY && !captchaToken)}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ログイン中...
                </>
              ) : (
                'ログイン'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

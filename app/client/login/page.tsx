'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function ClientLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
      return
    }

    router.push('/client/applicants')
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/client/reset-password`,
    })

    if (error) {
      setError('送信に失敗しました。もう一度お試しください。')
      setLoading(false)
      return
    }

    setResetSent(true)
    setLoading(false)
  }

  if (resetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-[400px] bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-gray-900">AI人事24h</h1>
            <p className="text-sm text-gray-600 mt-1">パスワードリセット</p>
          </div>
          {resetSent ? (
            <div className="text-center">
              <p className="text-sm text-gray-700 mb-4">パスワードリセット用のメールを送信しました。メールをご確認ください。</p>
              <button onClick={() => { setResetMode(false); setResetSent(false) }} className="text-sm text-blue-600 hover:text-blue-500">ログインに戻る</button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword}>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded mb-4">{error}</div>}
              <div className="mb-4">
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
                <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="admin@example.com" />
              </div>
              <button type="submit" disabled={loading} className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">{loading ? '送信中...' : 'リセットメールを送信'}</button>
              <div className="text-center mt-4">
                <button type="button" onClick={() => { setResetMode(false); setError('') }} className="text-sm text-blue-600 hover:text-blue-500">ログインに戻る</button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-[400px] bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">AI人事24h</h1>
          <p className="text-sm text-gray-600 mt-1">企業管理画面</p>
        </div>
        <form onSubmit={handleLogin}>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded mb-4">{error}</div>}
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="admin@example.com" />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <div className="relative">
              <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10" placeholder="パスワード" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">{showPassword ? '隠す' : '表示'}</button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50">{loading ? 'ログイン中...' : 'ログイン'}</button>
          <div className="text-center mt-4">
            <button type="button" onClick={() => { setResetMode(true); setError('') }} className="text-sm text-blue-600 hover:text-blue-500">パスワードを忘れた方はこちら</button>
          </div>
        </form>
      </div>
    </div>
  )
}

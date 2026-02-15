'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState<string[]>(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password.trim()) {
      setError('メールアドレスとパスワードを入力してください')
      return
    }
    // TODO: Supabase Authでメール+パスワード認証を実装
    setStep(2)
  }

  const handleCodeChange = useCallback((index: number, value: string) => {
    if (value.length > 1) return
    const digit = value.replace(/\D/g, '')
    const next = [...code]
    next[index] = digit
    setCode(next)
    setError('')
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
    if (next.every((c) => c !== '')) {
      const fullCode = next.join('')
      // TODO: TOTP検証をバックエンドで実装
      if (fullCode === '123456') {
        router.push('/admin')
      } else {
        setError('認証コードが正しくありません')
      }
    }
  }, [code, router])

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
      const next = [...code]
      next[index - 1] = ''
      setCode(next)
    }
  }

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const fullCode = code.join('')
    if (fullCode.length !== 6) {
      setError('6桁の認証コードを入力してください')
      return
    }
    // TODO: TOTP検証をバックエンドで実装
    if (fullCode === '123456') {
      router.push('/admin')
    } else {
      setError('認証コードが正しくありません')
    }
  }

  return (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen flex flex-col items-center">
      <div className="w-full max-w-md mx-auto mt-20 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          {step === 1 ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">AI人事24h</h1>
                <span className="inline-block mt-2 bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  運営管理
                </span>
              </div>
              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700 mb-1">
                    メールアドレス
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:border-gray-900 focus:ring-2 focus:ring-gray-900/20 outline-none transition-colors"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700 mb-1">
                    パスワード
                  </label>
                  <input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:border-gray-900 focus:ring-2 focus:ring-gray-900/20 outline-none transition-colors"
                    autoComplete="current-password"
                  />
                </div>
                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
                <button
                  type="submit"
                  className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold transition-colors"
                >
                  次へ
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2">二段階認証</h2>
              <p className="text-sm text-gray-500 mb-6">
                認証アプリに表示されている6桁のコードを入力してください
              </p>
              <form onSubmit={handleLoginSubmit} className="space-y-6">
                <div className="flex gap-2 justify-center">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={code[i]}
                      onChange={(e) => handleCodeChange(i, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(i, e)}
                      className="w-12 h-14 text-center text-2xl font-bold border border-gray-300 rounded-xl focus:border-gray-900 focus:ring-2 focus:ring-gray-900/20 outline-none transition-colors"
                    />
                  ))}
                </div>
                {error && <p className="text-red-600 text-sm text-center">{error}</p>}
                <button
                  type="submit"
                  className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold transition-colors"
                >
                  ログイン
                </button>
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(''); setCode(['', '', '', '', '', '']) }}
                  className="block w-full text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  戻る
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

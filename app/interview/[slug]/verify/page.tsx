'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VerifyPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [company, setCompany] = useState<{
    id: string
    name: string
    logo_url: string | null
    is_suspended: boolean
    is_demo: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState(['', '', '', ''])
  const [toast, setToast] = useState<string | null>(null)
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    fetchCompany()
  }, [slug])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  async function fetchCompany() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, logo_url, is_suspended, is_demo')
        .eq('interview_slug', slug)
        .single()

      if (error || !data) {
        setCompany(null)
      } else {
        setCompany(data)
      }
    } catch (error) {
      setCompany(null)
    }
    setLoading(false)
  }

  function handleCodeChange(index: number, value: string) {
    // 数字のみ受け付ける
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    // 入力があったら次のボックスにフォーカス
    if (value && index < 3) {
      inputRefs[index + 1].current?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    // バックスペースで前のボックスに戻る
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').slice(0, 4)
    const digits = pastedData.split('').filter((char) => /^\d$/.test(char))
    
    if (digits.length > 0) {
      const newCode = [...code]
      digits.forEach((digit, i) => {
        if (i < 4) {
          newCode[i] = digit
        }
      })
      setCode(newCode)
      
      // 最後に入力された位置にフォーカス
      const focusIndex = Math.min(digits.length - 1, 3)
      inputRefs[focusIndex].current?.focus()
    }
  }

  function handleVerify() {
    const codeString = code.join('')
    if (code.every((digit) => digit !== '')) {
      if (company?.is_demo) {
        // デモモード: 固定コード「1234」で認証通過
        if (codeString === '1234') {
          setToast('認証が完了しました')
          setTimeout(() => {
            router.push(`/interview/${slug}/prepare`)
          }, 1000)
        } else {
          setToast('認証コードが正しくありません')
        }
      } else {
        // TODO: 本番モード - Twilio Verify API に差し替え
        // 現時点ではデモと同じく「1234」で通過
        if (codeString === '1234') {
          setToast('認証が完了しました')
          setTimeout(() => {
            router.push(`/interview/${slug}/prepare`)
          }, 1000)
        } else {
          setToast('認証コードが正しくありません')
        }
      }
    }
  }

  function handleResend() {
    try {
      // TODO: Phase 4 - Supabase経由でのSMS再送信
      // TODO: 段階4 - Supabase接続を本実装する
      // ここでSupabase/API呼び出しを行う予定
    } catch (error) {
      // TODO: 段階4 - Supabase接続を本実装する
    }
    
    setToast('認証コードを再送信しました')
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen flex items-center justify-center">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    )
  }

  const displayCompany = company || { id: '', name: '企業名', logo_url: null, is_suspended: false }
  const isCodeComplete = code.every((digit) => digit !== '')

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen pb-8">
      {/* トースト通知 */}
      {toast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* ロゴと会社名 */}
      <div className="pt-4 pb-3">
        <h1 className="text-blue-700 font-bold text-base text-center">AI人事24h</h1>
        <p className="text-gray-600 text-xs text-center mb-3">{displayCompany.name}</p>
      </div>

      {/* メインカード */}
      <div className="mx-4 sm:max-w-lg sm:mx-auto mt-4 sm:mt-10 bg-white rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-5 sm:p-8 relative overflow-hidden">
        {/* 上部装飾（円形グラデーション） */}
        <div className="absolute top-0 left-0 right-0 h-32 overflow-hidden pointer-events-none">
          <div className="absolute top-[-40px] left-[-20px] w-24 h-24 sm:w-32 sm:h-32 bg-blue-200/30 rounded-full blur-2xl"></div>
          <div className="absolute top-[-30px] right-[-10px] w-24 h-24 sm:w-32 sm:h-32 bg-indigo-200/30 rounded-full blur-2xl"></div>
          <div className="absolute top-[-20px] left-1/2 transform -translate-x-1/2 w-24 h-24 sm:w-32 sm:h-32 bg-sky-200/30 rounded-full blur-2xl"></div>
        </div>

        <div className="relative space-y-5">
          {/* タイトル */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800 text-center">本人確認</h2>
            <p className="text-sm text-gray-500 text-center mt-2">
              ご入力いただいた電話番号にSMSで認証コードを送信しました。<br />
              届いた4桁のコードを入力してください。
            </p>
          </div>

          {/* 電話番号表示 */}
          <div className="text-center">
            <div className="text-gray-700 font-mono bg-gray-50 rounded-lg py-2 px-4 inline-block">
              090-****-5678
            </div>
          </div>

          {/* 認証コード入力 */}
          <div className="flex justify-center gap-3">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={inputRefs[index]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="w-14 h-14 sm:w-16 sm:h-16 text-2xl text-center font-bold border-2 border-gray-200 rounded-xl focus:border-blue-600 focus:outline-none transition-colors"
              />
            ))}
          </div>

          {/* 認証するボタン */}
          <button
            onClick={handleVerify}
            disabled={!isCodeComplete}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            認証する
          </button>

          {/* コードが届かない場合 */}
          <p className="text-center">
            <button
              onClick={handleResend}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              コードが届かない場合
            </button>
          </p>

          {/* 面接をキャンセルする */}
          <p className="text-center">
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-400 hover:text-gray-500 underline"
            >
              面接をキャンセルする
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

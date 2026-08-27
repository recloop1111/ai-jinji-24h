'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Globe, ShieldCheck, Info } from 'lucide-react'
import { StepIndicator } from '@/components/interview/FormComponents'
import { normalizeDigits } from '@/lib/utils/normalizeDigits'

// 応募開始/基本情報入力画面と同一のステップラベル・言語リスト（UI 統一）。ロジックは既存を変更しない。
const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '面接']
const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

export default function VerifyPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

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
  const [codeError, setCodeError] = useState<string | null>(null)
  // 送信先電話番号のマスク（server が /sms/send で返した masked_phone を sessionStorage 経由で受け取る）。
  //   ハードコードしない。実送信していない（demo / 未接続）なら null のまま＝「送信しました」を出さない。
  const [maskedPhone, setMaskedPhone] = useState<string | null>(null)
  // 応募開始/基本情報画面と統一のヘッダー言語切替（表示＋sessionStorage 保存のみ・認証ロジックには非干渉）。
  const [selectedLanguage, setSelectedLanguage] = useState('ja')
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    let cancelled = false
    async function loadCompany() {
      setLoading(true)
      try {
        const res = await fetch(`/api/interview/${slug}/public-config`)
        if (cancelled) return
        const json = await res.json().catch(() => null)
        setCompany(!res.ok || !json?.company ? null : json.company)
      } catch {
        if (!cancelled) setCompany(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadCompany()
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // /sms/send が返した送信先マスク（実送信後のみ存在）を読む。存在しなければ「送信しました」を表示しない。
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(`interview_${slug}_masked_phone`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (m) setMaskedPhone(m)
    } catch {
      /* noop */
    }
  }, [slug])

  // 同一タブで以前選んだ言語があれば表示を合わせる（開始/基本情報画面と同じ sessionStorage キー）。表示同期のための意図的な setState。
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch {
      /* noop */
    }
  }, [slug])

  function handleCodeChange(index: number, rawValue: string) {
    // 全角数字（１２３４）も半角へ正規化してから判定・保持する
    const value = normalizeDigits(rawValue)
    // 数字のみ受け付ける
    if (value && !/^\d$/.test(value)) {
      return
    }

    // 入力を始めたらエラー表示を消す
    if (codeError) setCodeError(null)

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
    // 全角数字を含む貼り付けも半角へ正規化してから抽出
    const pastedData = normalizeDigits(e.clipboardData.getData('text')).slice(0, 4)
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

  async function handleVerify() {
    // 念のため送信前にも半角へ正規化（入力時に正規化済みだが防御的に）
    const codeString = normalizeDigits(code.join(''))
    if (!code.every((digit) => digit !== '')) return

    // 認証判定はサーバー側で行う（固定コード許可はテスト企業の company_id のときのみ）。
    const token = sessionStorage.getItem(`interview_${slug}_token`)
    const applicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    if (!token || !applicantId) {
      setCodeError('セッションの有効期限が切れました。最初からやり直してください。')
      setToast('セッションが無効です')
      return
    }

    setCodeError(null)
    try {
      const res = await fetch(`/api/interview/${slug}/sms/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, applicant_id: applicantId, code: codeString }),
      })
      if (res.ok) {
        // SMS認証完了トークンを保存（start 側で必須検証される）
        const data = await res.json().catch(() => null)
        if (data?.sms_token) {
          sessionStorage.setItem(`interview_${slug}_sms_token`, data.sms_token)
        }
        setToast('認証が完了しました')
        setTimeout(() => {
          router.push(`/interview/${slug}/prepare`)
        }, 1000)
        return
      }
      const data = await res.json().catch(() => null)
      if (res.status === 503 || data?.error?.code === 'SMS_NOT_AVAILABLE') {
        // 通常企業: SMS 未接続（誤コードとは区別して表示）
        setCodeError('SMS認証は現在準備中です。お手数ですが運営までお問い合わせください。')
        setToast('SMS認証は現在準備中です')
      } else {
        // 誤コード: 入力をクリアして先頭にフォーカスし、すぐ再入力できるようにする
        setCodeError('認証コードが正しくありません。もう一度入力してください。')
        setToast('認証コードが正しくありません')
        setCode(['', '', '', ''])
        inputRefs[0].current?.focus()
      }
    } catch {
      setCodeError('通信エラーが発生しました。もう一度お試しください。')
      setToast('通信エラーが発生しました')
    }
  }

  async function handleResend() {
    // 再送も「送信ボタン」を別に作らず /sms/send を再呼び出しする seam。虚偽トーストは出さない。
    const token = sessionStorage.getItem(`interview_${slug}_token`)
    const applicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    if (!token || !applicantId) {
      setToast('セッションが無効です')
      return
    }
    try {
      const res = await fetch(`/api/interview/${slug}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, applicant_id: applicantId }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.sent) {
        if (typeof data.masked_phone === 'string' && data.masked_phone) {
          sessionStorage.setItem(`interview_${slug}_masked_phone`, data.masked_phone)
          setMaskedPhone(data.masked_phone)
        }
        setToast('認証コードを再送信しました')
      } else if (res.status === 503 || data?.error?.code === 'SMS_NOT_AVAILABLE') {
        // 通常企業（provider 未接続）: honest。虚偽の「再送信しました」を出さない。
        setToast('SMS認証は現在準備中です')
      } else {
        setToast(data?.error?.message || '再送信できませんでした')
      }
    } catch {
      setToast('通信エラーが発生しました')
    }
  }

  // 応募開始/基本情報入力画面と統一のヘッダー（会社名 左 ＋ 言語切替 右）。loading/本体で共用。
  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur sm:px-8">
      <span className="truncate text-base font-bold text-slate-900">{company?.name ?? ''}</span>
      <div className="relative flex-shrink-0">
        <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <select
          value={selectedLanguage}
          onChange={(e) => {
            setSelectedLanguage(e.target.value)
            try {
              sessionStorage.setItem(`interview_${slug}_language`, e.target.value)
            } catch {
              /* noop */
            }
          }}
          aria-label="言語を選択"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        {header}
        <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
            <div className="flex items-center justify-center py-12">
              <svg
                className="animate-spin h-8 w-8 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const isCodeComplete = code.every((digit) => digit !== '')
  // デモ企業判定は public-config（server が slug→company を解決した結果）の is_demo のみを表示に使う。
  // 実際の認証可否は sms/verify 側で server が再判定するため、この表示はあくまで UX。
  const isDemo = company?.is_demo === true

  return (
    <div className="min-h-screen bg-slate-100">
      {/* トースト通知 */}
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-6 py-3 text-white shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {header}

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* ステッパー（SMS認証=現在=3）。既存 StepIndicator を流用し Design System へ統一。 */}
        <div className="mb-8">
          <StepIndicator currentStep={3} totalSteps={5} labels={STEP_LABELS} />
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-10">
          {/* 見出し: 本人確認バッジ＋大見出し＋（demo/normal で分岐する）補足。 */}
          <div className="flex flex-col items-center text-center">
            <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-4 ring-blue-50/60">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">本人確認</h1>
            {isDemo ? (
              <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
                これはデモ環境です。SMSは送信されません。<br />
                下記のデモ用コードを入力してください。
              </p>
            ) : maskedPhone ? (
              /* 通常企業（実送信後のみ）: 送信済みを honest に案内。 */
              <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
                ご入力いただいた電話番号にSMSで認証コードを送信しました。<br />
                届いた4桁のコードを入力してください。
              </p>
            ) : (
              /* 通常企業（provider 未接続＝未送信）: 「送信しました」を出さず honest に案内。 */
              <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
                SMS認証は現在準備中です。<br />
                お手数ですが運営までお問い合わせください。
              </p>
            )}
          </div>

          {/* demo 情報ボックス / normal マスク電話番号。demo 情報は is_demo=true のときだけ。 */}
          <div className="mx-auto mt-6 max-w-md">
            {isDemo ? (
              /* デモ企業: 実SMSは送らず固定コードで認証。応募者にデモであることと入力コードを明示する。 */
              <div
                className="flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center"
                role="status"
              >
                <Info className="h-4 w-4 flex-shrink-0 text-blue-500" />
                <p className="text-sm text-blue-800">
                  デモ環境のため、認証コード「
                  <span className="font-mono font-bold tracking-widest text-blue-700">1234</span>
                  」を入力してください。
                </p>
              </div>
            ) : maskedPhone ? (
              /* 通常企業（実送信後のみ）: 送信先電話番号のマスク（server 由来・ハードコードしない）。 */
              <div className="text-center">
                <div className="inline-block rounded-xl bg-slate-50 px-4 py-2 font-mono text-slate-700">{maskedPhone}</div>
              </div>
            ) : null}
          </div>

          {/* 認証コード入力（4桁・正方形寄り・focus で blue ring）。auto-focus/Backspace/paste/normalize は不変。 */}
          <div className="mt-7 flex justify-center gap-3 sm:gap-4">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={inputRefs[index]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                aria-label={`認証コード ${index + 1} 桁目`}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="h-16 w-14 rounded-xl border-2 border-slate-200 bg-white text-center text-2xl font-bold text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 sm:h-[72px] sm:w-[72px]"
              />
            ))}
          </div>

          {codeError && (
            <p className="mt-4 text-center text-sm text-red-600" role="alert">
              {codeError}
            </p>
          )}

          {/* 認証する（ブランドブルー・幅広・開始/基本情報画面の CTA と同じ Design Language）。disabled 条件は不変。 */}
          <button
            onClick={handleVerify}
            disabled={!isCodeComplete}
            className="mt-7 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 active:scale-[0.99] disabled:pointer-events-none disabled:bg-blue-300 disabled:opacity-70 disabled:shadow-none"
          >
            認証する
          </button>

          {/* コードが届かない場合（デモ企業は実SMSを送らないため非表示・handleResend は不変）。 */}
          {!isDemo && (
            <div className="mt-4 text-center">
              <button onClick={handleResend} className="text-sm font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700">
                コードが届かない場合
              </button>
            </div>
          )}

          {/* 面接をキャンセルする（控えめ・router 挙動不変）。 */}
          <div className="mt-3 text-center">
            <button onClick={() => router.back()} className="text-sm text-slate-400 underline underline-offset-2 hover:text-slate-500">
              面接をキャンセルする
            </button>
          </div>

          {/* セキュリティ補助（separator＋shield＋文言。開始/基本情報画面と統一）。 */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              入力いただいた情報は暗号化して安全に管理します
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

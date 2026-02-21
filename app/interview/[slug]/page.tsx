'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User, MessageSquare, Camera, PlayCircle, Video } from 'lucide-react'

const SUPPORT_EMAIL = 'support@ai-jinji24h.com'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

export default function InterviewPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [company, setCompany] = useState<{
    id: string
    name: string
    logo_url: string | null
    interview_slug: string
    is_suspended: boolean
    is_demo: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [consent, setConsent] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState('ja')
  const [showEmail, setShowEmail] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchCompany()
  }, [slug])

  async function fetchCompany() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, logo_url, interview_slug, is_suspended, is_demo')
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

  function handleNext() {
    if (consent) {
      // TODO: reCAPTCHA v3
      router.push(`/interview/${slug}/form`)
    }
  }

  function handleCopyEmail() {
    navigator.clipboard.writeText(SUPPORT_EMAIL).then(() => {
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    })
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

  if (!company) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-center max-w-lg w-full">
          <div className="flex justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">この面接URLは無効です</h2>
          <p className="text-gray-600 text-sm sm:text-base">
            正しいURLをご確認ください。
          </p>
        </div>
      </div>
    )
  }

  if (company.is_suspended) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 text-center max-w-lg w-full">
          <div className="flex justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </div>
          <p className="text-gray-600 text-sm sm:text-base">
            現在、面接の受付を一時停止しております。恐れ入りますが、しばらく経ってから再度お試しください。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen pb-8">
      {/* 言語選択ドロップダウン（上部右端） */}
      <div className="fixed top-4 right-4 z-50">
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="bg-white text-gray-900 text-xs py-1 px-2 rounded-lg border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        {/* TODO: Phase 4 - 選択した言語をURLパラメータまたはstateで引き継ぎ、全画面のUIテキストを切り替え */}
      </div>

      {/* ロゴと会社名 */}
      <div className="pt-4 pb-3 flex flex-col items-center">
        {company.logo_url ? (
          <>
            <img src={company.logo_url} alt={company.name} className="w-12 h-12 rounded object-cover" />
            <p className="text-gray-600 text-sm mt-2">{company.name}</p>
          </>
        ) : (
          <h1 className="text-gray-800 font-bold text-lg">{company.name}</h1>
        )}
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
            <h2 className="text-xl font-bold text-gray-800 text-center">
              ご参加ありがとうございます！
            </h2>
            <p className="text-sm text-gray-500 text-center mt-2">
              AI面接官が質問します。<br />リラックスしてお話しください。
            </p>
          </div>

          {/* 面接の流れ */}
          <div className="ml-2">
            <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-4">面接の流れ</h3>
            <div className="border-l-2 border-blue-200 pl-4 space-y-0 relative">
              {/* ステップ1 */}
              <div className="flex items-start gap-3 py-3 relative">
                <div className="absolute left-[-9px] top-[18px] bottom-[-18px] w-0.5 bg-blue-200"></div>
                <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center relative z-10">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-col">
                    <div className="text-[10px] text-blue-400 font-semibold tracking-wider">STEP 1</div>
                    <div className="text-sm font-medium text-gray-700">基本情報の入力</div>
                  </div>
                </div>
              </div>
              
              {/* ステップ2 */}
              <div className="flex items-start gap-3 py-3 relative">
                <div className="absolute left-[-9px] top-[18px] bottom-[-18px] w-0.5 bg-blue-200"></div>
                <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center relative z-10">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-col">
                    <div className="text-[10px] text-blue-400 font-semibold tracking-wider">STEP 2</div>
                    <div className="text-sm font-medium text-gray-700">本人確認</div>
                  </div>
                </div>
              </div>
              
              {/* ステップ3 */}
              <div className="flex items-start gap-3 py-3 relative">
                <div className="absolute left-[-9px] top-[18px] bottom-[-18px] w-0.5 bg-blue-200"></div>
                <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center relative z-10">
                  <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-col">
                    <div className="text-[10px] text-blue-400 font-semibold tracking-wider">STEP 3</div>
                    <div className="text-sm font-medium text-gray-700">カメラ・マイクの確認</div>
                  </div>
                </div>
              </div>
              
              {/* ステップ4 */}
              <div className="flex items-start gap-3 py-3 relative">
                <div className="absolute left-[-9px] top-[18px] bottom-[-18px] w-0.5 bg-blue-200"></div>
                <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center relative z-10">
                  <PlayCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-col">
                    <div className="text-[10px] text-blue-400 font-semibold tracking-wider">STEP 4</div>
                    <div className="text-sm font-medium text-gray-700">面接練習（約3分）</div>
                  </div>
                </div>
              </div>
              
              {/* ステップ5 */}
              <div className="flex items-start gap-3 py-3 relative">
                <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center relative z-10">
                  <Video className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex flex-col">
                    <div className="text-[10px] text-blue-400 font-semibold tracking-wider">STEP 5</div>
                    <div className="text-sm font-medium text-gray-700">AI面接（最大40分）</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 同意チェックボックス */}
          <label className="flex items-start gap-3 cursor-pointer min-h-[44px] py-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="w-5 h-5 accent-blue-600 mt-0.5 flex-shrink-0"
            />
            <span className="text-xs sm:text-sm text-gray-600 pt-0.5">
              利用規約および
              <Link
                href={`/interview/${slug}/terms`}
                className="text-blue-600 underline ml-1"
                onClick={(e) => e.stopPropagation()}
              >
                プライバシーポリシー
              </Link>
              に同意します
            </span>
          </label>

          {/* 面接を始めるボタン */}
          <button
            onClick={handleNext}
            disabled={!consent}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            面接を始める
          </button>

          {/* サポートリンク */}
          <p className="text-center">
            {!showEmail ? (
              <button
                onClick={() => setShowEmail(true)}
                className="text-sm text-blue-500 cursor-pointer"
              >
                お困りの方はこちら
              </button>
            ) : (
              <span className="text-sm text-blue-500">
                {SUPPORT_EMAIL}
                <button
                  onClick={handleCopyEmail}
                  className="text-xs text-gray-400 ml-2 cursor-pointer hover:text-gray-600"
                >
                  {copied ? 'コピーしました' : 'コピー'}
                </button>
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

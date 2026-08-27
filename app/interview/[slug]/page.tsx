'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User, MessageSquare, Camera, PlayCircle, Video, Globe, ArrowRight, ShieldCheck } from 'lucide-react'

const SUPPORT_EMAIL = 'support@ai-jinji24h.com'
import { useParams, useRouter } from 'next/navigation'

const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

// 面接の流れ（STEP）。文言・順序・アイコンは既存のまま。反復記述を配列に集約して見た目のみ刷新する。
const INTERVIEW_STEPS = [
  { icon: User, label: 'STEP 1', title: '基本情報の入力' },
  { icon: MessageSquare, label: 'STEP 2', title: '本人確認' },
  { icon: Camera, label: 'STEP 3', title: 'カメラ・マイクの確認' },
  { icon: PlayCircle, label: 'STEP 4', title: '面接練習（約3分）' },
  { icon: Video, label: 'STEP 5', title: 'AI面接（最大60分）' },
]

export default function InterviewPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

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

  // 追加P2（Codex）: 同一タブで以前この slug の言語を選んでいれば、その保存値で state を初期化する
  //（表示と sessionStorage の値を一致させ、後段 session が stale 値を読むズレを防ぐ）。マウント後に読む
  // （SSR/hydration 安全）。表示同期のための意図的な setState。
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch {
      /* noop */
    }
  }, [slug])

  async function fetchCompany() {
    setLoading(true)
    try {
      const res = await fetch(`/api/interview/${slug}/public-config`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.company) {
        setCompany(null)
      } else {
        setCompany(json.company)
      }
    } catch {
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/60 pb-12">
      {/* ヘッダー: 会社名（左）＋ 言語切替（右）。max-w で中央寄せ、面接カードと横位置を揃える。 */}
      <header className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 pt-5 sm:pt-7">
        <div className="flex min-w-0 items-center gap-2.5">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-9 w-9 flex-shrink-0 rounded-lg border border-slate-200 object-cover"
            />
          ) : null}
          <span className="truncate text-sm font-semibold text-slate-800">{company.name}</span>
        </div>

        {/* 言語切替: グローブ付きの上品なピル。native select を維持しキーボード/読み上げ対応を保つ。 */}
        <div className="relative flex-shrink-0">
          <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <select
            value={selectedLanguage}
            onChange={(e) => {
              setSelectedLanguage(e.target.value)
              // 追加P2（Codex）: 選択言語をフロー全体で保持し、後段の session（Realtime）まで伝播させる。
              try {
                sessionStorage.setItem(`interview_${slug}_language`, e.target.value)
              } catch {
                /* noop */
              }
            }}
            aria-label="言語を選択"
            className="cursor-pointer rounded-full border border-slate-200 bg-white/80 py-1.5 pl-7 pr-2.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          {/* TODO: Phase 4 - 選択した言語をURLパラメータまたはstateで引き継ぎ、全画面のUIテキストを切り替え */}
        </div>
      </header>

      {/* メインカード: 薄い境界線＋やわらかいシャドウで安っぽさを排し、余白を広めに取る。 */}
      <main className="mx-auto mt-5 max-w-lg px-4 sm:mt-8">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.28)] sm:p-9">
          {/* タイトル: ブランドバッジ＋見出し＋補足。情報の優先順位を明確化。 */}
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/20">
              <Video className="h-7 w-7 text-white" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-500">AI Interview</span>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
              ご参加ありがとうございます！
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
              AI面接官が質問します。<br />リラックスしてお話しください。
            </p>
          </div>

          {/* 面接の流れ: 数字バッジ＋縦導線のタイムライン。進行イメージが直感的に伝わるよう整理。 */}
          <section className="mt-8">
            <h2 className="mb-4 text-sm font-bold text-slate-800">面接の流れ</h2>
            <ol className="space-y-1">
              {INTERVIEW_STEPS.map((step, i) => {
                const Icon = step.icon
                const isLast = i === INTERVIEW_STEPS.length - 1
                return (
                  <li key={step.label} className="relative flex gap-4 pb-4 last:pb-0">
                    {/* 縦導線（最後のステップには引かない） */}
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="absolute left-[19px] top-11 h-[calc(100%-1.75rem)] w-px bg-gradient-to-b from-blue-200 to-slate-200"
                      />
                    )}
                    <span className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-600/20">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex flex-col pt-0.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-500">{step.label}</span>
                      <span className="text-sm font-medium text-slate-700">{step.title}</span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          {/* 同意チェック: 枠付きボックスで視認性を上げ、チェック時はブランド色でハイライト。 */}
          <label
            className={`mt-7 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
              consent ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
            }`}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-shrink-0 accent-blue-600"
            />
            <span className="pt-0.5 text-sm leading-relaxed text-slate-600">
              利用規約および
              <Link
                href={`/interview/${slug}/terms`}
                className="ml-1 font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700"
                onClick={(e) => e.stopPropagation()}
              >
                プライバシーポリシー
              </Link>
              に同意します
            </span>
          </label>

          {/* CTA: 角丸2xl・ブランドグラデ・矢印・ホバーで浮き上がる。無効状態を明確に。 */}
          <button
            onClick={handleNext}
            disabled={!consent}
            className="group mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/30 active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
          >
            面接を始める
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* 安心感の補助文（安全に管理される旨）。 */}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            入力内容は暗号化して安全に管理されます
          </p>

          {/* サポートリンク */}
          <div className="mt-5 border-t border-slate-100 pt-4 text-center">
            {!showEmail ? (
              <button
                onClick={() => setShowEmail(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                お困りの方はこちら
              </button>
            ) : (
              <span className="text-sm text-slate-600">
                {SUPPORT_EMAIL}
                <button
                  onClick={handleCopyEmail}
                  className="ml-2 text-xs text-slate-400 hover:text-slate-600"
                >
                  {copied ? 'コピーしました' : 'コピー'}
                </button>
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

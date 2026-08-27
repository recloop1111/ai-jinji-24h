'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Clock, MonitorSmartphone, CalendarClock, PlayCircle, HelpCircle, ShieldCheck, Globe, Quote } from 'lucide-react'
import { AI_INTERVIEWER } from '@/lib/interview/interviewer-identity'

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

// 面接概要の情報ボックス（3つ）。意味は「所要時間の目安 / 受験環境 / 受験可能時間」。
const INFO_BOXES = [
  { icon: Clock, label: '所要時間の目安', value: '約30〜40分' },
  { icon: MonitorSmartphone, label: '受験環境', value: 'スマホ・PC対応' },
  { icon: CalendarClock, label: '受験可能時間', value: '24時間いつでも' },
]

// 面接の流れ（横並び 01〜05）。順序は既存フローを維持し、横並び表示向けの短いラベルにする。
const FLOW_STEPS = [
  { no: '01', lines: ['基本情報', '入力'] },
  { no: '02', lines: ['本人確認'] },
  { no: '03', lines: ['環境確認'] },
  { no: '04', lines: ['練習', '（任意）'] },
  { no: '05', lines: ['AI面接', '（本番）'] },
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
    <div className="min-h-screen bg-slate-100">
      {/* ヘッダー: 会社名（左）＋ 言語切替（右）。全幅・余白ゆとり・境界は薄く上品に。 */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-8 w-8 flex-shrink-0 rounded-lg border border-slate-200 object-cover"
            />
          ) : null}
          <span className="truncate text-base font-bold text-slate-900">{company.name}</span>
        </div>

        {/* 言語切替: グローブ付きの上品なピル。native select を維持しキーボード/読み上げ対応を保つ。 */}
        <div className="relative flex-shrink-0">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
            className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* メインカード: 広めの1枚カード。白背景・角丸大・シャドウ控えめ・境界薄く。 */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-10 lg:p-12">
          <div className="grid gap-10 lg:grid-cols-[1.55fr_1fr] lg:items-center lg:gap-14">
            {/* 左カラム: タイトル / 説明 / 情報ボックス / 面接の流れ / 同意 / CTA */}
            <div>
              {/* 見出し: 大きく太い主見出し＋ブランド色の副見出し＋薄めの説明。 */}
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">AI面接へようこそ</h1>
              <p className="mt-1.5 text-xl font-bold text-blue-600 sm:text-2xl">ご参加ありがとうございます</p>
              <p className="mt-4 text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                AI面接官が質問します。<br className="hidden sm:block" />リラックスしてお話しください。
              </p>

              {/* 情報ボックス（3つ）: アイコン付き・薄枠・角丸の小カード。 */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {INFO_BOXES.map((box) => {
                  const Icon = box.icon
                  return (
                    <div key={box.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-col sm:items-start sm:gap-2">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-400">{box.label}</div>
                        <div className="text-sm font-semibold text-slate-800">{box.value}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 面接の流れ: 横並びの 01〜05 ステッパー（点線コネクタ）。デスクトップは1行。 */}
              <section className="mt-8 border-t border-slate-100 pt-7">
                <h2 className="mb-5 text-base font-bold text-slate-900">面接の流れ</h2>
                <ol className="grid grid-cols-5 gap-1 sm:gap-2">
                  {FLOW_STEPS.map((step, i) => (
                    <li key={step.no} className="relative flex flex-col items-center text-center">
                      {/* 点線コネクタ（前のステップとの間・モバイルでは非表示） */}
                      {i > 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[-50%] right-1/2 top-5 hidden border-t border-dashed border-slate-300 sm:block"
                        />
                      )}
                      <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-sm font-bold text-blue-600">
                        {step.no}
                      </span>
                      <div className="mt-2 leading-tight">
                        {step.lines.map((line) => (
                          <div key={line} className="text-[10px] text-slate-600 sm:text-xs">{line}</div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {/* 同意チェック: 機能は不変。見た目のみ整える。 */}
              <label className="mt-8 flex cursor-pointer items-start gap-2.5">
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

              {/* CTA: 幅広・ブランドブルー・アイコン付き。活性/非活性条件は不変（disabled={!consent}）。 */}
              <button
                onClick={handleNext}
                disabled={!consent}
                className="group mt-4 flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 active:scale-[0.99] disabled:pointer-events-none disabled:bg-blue-300 disabled:opacity-70 disabled:shadow-none"
              >
                <PlayCircle className="h-5 w-5" />
                AI面接をはじめる
              </button>

              {/* 安心感の補助文。 */}
              <p className="mt-3.5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                入力いただいた情報は暗号化して安全に管理します
              </p>
            </div>

            {/* 右カラム: 現行の面接官画像（円形）＋ 軽い補足吹き出し。 */}
            <div className="flex flex-col items-center">
              <div className="relative">
                {/* 控えめな背景装飾（ドット・低透明度）。 */}
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-6 h-40 w-40 text-blue-200/50"
                  viewBox="0 0 100 100"
                  fill="currentColor"
                >
                  {Array.from({ length: 6 }).map((_, r) =>
                    Array.from({ length: 6 }).map((_, c) => (
                      <circle key={`${r}-${c}`} cx={8 + c * 16} cy={8 + r * 16} r="1.6" />
                    )),
                  )}
                </svg>
                {/* やわらかなハロー */}
                <div className="absolute -inset-4 rounded-full bg-gradient-to-b from-blue-100/60 to-transparent blur-2xl" />
                <div className="relative h-52 w-52 overflow-hidden rounded-full bg-slate-100 ring-8 ring-white shadow-xl sm:h-60 sm:w-60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={AI_INTERVIEWER.images.neutral}
                    alt={AI_INTERVIEWER.imageAlt}
                    className="h-full w-full object-cover object-[center_18%]"
                  />
                </div>
              </div>

              {/* 補足吹き出し（面接官のあいさつ）。 */}
              <div className="relative mt-6 w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Quote className="absolute left-3 top-3 h-5 w-5 text-blue-200" />
                <p className="pl-7 text-sm leading-relaxed text-slate-600">
                  こんにちは！本日はよろしくお願いします。リラックスして、一緒にお話ししましょう。
                </p>
              </div>
            </div>
          </div>

          {/* サポートリンク（カード下部・中央）。 */}
          <div className="mt-8 border-t border-slate-100 pt-5 text-center">
            {!showEmail ? (
              <button
                onClick={() => setShowEmail(true)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <HelpCircle className="h-4 w-4" />
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

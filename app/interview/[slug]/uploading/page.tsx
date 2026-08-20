'use client'

import { useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

// Phase I-4: 実アップロード/録画保存（R2）は未実装のため、偽の進捗（%・「動画を保存中」「解析中」「分析完了」
// 「レポート作成」等）は一切表示しない。実態に合う短い中間表示だけを出し、まもなく完了画面へ遷移する。
// 既存の終了処理（session 側 handleEndInterview → /end → ここへ push）とのrace を避けるため、
// 遷移は単一の timeout ＋ hasNavigated ガードで1回だけ行う。
export default function UploadingPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const hasNavigated = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasNavigated.current) return
      hasNavigated.current = true
      router.push(`/interview/${slug}/complete`)
    }, 1500)
    return () => clearTimeout(timer)
  }, [slug, router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex flex-col items-center justify-center px-6">
      <svg
        className="animate-spin h-8 w-8 text-blue-400 mb-5"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p className="text-white/80 text-sm" aria-live="polite">
        面接を終了しています…
      </p>
    </div>
  )
}

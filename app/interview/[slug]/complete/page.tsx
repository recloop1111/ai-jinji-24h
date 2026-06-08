'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// TODO: 実際のデータに差替え
const SUMMARY = {
  minutes: 25,
  questions: 6,
  avgResponseSeconds: 42,
  totalSpeakingTime: '8:30',
  speakingRate: 65,
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

export default function CompletePage() {
  const params = useParams()
  const slug = params.slug as string
  const supabase = createClient()

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmitRating() {
    if (rating === 0) return
    const applicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    if (!applicantId) return
    try {
      const { error } = await supabase
        .from('applicants')
        .update({ satisfaction_rating: rating })
        .eq('id', applicantId)

      if (error) {
        return
      }

      setSubmitted(true)
    } catch {
      // ネットワークエラー等は無視（満足度は任意）
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* ヘッダー */}
        <header className="text-center shrink-0 mb-8">
          <span className="text-sm font-bold tracking-wide text-blue-600">AI人事24h</span>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 tracking-tight mt-2">面接お疲れ様でした</h1>
          <p className="text-sm text-gray-600 mt-2">結果は企業の担当者よりご連絡いたします。</p>
        </header>

        {/* 面接サマリーカード */}
        <main className="flex-1">
          <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <ClockIcon className="w-5 h-5 text-blue-600 shrink-0" />
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">面接サマリー</h3>
            </div>
            <div className="flex gap-6 mb-4">
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 tabular-nums">{SUMMARY.minutes}</p>
                <p className="text-xs text-gray-600 mt-1">分</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-gray-900 tabular-nums">{SUMMARY.questions}</p>
                <p className="text-xs text-gray-600 mt-1">問</p>
              </div>
            </div>
          </div>
        </main>

        {/* フッター */}
        <footer className="shrink-0 mt-6 pt-6 border-t border-gray-200">
          {!submitted ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-gray-700">面接の体験はいかがでしたか？</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 rounded-lg transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <StarIcon
                      className={`w-6 h-6 transition-colors ${
                        s <= (hoverRating || rating) ? 'text-amber-500' : 'text-gray-300'
                      }`}
                      filled={s <= (hoverRating || rating)}
                    />
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubmitRating}
                disabled={rating === 0}
                className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                  rating > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                送信する
              </button>
            </div>
          ) : (
            <p className="text-center text-gray-600 text-sm">ご協力ありがとうございます</p>
          )}
          <p className="text-center text-xs text-gray-400 mt-4">Powered by AI人事24h</p>
        </footer>
      </div>
      {/* TODO: Phase 4 - 実際の面接結果からスコア・タイプを算出 */}
    </div>
  )
}

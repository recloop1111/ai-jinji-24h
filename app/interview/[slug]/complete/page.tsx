'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Globe, Check, CheckCircle2, ClipboardList, Clock, MessageSquareText, Star } from 'lucide-react'
import { APP_NAME } from '@/constants'
import {
  parseInterviewSummary,
  summaryMatchesInterview,
  summaryStorageKey,
  durationToMinutes,
  questionCountDisplay,
  type InterviewSummary,
} from '@/lib/interview/completeSummary'
import { resolveCompanyName, canSubmitRating } from '@/lib/interview/complete-view'

// 応募開始/基本情報/本人確認/環境確認 画面と統一の言語リスト（表示＋sessionStorage 保存のみ）。
const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

export default function CompletePage() {
  const params = useParams()
  const slug = params.slug as string

  // ヘッダー: 会社名（左）＋言語切替（右）。AIMEN24 はヘッダーに出さない（他の応募者画面と統一）。
  const [companyName, setCompanyName] = useState<string>(resolveCompanyName(null))
  const [selectedLanguage, setSelectedLanguage] = useState('ja')

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // 会社名は他画面と同じ公開設定 API（service-role・安全列のみ）から取得。取得不可は demo 名にフォールバック。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/interview/${slug}/public-config`)
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (res.ok && json?.company) setCompanyName(resolveCompanyName(json.company.name))
      } catch {
        /* 取得失敗は demo 名のまま（捏造しない） */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  // 同一タブで選んだ言語があれば表示を合わせる（他画面と同じキー）。
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch {
      /* noop */
    }
  }, [slug])

  // 実データ summary を読み出す。別面接/stale を誤表示しないよう現在の interview_id 一致時のみ使用
  // （不一致/欠落/malformed は null＝ダミーを出さない）。マウント後に読む（SSR 安全）。
  const [summary, setSummary] = useState<InterviewSummary | null>(null)
  useEffect(() => {
    try {
      const parsed = parseInterviewSummary(sessionStorage.getItem(summaryStorageKey(slug)))
      const currentInterviewId = sessionStorage.getItem(`interview_${slug}_interview_id`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSummary(summaryMatchesInterview(parsed, currentInterviewId) ? parsed : null)
    } catch {
      setSummary(null)
    }
  }, [slug])

  // 実データのみ。取得不能は null（「—」ではなく該当カラムを非表示）。固定ダミー値は出さない。
  const minutes = summary ? durationToMinutes(summary.durationSeconds) : null
  const questions = summary ? questionCountDisplay(summary.questionCount) : null

  const canSubmit = canSubmitRating({ rating, submitting, submitted })

  async function handleSubmitRating() {
    if (!canSubmit) return // 未選択/送信中/送信済みは送らない（二重送信防止）
    const applicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    const token = sessionStorage.getItem(`interview_${slug}_token`)
    if (!applicantId || !token) return
    setSubmitting(true)
    try {
      // 既存の token 付き service-role API をそのまま利用（browser 直 UPDATE は使わない）。
      const res = await fetch(`/api/interview/${slug}/satisfaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, applicant_id: applicantId, satisfaction_rating: rating }),
      })
      if (res.ok) setSubmitted(true)
    } catch {
      // ネットワークエラー等は無視（満足度は任意）
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ヘッダー（会社名 左 ＋ 言語切替 右）。他の応募者画面と統一。AIMEN24 は出さない。 */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur sm:px-8">
        <span className="truncate text-base font-bold text-slate-900">{companyName}</span>
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

      <main className="mx-auto max-w-xl px-4 py-8 sm:py-10">
        {/* 完了メッセージ（小さく上品な完了マーク・演出なし）。 */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-100">
            <Check className="h-7 w-7 text-blue-600" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">面接が完了しました</h1>
          {/* honest 文言: /end の保存成功は保証されないため「送信されました」とは断定しない。 */}
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            お疲れ様でした。
            <br />
            選考結果・今後のご案内は、企業担当者よりご連絡いたします。
          </p>
        </div>

        {/* 面接サマリーカード（実データのみ・固定値なし）。 */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.25)]">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">面接サマリー</h2>
          </div>

          {(minutes !== null || questions !== null) && (
            <div className="mt-5 flex items-stretch">
              {minutes !== null && (
                <div className="flex flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Clock className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex items-baseline gap-0.5 whitespace-nowrap">
                      <span className="text-2xl font-bold tabular-nums text-slate-900">{minutes}</span>
                      <span className="text-sm font-semibold text-slate-500">分</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">面接時間</p>
                  </div>
                </div>
              )}
              {minutes !== null && questions !== null && <div className="mx-2 w-px self-stretch bg-slate-200" aria-hidden="true" />}
              {questions !== null && (
                <div className="flex flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <MessageSquareText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex items-baseline gap-0.5 whitespace-nowrap">
                      <span className="text-2xl font-bold tabular-nums text-slate-900">{questions}</span>
                      <span className="text-sm font-semibold text-slate-500">問</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">質問数</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 完了ステータス（honest: 送信保証はないため「面接完了」）。 */}
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-green-700" role="status">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">面接完了</span>
          </div>
        </section>

        {/* フィードバック（既存の満足度送信を再利用・UI 整理）。サマリー直下に配置。 */}
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.25)]">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">面接の体験はいかがでしたか？</h2>
          </div>
          {!submitted ? (
            <>
              <p className="mt-1.5 text-sm text-slate-500">いただいたご意見は、サービスの改善に役立ててまいります。</p>
              <div className="mt-4 flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((s) => {
                  const active = s <= (hoverRating || rating)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      onMouseEnter={() => setHoverRating(s)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`${s} / 5`}
                      className="rounded-lg p-1 transition-transform duration-150 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${active ? 'text-blue-500' : 'text-slate-300'}`}
                        fill={active ? 'currentColor' : 'none'}
                        strokeWidth={active ? 0 : 1.5}
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
              <button
                onClick={handleSubmitRating}
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 active:scale-[0.99] disabled:pointer-events-none disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {submitting ? '送信中…' : '送信する'}
              </button>
            </>
          ) : (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-green-700" role="status">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium">ご協力ありがとうございます</span>
            </div>
          )}
        </section>

        {/* フッター（AIMEN24 は small / muted のみ）。 */}
        <div className="mt-6 text-center">
          <p className="text-sm text-slate-400">この画面は閉じていただいて問題ありません。</p>
          <p className="mt-3 text-xs font-medium text-slate-400">Powered by {APP_NAME}</p>
        </div>
      </main>
    </div>
  )
}

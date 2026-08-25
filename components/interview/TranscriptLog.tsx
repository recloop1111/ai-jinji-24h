'use client'

// Phase P3: 企業管理画面（応募者詳細）の会話ログ表示（純 props 駆動・presentational）。
//   - items は「final のみ・seq 昇順」の最小 DTO（呼び出し側が resolveTranscriptFetchState で用意）。
//   - 4状態を視覚的に区別（loading / error / schema_pending / empty / ready）。同じ空表示にしない。
//   - PII（text）は React 既定エスケープのみ。dangerouslySetInnerHTML は使わない。
//   - 大規模リデザインはしない。既存の slate/blue トークンに合わせる。

import { MessagesSquare, AlertTriangle, Clock } from 'lucide-react'
import { speakerDisplayLabel, type TranscriptDisplayItem, type TranscriptFetchStatus } from '@/lib/interview/transcript-company-read'

interface TranscriptLogProps {
  status: TranscriptFetchStatus
  items: TranscriptDisplayItem[]
  loading?: boolean
}

const cardCls = 'rounded-2xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-sm text-center'

export default function TranscriptLog({ status, items, loading = false }: TranscriptLogProps) {
  if (loading) {
    return (
      <div className={cardCls} role="status" aria-live="polite">
        <svg className="animate-spin h-6 w-6 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-slate-500 mt-3">会話ログを読み込んでいます…</p>
      </div>
    )
  }

  // D: permission/RLS/network/unknown → honest error（空で握り潰さない）
  if (status === 'error') {
    return (
      <div className={cardCls} role="alert">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" aria-hidden="true" />
        <p className="text-slate-700">会話ログを読み込めませんでした</p>
        <p className="text-sm text-slate-500 mt-2">時間をおいて、もう一度お試しください。問題が続く場合は運営までお問い合わせください。</p>
      </div>
    )
  }

  // C: schema 未適用 → safe empty（機能ロールアウト前）。B とは別文言。
  if (status === 'schema_pending') {
    return (
      <div className={cardCls} role="status">
        <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
        <p className="text-slate-600">会話ログ機能は現在準備中です</p>
        <p className="text-sm text-slate-500 mt-2">AI面接の会話ログは、順次ご利用いただけるようになります。</p>
      </div>
    )
  }

  // B: テーブルはあるが 0 件 → 正常な空
  if (status === 'empty' || items.length === 0) {
    return (
      <div className={cardCls} role="status">
        <MessagesSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
        <p className="text-slate-600">この面接の会話ログはまだありません</p>
        <p className="text-sm text-slate-500 mt-2">面接の会話が記録されると、ここに表示されます。</p>
      </div>
    )
  }

  // A: 会話ログあり → 時系列表示（AI面接官 / 応募者 を視覚区別）
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">会話ログ</h3>
        <span className="text-xs text-slate-400">{items.length}件の発話</span>
      </div>
      <ol className="space-y-3">
        {items.map((item) => {
          const isInterviewer = item.speaker === 'interviewer'
          return (
            <li key={item.seq} className={`flex ${isInterviewer ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] ${isInterviewer ? '' : 'text-right'}`}>
                <p className={`text-xs mb-1 ${isInterviewer ? 'text-blue-600' : 'text-slate-500'}`}>
                  {speakerDisplayLabel(item.speaker)}
                </p>
                <div
                  className={`inline-block text-left rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isInterviewer
                      ? 'bg-blue-50 text-slate-800 rounded-tl-sm'
                      : 'bg-slate-100 text-slate-800 rounded-tr-sm'
                  }`}
                >
                  {item.text}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

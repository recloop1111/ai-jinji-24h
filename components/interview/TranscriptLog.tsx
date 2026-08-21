'use client'

import { useState } from 'react'
import { Copy, Check, MessagesSquare } from 'lucide-react'
import type { TranscriptReadItem } from '@/lib/interview/transcript-read'
import { speakerDisplayLabel, transcriptItemsToCopyText } from '@/lib/interview/transcript-view'

// PR-3D: 企業管理画面の会話ログ表示（純 props 駆動・presentational）。
//   - items は「final のみ・seq 昇順」の read model（呼び出し側が buildFinalTranscriptReadModel で用意）。
//     このコンポーネントで ordering / final 判定を再実装しない。
//   - 本文は React の通常テキストレンダリングのみ（dangerouslySetInnerHTML / innerHTML を使わない）。
//     HTML っぽい文字列・改行・長文・URL も文字列として安全に表示（whitespace-pre-wrap / break-words）。
//   - 話者は色だけでなくテキストラベルでも区別する。
//   - 本文を console/log/analytics へ出さない。

interface TranscriptLogProps {
  items: TranscriptReadItem[]
  loading?: boolean
  error?: boolean
}

export default function TranscriptLog({ items, loading = false, error = false }: TranscriptLogProps) {
  const [copied, setCopied] = useState(false)

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center" role="status" aria-live="polite">
        <svg className="animate-spin h-6 w-6 text-blue-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-slate-500 mt-3">会話ログを読み込んでいます…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center" role="alert">
        <p className="text-slate-600">会話ログを読み込めませんでした</p>
        <p className="text-sm text-slate-500 mt-2">時間をおいて、もう一度お試しください。</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200/80 p-8 shadow-sm text-center" role="status">
        <MessagesSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
        <p className="text-slate-600">会話ログはまだありません</p>
        <p className="text-sm text-slate-500 mt-2">面接の会話が記録されると、ここに表示されます。</p>
      </div>
    )
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptItemsToCopyText(items))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // クリップボード不可（権限拒否/非対応）でも本文は画面に表示済み＝機能不全にしない。
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">会話ログ</h3>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors"
          aria-label="会話ログをコピー"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
          <span>{copied ? 'コピーしました' : 'コピー'}</span>
        </button>
      </div>

      <ol className="space-y-4">
        {items.map((it) => {
          const isInterviewer = it.speaker === 'interviewer'
          return (
            <li key={it.id ?? `${it.speaker}-${it.seq}`} className={`flex flex-col ${isInterviewer ? 'items-start' : 'items-end'}`}>
              <span className={`text-xs font-medium mb-1 ${isInterviewer ? 'text-blue-700' : 'text-slate-600'}`}>
                {speakerDisplayLabel(it.speaker)}
              </span>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  isInterviewer ? 'bg-blue-50 text-slate-800 rounded-tl-sm' : 'bg-slate-100 text-slate-800 rounded-tr-sm'
                }`}
              >
                {it.text}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

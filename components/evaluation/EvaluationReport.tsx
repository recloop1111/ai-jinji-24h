'use client'

import { Info, MessagesSquare, Quote, ShieldCheck } from 'lucide-react'
import { gradeColor } from '@/lib/utils/scoreToGrade'
import { axisScoreText, type EvaluationDisplayModel, type EvidenceDisplay, type TextItemDisplay } from '@/lib/evaluation/display'

// PR-4D: EBCA 評価レポート表示（純 props 駆動・presentational）。
//   情報設計: ①評価概要 → ②6軸 → ③各軸の根拠(evidence) → ④強み → ⑤懸念 → ⑥会話ログ導線。
//   AI の断定的採否 UI にしない（recommendation は「判断材料」文言・最終判断は人間と明示）。
//   score=null は「—/評価材料不足」（0 化しない）。insufficient と failed(error) を混同しない。
//   本文は React 通常テキストのみ（dangerouslySetInnerHTML/innerHTML 不使用）。色だけで状態を伝えない。

interface EvaluationReportProps {
  model: EvaluationDisplayModel | null
  state?: 'ready' | 'loading' | 'error' | 'empty'
  onViewTranscript?: () => void
}

const CONFIDENCE_STYLE: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-green-50 text-green-700 border-green-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-amber-50 text-amber-700 border-amber-200',
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">{children}</div>
}

function EvidenceList({ items }: { items: EvidenceDisplay[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-500 mb-1.5">判断の根拠</p>
      <ul className="space-y-1.5">
        {items.map((ev, i) => (
          <li key={i} className="flex gap-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <Quote className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{ev.quote}</p>
              {ev.seq !== null && <p className="text-xs text-slate-400 mt-0.5">会話 #{ev.seq}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TranscriptLink({ onViewTranscript }: { onViewTranscript?: () => void }) {
  if (!onViewTranscript) return null
  return (
    <button
      type="button"
      onClick={onViewTranscript}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors min-h-[40px]"
    >
      <MessagesSquare className="w-4 h-4 text-slate-400" aria-hidden="true" />
      会話ログを確認
    </button>
  )
}

function TextItems({ title, items, onViewTranscript }: { title: string; items: TextItemDisplay[]; onViewTranscript?: () => void }) {
  if (items.length === 0) return null
  return (
    <Panel>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      <ul className="space-y-3">
        {items.map((it, i) => (
          <li key={i}>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap break-words">{it.text}</p>
            <EvidenceList items={it.evidence} />
          </li>
        ))}
      </ul>
      {items.some((it) => it.evidence.length > 0) && onViewTranscript && (
        <div className="mt-4">
          <TranscriptLink onViewTranscript={onViewTranscript} />
        </div>
      )}
    </Panel>
  )
}

const AI_DISCLAIMER = 'AIによる面接内容の分析結果です。最終的な採用判断は担当者が行ってください。'
const PROTECTED_NOTE = '年齢・性別・国籍などの属性情報は評価対象に含めていません。'

export default function EvaluationReport({ model, state = 'ready', onViewTranscript }: EvaluationReportProps) {
  if (state === 'loading') {
    return (
      <Panel>
        <div className="text-center py-6" role="status" aria-live="polite">
          <svg className="animate-spin h-6 w-6 text-blue-600 mx-auto" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-500 mt-3">評価結果を読み込んでいます…</p>
        </div>
      </Panel>
    )
  }

  if (state === 'error') {
    // 失敗と insufficient_data を混同しない。失敗時に「情報不足」とは表示しない。
    return (
      <Panel>
        <div className="text-center py-6" role="alert">
          <p className="text-slate-700 font-medium">評価結果を取得できませんでした</p>
          <p className="text-sm text-slate-500 mt-2">時間をおいて、もう一度お試しください。</p>
        </div>
      </Panel>
    )
  }

  if (state === 'empty' || !model) {
    return (
      <Panel>
        <div className="text-center py-6" role="status">
          <p className="text-slate-600 font-medium">評価結果はまだありません</p>
          <p className="text-sm text-slate-500 mt-2">面接の評価が生成されると、ここに表示されます。</p>
        </div>
      </Panel>
    )
  }

  const insufficient = model.status === 'insufficient_data'

  return (
    <div className="space-y-4">
      {/* ① 評価概要 */}
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">AI面接評価</h3>
          {onViewTranscript && <TranscriptLink onViewTranscript={onViewTranscript} />}
        </div>

        {insufficient ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">評価に十分な会話データがありませんでした</p>
            <p className="text-sm text-amber-700 mt-1">総合評価は算出していません。会話ログをご確認ください。</p>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            {model.totalScore !== null && (
              <div>
                <p className="text-xs text-slate-500 mb-0.5">総合スコア</p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums">
                  {model.totalScore}
                  <span className="text-base font-normal text-slate-400"> / 100</span>
                  {model.grade && (
                    <span className={`ml-2 inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-bold align-middle ${gradeColor(model.grade)}`}>
                      {model.grade}
                    </span>
                  )}
                </p>
              </div>
            )}
            {model.recommendationText && (
              <div>
                <p className="text-xs text-slate-500 mb-0.5">推奨度（判断材料）</p>
                <p className="text-sm font-semibold text-slate-800">{model.recommendationText}</p>
              </div>
            )}
            {model.confidenceText && (
              <div>
                <p className="text-xs text-slate-500 mb-0.5">分析の確からしさ</p>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CONFIDENCE_STYLE[model.confidence!]}`}>
                  確からしさ: {model.confidenceText}
                </span>
              </div>
            )}
          </div>
        )}

        {model.summary && <p className="mt-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{model.summary}</p>}

        <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{AI_DISCLAIMER}</span>
        </p>
      </Panel>

      {/* ② 6軸 ＋ ③ 各軸の根拠 */}
      {model.axes.length > 0 && (
        <Panel>
          <h3 className="text-sm font-semibold text-slate-700 mb-4">評価軸（6軸）</h3>
          <ul className="space-y-5">
            {model.axes.map((a) => (
              <li key={a.axisId} className="border-b border-slate-100 last:border-0 pb-5 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-slate-800">{a.label}</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">
                    {axisScoreText(a.score)}
                    {a.score !== null && <span className="text-xs font-normal text-slate-400"> / 20</span>}
                  </span>
                  {a.rank && <span className="text-xs font-medium text-slate-500">評価 {a.rank}</span>}
                  {a.confidenceText && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLE[a.confidence!]}`}>
                      確からしさ: {a.confidenceText}
                    </span>
                  )}
                </div>
                {a.score === null && (
                  <p className="mt-1.5 text-sm text-slate-500">
                    評価材料不足{a.insufficientReason ? `：${a.insufficientReason}` : '（この軸を判断できる発言が確認できませんでした）'}
                  </p>
                )}
                {a.comment && <p className="mt-1.5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">{a.comment}</p>}
                <EvidenceList items={a.evidence} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* ④ 強み */}
      <TextItems title="面接で確認できた強み" items={model.strengths} onViewTranscript={onViewTranscript} />

      {/* ⑤ 懸念・確認ポイント（不採用理由として見せない） */}
      <TextItems title="判断前に確認したいポイント" items={model.concerns} onViewTranscript={onViewTranscript} />

      {/* 保護属性の注記（過剰にならない位置で1行） */}
      <p className="flex items-start gap-1.5 text-xs text-slate-400 px-1">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{PROTECTED_NOTE}</span>
      </p>
    </div>
  )
}

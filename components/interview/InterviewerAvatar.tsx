'use client'

// Phase I-2: AI面接官アバターの状態表現（CSS＋既存写真のみ・新規素材/外部依存なし）。
// 状態ソースは PR I-1 の InterviewPhase 一本。lip-sync は行わない（写真素材で不自然になるため）。
// 目的: 応募者が一目で「待機/質問/傾聴/思考/接続/終了」を見分けられること。
// - 意味は「ラベル(text)＋インジケータの形」で担保（色/動きだけに依存しない）。
// - 装飾（リング/波形/ドット）は aria-hidden。状態は aria-live のラベルで読み上げる。
// - prefers-reduced-motion: reduce では全ループアニメを停止（静止でも意味が伝わる）。

import { INTERVIEW_PHASE_LABELS, type InterviewPhase } from '@/lib/interview/presence'
import { avatarVariantForPhase, type AvatarTone } from '@/lib/interview/avatarVisual'

const RING_TONE: Record<AvatarTone, string> = {
  slate: 'border-slate-300/30',
  blue: 'border-blue-400/50',
  green: 'border-green-400/60',
  indigo: 'border-indigo-400/60',
}
const TEXT_TONE: Record<AvatarTone, string> = {
  slate: 'text-white/60',
  blue: 'text-white/90',
  green: 'text-green-300',
  indigo: 'text-indigo-300',
}
const BAR_TONE: Record<AvatarTone, string> = {
  slate: 'bg-slate-300',
  blue: 'bg-blue-300',
  green: 'bg-green-300',
  indigo: 'bg-indigo-300',
}

export default function InterviewerAvatar({ phase }: { phase: InterviewPhase }) {
  const v = avatarVariantForPhase(phase)
  const label = INTERVIEW_PHASE_LABELS[phase]

  return (
    <div className="flex flex-col items-center">
      {/* アバター本体＋リング（コンテナは idle 時のみ breathing） */}
      <div className={`relative iv-motion-${v.motion}`}>
        {/* リング（装飾）。活動中(active)は強調、idle/connecting は控えめ、ending は静的。 */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-[-12px] rounded-full border-[3px] ${RING_TONE[v.tone]} ${
            v.active ? 'iv-ring-active' : ''
          } iv-ring-${v.motion}`}
        />
        {/* 既存写真を継続使用。装飾ではなく面接官本体なので alt を付与。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/ai-interviewer.jpg"
          alt="AI面接官"
          className="relative w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] md:w-[300px] md:h-[300px] rounded-full object-cover border-4 border-white/20 shadow-2xl"
        />
      </div>

      {/* インジケータ（装飾・aria-hidden）。形で状態を区別（waveform/listening/dots）。 */}
      <div aria-hidden="true" className="mt-4 h-6 flex items-end justify-center gap-1">
        {v.indicator === 'waveform' &&
          [0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`iv-bar iv-bar-${i} w-1 rounded-full ${BAR_TONE[v.tone]}`} />
          ))}
        {v.indicator === 'listening' &&
          [0, 1, 2].map((i) => (
            <span key={i} className={`iv-wave iv-wave-${i} w-1.5 rounded-full ${BAR_TONE[v.tone]}`} />
          ))}
        {v.indicator === 'dots' &&
          [0, 1, 2].map((i) => (
            <span key={i} className={`iv-dot iv-dot-${i} h-1.5 w-1.5 rounded-full ${BAR_TONE[v.tone]}`} />
          ))}
      </div>

      {/* 面接官名 */}
      <p className="text-sm sm:text-base text-white/90 mt-2">AI面接官</p>

      {/* 状態ラベル（aria-live）。idle は非表示。高さ固定でレイアウトを揺らさない。 */}
      <div className="mt-1 h-5 flex items-center justify-center">
        {label && (
          <p className={`text-xs sm:text-sm transition-opacity duration-300 ${TEXT_TONE[v.tone]}`} aria-live="polite">
            {label}
          </p>
        )}
      </div>

      <style>{`
        /* 静止時（既定・reduced-motion）でも状態が分かる基準スタイル */
        .iv-bar { height: 8px; }
        .iv-bar-0 { height: 6px; } .iv-bar-1 { height: 12px; } .iv-bar-2 { height: 18px; }
        .iv-bar-3 { height: 12px; } .iv-bar-4 { height: 6px; }
        .iv-wave { height: 10px; opacity: 0.7; }
        .iv-dot { opacity: 0.6; }
        .iv-ring-active { opacity: 0.9; }

        /* アニメーションは reduced-motion を尊重（reduce 時は付与しない＝静止） */
        @media (prefers-reduced-motion: no-preference) {
          .iv-motion-breathing { animation: iv-breathe 4.5s ease-in-out infinite; }

          .iv-ring-connecting { animation: iv-soft 1.8s ease-in-out infinite; }
          .iv-ring-speaking { animation: iv-pulse 1.5s ease-out infinite; }
          .iv-ring-listening { animation: iv-listen 2.2s ease-in-out infinite; }
          .iv-ring-thinking { animation: iv-soft 2s ease-in-out infinite; }

          .iv-bar { animation: iv-eq 1s ease-in-out infinite; }
          .iv-bar-0 { animation-delay: 0ms; } .iv-bar-1 { animation-delay: 120ms; }
          .iv-bar-2 { animation-delay: 240ms; } .iv-bar-3 { animation-delay: 120ms; }
          .iv-bar-4 { animation-delay: 0ms; }

          .iv-wave { animation: iv-eq 1.6s ease-in-out infinite; }
          .iv-wave-1 { animation-delay: 200ms; } .iv-wave-2 { animation-delay: 400ms; }

          .iv-dot { animation: iv-blink 1.2s ease-in-out infinite; }
          .iv-dot-1 { animation-delay: 200ms; } .iv-dot-2 { animation-delay: 400ms; }
        }

        @keyframes iv-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        @keyframes iv-soft { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.9; } }
        @keyframes iv-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          70% { transform: scale(1.1); opacity: 0; }
          100% { transform: scale(1.1); opacity: 0; }
        }
        @keyframes iv-listen { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.05); opacity: 0.95; } }
        @keyframes iv-eq { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(1.3); } }
        @keyframes iv-blink { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )
}

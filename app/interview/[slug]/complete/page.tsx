'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// TODO: AIの分析結果からタイプを判定
const PERSONALITY_TYPE = {
  name: '論理型リーダー',
  catchphrase: '冷静な分析力で周囲を導く、信頼のリーダー',
  description:
    'あなたは物事を論理的に整理し、根拠に基づいた判断ができるタイプです。チームの中では自然とまとめ役になることが多く、周囲からの信頼も厚い傾向があります。一方で、感情的な場面では慎重になりすぎることもあるかもしれません。',
}

// TODO: 実際のデータに差替え
const SUMMARY = {
  minutes: 25,
  questions: 6,
  avgResponseSeconds: 42,
  totalSpeakingTime: '8:30',
  speakingRate: 65,
}

// TODO: AIの分析結果から生成
const STRENGTHS = [
  {
    title: '自己表現力',
    description: '自身の経験や考えを、具体的なエピソードを交えながら分かりやすく伝えることができています。',
  },
  {
    title: '傾聴力',
    description: '質問の意図を正確に把握し、的確に回答する力が見られます。',
  },
  {
    title: '論理的思考',
    description: '回答に一貫性があり、筋道を立てて話を展開する力があります。',
  },
]

const RADAR_DATA = [
  { label: '行動力', value: 4 },
  { label: '協調性', value: 3 },
  { label: '分析力', value: 5 },
  { label: '創造性', value: 3 },
  { label: '安定性', value: 4 },
]

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V10M18 20V4M6 20v-4" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
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
    await supabase.from('applicants').update({ satisfaction_rating: rating }).eq('id', applicantId)
    setSubmitted(true)
  }

  const cx = 100
  const cy = 100
  const maxR = 72
  const getPoint = (i: number, r: number) => {
    const angle = (-90 + i * 72) * (Math.PI / 180)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }
  const dataPoints = RADAR_DATA.map((d, i) => getPoint(i, (d.value / 5) * maxR))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <div className="min-h-screen h-screen max-h-screen flex flex-col overflow-hidden bg-[#0a0a0f]">
      {/* 背景: グラデーションオーブ + ドットパターン */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-30">
          <svg className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="12" cy="12" r="0.5" fill="white" fillOpacity="0.15" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotGrid)" />
          </svg>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-5 min-h-0">
        {/* ヘッダー */}
        <header className="flex items-center justify-between shrink-0 mb-4 sm:mb-5">
          <span className="text-xs sm:text-sm font-bold tracking-wide text-cyan-400">AI人事24h</span>
          <h1 className="text-sm sm:text-base font-semibold text-white/90 tracking-tight">面接完了レポート</h1>
        </header>

        {/* メイン: 2×2 グリッド */}
        <main className="flex-1 grid grid-cols-2 gap-2 sm:gap-4 min-h-0 overflow-hidden">
          {/* 性格タイプカード */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-600 p-3 sm:p-5 flex flex-col shadow-xl shadow-violet-500/20 border border-gray-700/50">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.05)_100%)]" />
            <div className="relative flex items-center gap-2 mb-2 sm:mb-3">
              <div className="p-1.5 rounded-lg bg-white/10">
                <LightbulbIcon className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-200" />
              </div>
              <span className="text-[10px] sm:text-xs font-medium text-white/80 uppercase tracking-wider">性格タイプ診断</span>
            </div>
            <p className="relative text-base sm:text-xl lg:text-2xl font-bold text-white mb-1 sm:mb-2 leading-tight drop-shadow-sm">
              あなたは「{PERSONALITY_TYPE.name}」タイプ
            </p>
            <p className="relative text-sm sm:text-base text-white/95 mb-2 sm:mb-3 leading-snug drop-shadow-sm">{PERSONALITY_TYPE.catchphrase}</p>
            {/* TODO: AIの分析結果から生成 */}
            <p className="relative text-xs sm:text-sm text-white/90 leading-relaxed flex-1 line-clamp-4 sm:line-clamp-5 drop-shadow-sm">
              {PERSONALITY_TYPE.description}
            </p>
          </div>

          {/* 面接サマリーカード */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 border-gray-700/50 backdrop-blur-sm p-3 sm:p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <ClockIcon className="w-4 h-4 text-cyan-400/80 shrink-0" />
              <h3 className="text-[10px] sm:text-xs font-bold text-gray-300 uppercase tracking-wider">面接サマリー</h3>
            </div>
            <div className="flex gap-4 sm:gap-6 mb-3 sm:mb-4">
              <div>
                <p className="text-2xl sm:text-4xl font-bold text-white tabular-nums">{SUMMARY.minutes}</p>
                <p className="text-[10px] sm:text-xs text-gray-300 mt-0.5">分</p>
              </div>
              <div>
                <p className="text-2xl sm:text-4xl font-bold text-white tabular-nums">{SUMMARY.questions}</p>
                <p className="text-[10px] sm:text-xs text-gray-300 mt-0.5">問</p>
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2 text-[10px] sm:text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 shrink-0" />
                <span>平均応答 {SUMMARY.avgResponseSeconds}秒</span>
              </div>
              <div className="flex items-center gap-2">
                <MicIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 shrink-0" />
                <span>総発話 {SUMMARY.totalSpeakingTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <BarChartIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 shrink-0" />
                <span>発話率 {SUMMARY.speakingRate}%</span>
              </div>
            </div>
          </div>

          {/* 能力プロファイルカード */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 border-gray-700/50 backdrop-blur-sm p-3 sm:p-5 flex flex-col min-h-0">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <BarChartIcon className="w-4 h-4 text-violet-400/80 shrink-0" />
              <h3 className="text-[10px] sm:text-xs font-bold text-gray-300 uppercase tracking-wider">能力プロファイル</h3>
            </div>
            <div className="flex-1 min-h-[120px] sm:min-h-[160px] flex items-center justify-center">
              <svg viewBox="0 0 200 200" className="w-[120px] h-[120px] sm:w-[180px] sm:h-[180px] lg:w-[200px] lg:h-[200px] mx-auto">
                <defs>
                  <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.5" />
                  </linearGradient>
                  <filter id="radarGlow">
                    <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#60a5fa" floodOpacity="0.8" />
                  </filter>
                </defs>
                {/* 外枠 */}
                <path
                  d={[0, 1, 2, 3, 4].map((i) => getPoint(i, maxR)).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'}
                  fill="none"
                  stroke="rgba(96,165,250,0.6)"
                  strokeWidth="1.5"
                />
                {[1, 2, 3, 4, 5].map((l) => {
                  const r = (l / 5) * maxR
                  const pts = [0, 1, 2, 3, 4].map((i) => getPoint(i, r))
                  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
                  return <path key={l} d={path} fill="none" stroke="rgba(107,114,128,0.4)" strokeWidth="1" />
                })}
                {[0, 1, 2, 3, 4].map((i) => {
                  const p = getPoint(i, maxR)
                  return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(107,114,128,0.4)" strokeWidth="1" />
                })}
                <path
                  d={dataPath}
                  fill="url(#radarGrad)"
                  stroke="rgba(139,92,246,0.6)"
                  strokeWidth="1.5"
                  style={{ animation: 'radarGrow 0.8s ease-out forwards', transformOrigin: '100px 100px' }}
                />
                {dataPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="5" fill="#60a5fa" filter="url(#radarGlow)" />
                ))}
                {RADAR_DATA.map((d, i) => {
                  const p = getPoint(i, maxR + 14)
                  return (
                    <text key={i} x={p.x} y={p.y} textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="500">
                      {d.label}
                    </text>
                  )
                })}
              </svg>
            </div>
            <div className="flex flex-wrap gap-x-2 sm:gap-x-3 gap-y-0.5 justify-center text-[9px] sm:text-[10px] text-gray-300">
              {RADAR_DATA.map((d, i) => (
                <span key={i}>{d.label} {d.value}/5</span>
              ))}
            </div>
          </div>

          {/* あなたの強みカード */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 border-gray-700/50 backdrop-blur-sm p-3 sm:p-5 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <StarIcon className="w-4 h-4 text-amber-400 shrink-0" filled />
              <h3 className="text-[10px] sm:text-xs font-bold text-gray-300 uppercase tracking-wider">あなたの強み</h3>
            </div>
            {/* TODO: AIの分析結果から生成 */}
            <ul className="space-y-2 sm:space-y-3 flex-1 min-h-0 overflow-y-auto">
              {STRENGTHS.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400/80 shrink-0" />
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-white">{s.title}</p>
                    <p className="text-[10px] sm:text-xs text-gray-200 leading-relaxed mt-0.5">{s.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </main>

        {/* フッター */}
        <footer className="shrink-0 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-white/10">
          {!submitted ? (
            <div className="flex flex-col items-center gap-2 sm:gap-3">
              <p className="text-[10px] sm:text-xs font-medium text-gray-300">面接の体験はいかがでしたか？</p>
              <div className="flex gap-0.5 sm:gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHoverRating(s)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-0.5 sm:p-1 rounded-lg transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    <StarIcon
                      className={`w-5 h-5 sm:w-6 sm:h-6 transition-colors ${
                        s <= (hoverRating || rating) ? 'text-amber-400' : 'text-slate-600'
                      }`}
                      filled={s <= (hoverRating || rating)}
                    />
                  </button>
                ))}
              </div>
              <button
                onClick={handleSubmitRating}
                disabled={rating === 0}
                className={`px-5 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  rating > 0
                    ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white hover:opacity-90'
                    : 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/10'
                }`}
              >
                送信する
              </button>
            </div>
          ) : (
            <p className="text-center text-gray-300 text-xs sm:text-sm">ご協力ありがとうございます</p>
          )}
          <p className="text-center text-[9px] sm:text-[10px] text-gray-400 mt-3 sm:mt-4">Powered by AI人事24h</p>
        </footer>
      </div>
    </div>
  )
}

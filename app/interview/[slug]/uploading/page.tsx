'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const STEPS = [
  { id: 1, label: '動画を保存中...', completedLabel: '動画を保存しました' },
  { id: 2, label: '音声を確認中...', completedLabel: '音声を確認しました' },
  { id: 3, label: '回答内容を確認中...', completedLabel: '回答内容を確認しました' },
  { id: 4, label: 'あなたの個性を分析中...', completedLabel: 'あなたの個性を分析しました' },
  { id: 5, label: 'レポートを作成中...', completedLabel: 'レポートを作成しました' },
]

// 光の粒パーティクル（complete画面とトーン統一: cyan / violet）
const PARTICLES = [
  { left: '5%', top: '10%', size: 1, color: 'bg-cyan-400/40', dur: 20, delay: 0 },
  { left: '15%', top: '85%', size: 2, color: 'bg-violet-400/30', dur: 24, delay: 3 },
  { left: '25%', top: '45%', size: 1, color: 'bg-cyan-400/40', dur: 22, delay: 1 },
  { left: '35%', top: '70%', size: 2, color: 'bg-violet-400/30', dur: 26, delay: 5 },
  { left: '45%', top: '25%', size: 1, color: 'bg-cyan-400/40', dur: 18, delay: 0 },
  { left: '55%', top: '60%', size: 2, color: 'bg-violet-400/30', dur: 28, delay: 4 },
  { left: '65%', top: '15%', size: 1, color: 'bg-cyan-400/40', dur: 20, delay: 2 },
  { left: '75%', top: '90%', size: 2, color: 'bg-violet-400/30', dur: 22, delay: 1 },
  { left: '85%', top: '35%', size: 1, color: 'bg-cyan-400/40', dur: 25, delay: 6 },
  { left: '92%', top: '55%', size: 2, color: 'bg-violet-400/30', dur: 19, delay: 0 },
  { left: '8%', top: '65%', size: 1, color: 'bg-cyan-400/40', dur: 23, delay: 4 },
  { left: '22%', top: '20%', size: 2, color: 'bg-violet-400/30', dur: 21, delay: 2 },
  { left: '42%', top: '80%', size: 1, color: 'bg-cyan-400/40', dur: 27, delay: 1 },
  { left: '58%', top: '40%', size: 2, color: 'bg-violet-400/30', dur: 17, delay: 3 },
  { left: '72%', top: '5%', size: 1, color: 'bg-cyan-400/40', dur: 24, delay: 0 },
  { left: '88%', top: '75%', size: 2, color: 'bg-violet-400/30', dur: 20, delay: 5 },
  { left: '12%', top: '92%', size: 1, color: 'bg-cyan-400/40', dur: 26, delay: 2 },
  { left: '38%', top: '12%', size: 2, color: 'bg-violet-400/30', dur: 19, delay: 4 },
  { left: '62%', top: '52%', size: 1, color: 'bg-cyan-400/40', dur: 22, delay: 1 },
  { left: '78%', top: '28%', size: 2, color: 'bg-violet-400/30', dur: 25, delay: 0 },
  { left: '3%', top: '38%', size: 1, color: 'bg-cyan-400/40', dur: 18, delay: 3 },
  { left: '48%', top: '95%', size: 2, color: 'bg-violet-400/30', dur: 23, delay: 2 },
  { left: '95%', top: '18%', size: 1, color: 'bg-cyan-400/40', dur: 21, delay: 6 },
  { left: '18%', top: '50%', size: 2, color: 'bg-violet-400/30', dur: 27, delay: 1 },
  { left: '68%', top: '82%', size: 1, color: 'bg-cyan-400/40', dur: 20, delay: 4 },
]

export default function UploadingPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [currentStep, setCurrentStep] = useState(0)
  const [showComplete, setShowComplete] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // TODO: 実際のアップロード進捗に差替え
  useEffect(() => {
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, 5))
    }, 3000)
    return () => clearInterval(stepInterval)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 0.1), 100)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (elapsed >= 11.5) setShowComplete(true)
    if (elapsed >= 12) router.push(`/interview/${slug}/complete`)
  }, [elapsed, slug, router])

  const progress = Math.min((elapsed / 12) * 100, 100)
  const circumference = 2 * Math.PI * 90
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="fixed inset-0 min-h-screen overflow-hidden bg-[#0a0a0f]">
      {/* 背景: グラデーションオーブ（complete画面と統一） */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[400px] h-[400px] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[300px] h-[300px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      {/* ドットグリッド（complete画面と統一） */}
      <div className="absolute inset-0 opacity-40">
        <svg className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <pattern id="uploadDotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="0.5" fill="white" fillOpacity="0.12" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#uploadDotGrid)" />
        </svg>
      </div>

      {/* 背景グリッド線 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50" preserveAspectRatio="none">
        <defs>
          <pattern id="uploadGrid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(34,211,238,0.06)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#uploadGrid)" />
      </svg>

      {/* 光の粒パーティクル */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className={`absolute rounded-full ${p.color} ${p.size === 1 ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'}`}
          style={{
            left: p.left,
            top: p.top,
            animation: 'particle-float linear infinite',
            animationDuration: `${p.dur}s`,
            animationDelay: `-${p.delay}s`,
          }}
        />
      ))}

      <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
        {/* 中央の円形アニメーションエリア */}
        <div className="relative mb-12">
          {/* 波紋効果（複数重ね） */}
          {!showComplete && (
            <>
              <div
                className="absolute inset-0 flex items-center justify-center -m-8"
                style={{ animation: 'ripple-wave 2.5s ease-out infinite' }}
              >
                <div className="w-56 h-56 rounded-full border border-cyan-500/30" />
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center -m-8"
                style={{ animation: 'ripple-wave 2.5s ease-out infinite 0.8s' }}
              >
                <div className="w-56 h-56 rounded-full border border-violet-500/25" />
              </div>
            </>
          )}

          {/* パルスリング（拡大してフェード） */}
          {!showComplete && (
            <>
              <div
                className="absolute inset-0 flex items-center justify-center -m-6"
                style={{ animation: 'ring-pulse-expand 2s ease-out infinite' }}
              >
                <div className="w-60 h-60 rounded-full border-2 border-cyan-400/40" />
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center -m-6"
                style={{ animation: 'ring-pulse-expand 2s ease-out infinite 1s' }}
              >
                <div className="w-60 h-60 rounded-full border border-violet-400/30" />
              </div>
            </>
          )}

          {/* 逆回転リング（外側） */}
          <div className="absolute inset-0 flex items-center justify-center -m-5">
            <div
              className="w-80 h-80 rounded-full border border-cyan-500/25"
              style={{ animation: 'ring-reverse-spin 14s linear infinite' }}
            />
          </div>

          {/* 正回転リング（中） */}
          <div className="absolute inset-0 flex items-center justify-center -m-4">
            <div
              className="w-72 h-72 rounded-full border border-dashed border-violet-500/20"
              style={{ animation: 'ring-spin-slow 20s linear infinite' }}
            />
          </div>

          {/* パルス円 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-64 h-64 rounded-full border-2 border-cyan-500/30"
              style={{ animation: 'ring-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }}
            />
          </div>

          {/* 回転リング */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-56 h-56 rounded-full border border-cyan-400/40"
              style={{ animation: 'ring-spin-slow 8s linear infinite' }}
            />
          </div>

          {/* 円形プログレス */}
          <div className="relative flex items-center justify-center w-48 h-48">
            <svg className="w-48 h-48 -rotate-90" viewBox="0 0 200 200">
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="rgba(34,211,238,0.15)"
                strokeWidth="8"
              />
              <circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="url(#uploadProgressGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-300 ease-out"
              />
              <defs>
                <linearGradient id="uploadProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="50%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
            {showComplete ? (
              <div className="absolute flex flex-col items-center gap-2" style={{ animation: 'upload-zoom-in 0.4s ease-out forwards' }}>
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/50">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-emerald-400">分析完了</span>
              </div>
            ) : currentStep === 0 ? (
              <div className="absolute flex flex-col items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded-full bg-cyan-400"
                  style={{ animation: 'glow-pulse 1.5s ease-in-out infinite' }}
                />
                <span className="text-xs text-white/70 font-medium tracking-wide">お疲れ様でした</span>
              </div>
            ) : (
              <div className="absolute flex flex-col items-center gap-1.5">
                <div
                  className="w-4 h-4 rounded-full bg-cyan-400"
                  style={{ animation: 'glow-pulse 1.5s ease-in-out infinite' }}
                />
                <span className="text-xs text-cyan-300/90 font-medium tracking-wide">解析中</span>
              </div>
            )}
          </div>
        </div>

        {/* ステップ表示 */}
        <div className="space-y-3 w-full max-w-xs mb-8">
          {STEPS.map((step, i) => {
            const stepIndex = i + 1 // ステップIDは1から始まる
            const done = stepIndex < currentStep
            const active = stepIndex === currentStep && !showComplete
            const displayLabel = done && step.completedLabel ? step.completedLabel : step.label
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-500 ${
                  active ? 'bg-cyan-500/15 border border-cyan-400/30' : ''
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    done ? 'bg-emerald-500' : active ? 'bg-cyan-500 animate-pulse' : 'bg-slate-700'
                  }`}
                >
                  {done ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-white/60" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    done ? 'text-emerald-300' : active ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  {displayLabel}
                </span>
              </div>
            )
          })}
        </div>

        <div className="text-center mb-2">
          {showComplete ? (
            <p className="text-green-400 font-medium text-base text-center">レポートが完成しました！</p>
          ) : (
            <>
              <p className="text-white/50 text-sm text-center">⚠ すべての処理が完了するまで画面を閉じないでください</p>
            </>
          )}
        </div>
      </div>

      {/* 完了時のフラッシュ */}
      {showComplete && (
        <div
          className="absolute inset-0 bg-white/20"
          style={{ animation: 'upload-flash 0.6s ease-out' }}
        />
      )}
    </div>
  )
}

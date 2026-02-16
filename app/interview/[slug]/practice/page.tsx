'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  StepIndicator,
  PrimaryButton,
} from '@/components/interview/FormComponents'

const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '練習パート', '面接']

const PRACTICE_QUESTIONS = [
  '最近ハマっていることは何ですか？',
  '今日の朝ごはんは何を食べましたか？',
  '好きな季節とその理由を教えてください',
]

export default function PracticePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [blinking, setBlinking] = useState(false)
  const [hasStream, setHasStream] = useState(false)
  const [showCompletionDialog, setShowCompletionDialog] = useState(false)
  const [showWaitingScreen, setShowWaitingScreen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])

  // カメラ取得
  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        streamRef.current = stream
        setHasStream(true)
      } catch (error) {
        console.error('カメラへのアクセスに失敗しました:', error)
      }
    }

    setupCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (hasStream && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [hasStream])

  // まばたきアニメーション
  useEffect(() => {
    function scheduleBlink() {
      const delay = 3000 + Math.random() * 2000 // 3000-5000ms
      const timer = setTimeout(() => {
        setBlinking(true)
        setTimeout(() => {
          setBlinking(false)
          scheduleBlink()
        }, 150)
      }, delay)
      timeoutRefs.current.push(timer)
    }

    scheduleBlink()

    return () => {
      timeoutRefs.current.forEach((timer) => clearTimeout(timer))
      timeoutRefs.current = []
    }
  }, [])

  // 質問の自動切り替え（ダミー：今は1問目を固定表示）
  // TODO: Phase 4 - 実際の音声認識で回答が完了したら次の質問へ

  const handleStartInterview = () => {
    setShowCompletionDialog(false)
    setShowWaitingScreen(true)
    // 2秒後に本番セッションへ遷移
    setTimeout(() => {
      router.push(`/interview/${slug}/session`)
    }, 2000)
  }

  const handleSkip = () => {
    if (window.confirm('練習をスキップして本番を開始しますか？')) {
      router.push(`/interview/${slug}/session`)
    }
  }

  // 練習完了の処理（3問終了後）
  useEffect(() => {
    // ダミー：実際には音声認識で回答が完了したら呼び出す
    // if (currentQuestionIndex >= PRACTICE_QUESTIONS.length - 1 && answerCompleted) {
    //   setShowCompletionDialog(true)
    // }
  }, [currentQuestionIndex])

  if (showWaitingScreen) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 sm:p-12 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            準備ができたらスタートボタンを押してください
          </h2>
          <p className="text-sm text-gray-600">
            面接を開始します...
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx>{`
        @keyframes breathing {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
          100% {
            transform: translateY(0px);
          }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col overflow-y-auto">
        {/* ステップインジケーター */}
        <div className="pt-8 px-4 shrink-0">
          <div className="max-w-[720px] mx-auto mb-6">
            <StepIndicator currentStep={5} totalSteps={6} labels={STEP_LABELS} />
          </div>
        </div>

        {/* 練習モード画面 */}
        <div className="flex-1 bg-gradient-to-b from-purple-900 to-purple-800 flex flex-col items-center justify-center relative min-h-[calc(100vh-200px)] py-8 px-4">
          {/* 応募者カメラ小窓（左上固定） */}
          <div className="absolute top-4 left-4 z-10 w-40 h-30 rounded-lg border border-white/20 overflow-hidden bg-purple-800">
            {hasStream ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                <svg
                  className="w-8 h-8 mb-1"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-xs">カメラOFF</span>
              </div>
            )}
          </div>

          {/* タイマー（上部中央） */}
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 text-sm text-gray-300">
            練習時間：約3分
          </div>

          {/* AIアバターエリア（画面中央） */}
          <div className="flex flex-col items-center justify-evenly flex-1 w-full gap-4">
            {/* 練習モードバッジ（アバターの上） */}
            <div className="mt-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/90 text-white text-sm font-bold rounded-lg shadow-lg border-2 border-yellow-300">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                練習モード — 評価対象外
              </div>
            </div>

            <div
              className="w-[220px] h-[220px] md:w-[300px] md:h-[300px] rounded-full overflow-hidden border-4 border-white/20 bg-gradient-to-br from-purple-700 to-purple-600 relative"
              style={{
                willChange: 'transform',
                animation: 'breathing 2s ease-in-out infinite',
                boxShadow: '0 0 25px rgba(168, 85, 247, 0.3), 0 0 50px rgba(168, 85, 247, 0.4)',
              }}
            >
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* 頭部 */}
                <circle cx="50" cy="35" r="22" fill="#E8D5B7" />
                
                {/* 胴体 */}
                <ellipse cx="50" cy="75" rx="30" ry="25" fill="#6B21A8" />
                
                {/* 左目 */}
                <circle cx="42" cy="32" r="2.5" fill="#1E293B" />
                
                {/* 右目 */}
                <circle cx="58" cy="32" r="2.5" fill="#1E293B" />
                
                {/* 口（微笑み曲線） */}
                <path
                  d="M 40 42 Q 50 48 60 42"
                  stroke="#1E293B"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                />
                
                {/* まばたき用オーバーレイ */}
                <rect
                  x="35"
                  y="28"
                  width="30"
                  height="8"
                  fill="#E8D5B7"
                  opacity={blinking ? 1 : 0}
                  style={{ transition: 'opacity 0.08s ease' }}
                />
              </svg>
            </div>

            {/* AI面接官テキスト */}
            <p className="text-white text-base">AI面接官（練習モード）</p>

            {/* 現在の練習質問表示 */}
            <div className="max-w-lg mx-auto mt-6 bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-white text-base leading-relaxed text-center">
              <p className="text-sm text-purple-200 mb-2">
                練習 {currentQuestionIndex + 1}/{PRACTICE_QUESTIONS.length}
              </p>
              <p className="text-lg font-medium">
                {PRACTICE_QUESTIONS[currentQuestionIndex]}
              </p>
            </div>

            {/* 練習をスキップボタン（画面下部、通常のフロー内） */}
            <div className="mt-8 mb-24">
              <button
                onClick={handleSkip}
                className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition-colors border border-white/30"
              >
                練習をスキップして本番へ
              </button>
            </div>
          </div>
        </div>

        {/* 完了ダイアログ */}
        {showCompletionDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 max-w-md w-full">
              <h2 className="text-xl font-bold text-gray-900 mb-4 text-center">
                練習完了！
              </h2>
              <p className="text-sm text-gray-600 mb-6 text-center">
                本番を始めますか？
              </p>
              <div className="space-y-3">
                <PrimaryButton onClick={handleStartInterview} className="w-full">
                  本番を始める
                </PrimaryButton>
                <button
                  onClick={() => setShowCompletionDialog(false)}
                  className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  もう一度練習する
                </button>
              </div>
            </div>
          </div>
        )}
        <footer className="relative py-4 text-center text-sm text-gray-500 shrink-0">
          Powered by AI人事24h
        </footer>
      </div>
      {/* TODO: Phase 4 - Whisperで音声認識、練習回答は記録・評価しない */}
    </>
  )
}

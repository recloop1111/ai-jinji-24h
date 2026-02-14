'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [interviewState, setInterviewState] = useState<'idle' | 'listen' | 'think' | 'speak' | 'react'>('idle')
  const [blinking, setBlinking] = useState(false)
  const [showConnectionBanner, setShowConnectionBanner] = useState(false)
  const [bannerOpacity, setBannerOpacity] = useState(0)
  const [aiSpeechText, setAiSpeechText] = useState('')
  const [demoMode] = useState(false)
  const [hasStream, setHasStream] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])

  const MAX_INTERVIEW_SECONDS = 40 * 60

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

  // デモ用の状態自動遷移
  useEffect(() => {
    if (!demoMode) return

    function cycleStates() {
      // idle (3秒)
      setInterviewState('idle')
      const t1 = setTimeout(() => {
        // listen (4秒)
        setInterviewState('listen')
        const t2 = setTimeout(() => {
          // think (2秒)
          setInterviewState('think')
          const t3 = setTimeout(() => {
            // speak (5秒)
            setInterviewState('speak')
            const t4 = setTimeout(() => {
              // react (1秒)
              setInterviewState('react')
              const t5 = setTimeout(() => {
                // idleに戻ってサイクル繰り返し
                cycleStates()
              }, 1000)
              timeoutRefs.current.push(t5)
            }, 5000)
            timeoutRefs.current.push(t4)
          }, 2000)
          timeoutRefs.current.push(t3)
        }, 4000)
        timeoutRefs.current.push(t2)
      }, 3000)
      timeoutRefs.current.push(t1)
    }

    cycleStates()

    return () => {
      timeoutRefs.current.forEach((timer) => clearTimeout(timer))
      timeoutRefs.current = []
    }
  }, [demoMode])

  // 回線品質バナーのフェードアニメーション
  useEffect(() => {
    if (showConnectionBanner) {
      setBannerOpacity(1)
      const timer = setTimeout(() => {
        setBannerOpacity(0)
        setTimeout(() => setShowConnectionBanner(false), 300)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [showConnectionBanner])

  // TODO: OpenAI Realtime API接続後に実データへ差替え
  useEffect(() => {
    const t1 = setTimeout(() => {
      setAiSpeechText('本日は面接にお越しいただきありがとうございます。まず自己紹介をお願いできますか？')
    }, 3000)
    const t2 = setTimeout(() => {
      setAiSpeechText('')
    }, 10000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  // 面接タイマー（40分で自動終了）
  useEffect(() => {
    if (elapsedSeconds >= MAX_INTERVIEW_SECONDS) {
      handleEndInterview()
      return
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [elapsedSeconds])

  function handleEndInterview() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    router.push(`/interview/${slug}/uploading`)
  }

  // 状態に応じたbox-shadowの色とアニメーション設定
  function getAvatarShadowStyle() {
    const baseStyle: React.CSSProperties = {
      willChange: 'transform',
      animation: 'breathing 2s ease-in-out infinite',
    }

    switch (interviewState) {
      case 'idle':
        return {
          ...baseStyle,
          boxShadow: '0 0 20px rgba(255,255,255,0.1), 0 0 40px rgba(255,255,255,0.05)',
          animation: 'breathing 4s ease-in-out infinite',
        }
      case 'listen':
        return {
          ...baseStyle,
          boxShadow: '0 0 25px rgba(34, 197, 94, 0.2), 0 0 50px rgba(34, 197, 94, 0.3)',
          animation: 'breathing 4s ease-in-out infinite',
        }
      case 'think':
        return {
          ...baseStyle,
          boxShadow: '0 0 25px rgba(59, 130, 246, 0.3), 0 0 50px rgba(59, 130, 246, 0.5)',
          animation: 'breathing 2s ease-in-out infinite',
        }
      case 'speak':
        return {
          ...baseStyle,
          boxShadow: '0 0 25px rgba(147, 197, 253, 0.3), 0 0 50px rgba(147, 197, 253, 0.4)',
          animation: 'breathing 6s ease-in-out infinite',
        }
      case 'react':
        return {
          ...baseStyle,
          boxShadow: '0 0 25px rgba(251, 191, 36, 0.4), 0 0 50px rgba(251, 191, 36, 0.5)',
          animation: 'reactPulse 1.1s ease-in-out',
        }
      default:
        return baseStyle
    }
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
        @keyframes reactPulse {
          0% {
            opacity: 0;
          }
          27% {
            opacity: 1;
          }
          77% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center relative">
        {/* 面接経過時間（上部中央） */}
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-30 text-sm text-gray-500">
          {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:
          {String(elapsedSeconds % 60).padStart(2, '0')} / 40:00
        </div>

        {/* 応募者カメラ小窓（左上固定） */}
        <div className="fixed top-4 left-4 z-10 w-40 h-30 rounded-lg border border-white/20 overflow-hidden bg-slate-800">
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

        {/* 回線品質バナー（上部中央） */}
        {showConnectionBanner && (
          <div
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20 bg-yellow-500/90 text-white text-sm py-2 px-4 rounded-lg transition-opacity duration-300"
            style={{ opacity: bannerOpacity }}
          >
            通信が不安定です。Wi-Fi環境をお試しください。
          </div>
        )}

        {/* AIアバターエリア（画面中央） */}
        <div className="flex flex-col items-center">
          <div
            className="w-[220px] h-[220px] md:w-[300px] md:h-[300px] rounded-full overflow-hidden border-4 border-white/20 bg-gradient-to-br from-slate-700 to-slate-600 relative"
            style={getAvatarShadowStyle()}
          >
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* 頭部 */}
              <circle cx="50" cy="35" r="22" fill="#E8D5B7" />
              
              {/* 胴体 */}
              <ellipse cx="50" cy="75" rx="30" ry="25" fill="#334155" />
              
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
          <p className="text-white text-base mt-3">AI面接官</p>

          {/* 発話状態テキスト（聞いています…/考えています…） */}
          <div
            className={`mt-2 transition-opacity duration-300 ${
              interviewState === 'listen' || interviewState === 'think'
                ? 'opacity-100'
                : 'opacity-0'
            }`}
          >
            {interviewState === 'listen' && (
              <p className="text-green-400 text-sm">聞いています...</p>
            )}
            {interviewState === 'think' && (
              <p className="text-blue-400 text-sm">考えています...</p>
            )}
          </div>

          {/* AI発話テキスト表示エリア */}
          <div
            className={`max-w-lg mx-auto mt-6 bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-white text-base leading-relaxed text-center line-clamp-3 transition-opacity duration-500 ${
              aiSpeechText ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {aiSpeechText}
          </div>
        </div>

        {/* 面接終了ボタン（デスクトップ） */}
        <button
          onClick={() => {
            if (window.confirm('面接を終了しますか？終了後は再開できません。')) {
              handleEndInterview()
            }
          }}
          className="hidden md:block fixed bottom-6 right-6 z-10 text-red-400 hover:text-red-300 text-sm px-4 py-2 transition-colors"
        >
          面接を終了する
        </button>

        {/* 面接終了ボタン（モバイル） */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900/80 py-3 text-center z-10">
          <button
            onClick={() => {
              if (window.confirm('面接を終了しますか？終了後は再開できません。')) {
                handleEndInterview()
              }
            }}
            className="text-red-400 text-xs transition-colors"
          >
            面接を終了する
          </button>
        </div>
      </div>
    </>
  )
}

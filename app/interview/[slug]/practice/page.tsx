'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  PrimaryButton,
} from '@/components/interview/FormComponents'

const PRACTICE_QUESTIONS = [
  '最近ハマっていることは何ですか？',
  '今日の朝ごはんは何を食べましたか？',
  '好きな季節とその理由を教えてください。',
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
  const [toast, setToast] = useState<string | null>(null)
  const [phase, setPhase] = useState<'showing' | 'recording' | 'next'>('showing')
  const [recordingSeconds, setRecordingSeconds] = useState(30)
  const [showCompletion, setShowCompletion] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showStartOverlay, setShowStartOverlay] = useState(true)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recognitionRef = useRef<any>(null)
  const lastResultTimeRef = useRef<number | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const showingTimerRef = useRef<NodeJS.Timeout | null>(null)

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

  // 録音開始処理
  const startListening = () => {
    setPhase('recording')
    setIsListening(true)
    setRecordingSeconds(30)
    lastResultTimeRef.current = Date.now()

    // SpeechRecognition API の確認
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      // 音声認識を使用
      const recognition = new SpeechRecognition()
      recognition.lang = 'ja-JP'
      recognition.continuous = true
      recognition.interimResults = true
      recognitionRef.current = recognition

      recognition.onresult = (event: any) => {
        lastResultTimeRef.current = Date.now()
        
        // 最終結果を確認
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            // 発話終了を検出
            recognition.stop()
            setIsListening(false)
            
            // 1秒待ってから次の質問へ
            setTimeout(() => {
              if (currentQuestionIndex < PRACTICE_QUESTIONS.length - 1) {
                setCurrentQuestionIndex(currentQuestionIndex + 1)
              } else {
                // 3問終了
                setShowCompletion(true)
              }
            }, 1000)
            return
          }
        }
      }

      recognition.onerror = (event: any) => {
        // aborted エラーは無視（ユーザー操作による中断の可能性がある）
        if (event.error === 'aborted') {
          startFallbackTimer()
          return
        }
        console.error('Speech recognition error:', event.error)
        // エラー時はフォールバックに切り替え
        startFallbackTimer()
      }

      recognition.onend = () => {
        // 3秒間新たな音声入力がなかった場合
        if (lastResultTimeRef.current && Date.now() - lastResultTimeRef.current >= 3000) {
          setIsListening(false)
          setTimeout(() => {
            if (currentQuestionIndex < PRACTICE_QUESTIONS.length - 1) {
              setCurrentQuestionIndex(currentQuestionIndex + 1)
            } else {
              setShowCompletion(true)
            }
          }, 1000)
        }
      }

      // 3秒間の無音検出タイマー
      const checkSilence = () => {
        if (lastResultTimeRef.current && Date.now() - lastResultTimeRef.current >= 3000) {
          recognition.stop()
          setIsListening(false)
          setTimeout(() => {
            if (currentQuestionIndex < PRACTICE_QUESTIONS.length - 1) {
              setCurrentQuestionIndex(currentQuestionIndex + 1)
            } else {
              setShowCompletion(true)
            }
          }, 1000)
        } else {
          silenceTimerRef.current = setTimeout(checkSilence, 500)
        }
      }
      silenceTimerRef.current = setTimeout(checkSilence, 500)

      recognition.start()
    } else {
      // SpeechRecognition非対応ブラウザ向けフォールバック
      startFallbackTimer()
    }
  }

  function startFallbackTimer() {
    // 30秒カウントダウン
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        if (prev <= 1) {
          setIsListening(false)
          if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current)
          }
          // 次の質問へ
          if (currentQuestionIndex < PRACTICE_QUESTIONS.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1)
          } else {
            // 3問終了
            setShowCompletion(true)
          }
          return 30
        }
        return prev - 1
      })
    }, 1000)
  }

  // 「練習を開始する」ボタンのクリックハンドラ
  const handleStartPractice = () => {
    setShowStartOverlay(false)
    setPhase('showing')
  }

  // 質問の自動フロー
  useEffect(() => {
    // 開始オーバーレイが表示されている場合は何もしない
    if (showStartOverlay) {
      return
    }

    if (currentQuestionIndex >= PRACTICE_QUESTIONS.length) {
      return
    }

    // 'showing' 状態から開始
    if (phase === 'showing') {
      // 3秒後に自動で 'recording' に切り替え
      showingTimerRef.current = setTimeout(() => {
        setPhase('recording')
        startListening()
      }, 3000)

      return () => {
        if (showingTimerRef.current) {
          clearTimeout(showingTimerRef.current)
        }
      }
    }

    // 'recording' 状態のクリーンアップ
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
      }
      if (showingTimerRef.current) {
        clearTimeout(showingTimerRef.current)
      }
    }
  }, [currentQuestionIndex, showStartOverlay, phase])

  // 次の質問に遷移したら再び 'showing' から開始
  useEffect(() => {
    if (!showStartOverlay && currentQuestionIndex < PRACTICE_QUESTIONS.length) {
      setPhase('showing')
    }
  }, [currentQuestionIndex, showStartOverlay])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

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
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-900 to-slate-800 relative">
        {/* トースト通知 */}
        {toast && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-lg animate-fade-in">
            {toast}
          </div>
        )}

        {/* 練習時間（上部中央・本番の00:02/40:00と同じ位置） */}
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-30 text-sm text-gray-500">
          練習時間：約3分
        </div>

        {/* 応募者カメラ小窓（左上固定・本番と同じ） */}
        <div className="fixed top-3 left-3 z-10 w-24 h-18 sm:w-32 sm:h-24 md:w-36 md:h-28 rounded-xl overflow-hidden shadow-lg border-2 border-white/30 bg-slate-800">
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

        {/* AIアバターエリア（画面中央・本番と同構造） */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="rounded-full ring-4 ring-blue-500/20 shadow-2xl">
              <img
                src="/images/ai-interviewer.jpg"
                alt="AI面接官"
                className="w-[220px] h-[220px] md:w-[300px] md:h-[300px] rounded-full object-cover border-4 border-white/20"
              />
            </div>

            {/* AI面接官テキスト */}
            <p className="text-sm sm:text-base text-white/90 mt-3">AI面接官（練習モード）</p>

            {/* 練習モードバッジ（アバター名の直下） */}
            <div className="mt-2">
              <div className="inline-block text-[10px] px-3 py-1 rounded-full bg-yellow-500/80 text-white font-medium">
                練習モード — 評価対象外
              </div>
            </div>
          </div>
        </div>

        {/* 質問・ボタン類（fixed bottom・アバターの中央配置に影響しない） */}
        <div className="fixed bottom-0 left-0 right-0 z-10 flex flex-col items-center px-4 pb-8 pt-4 bg-gradient-to-t from-slate-900/95 to-transparent">
          {showCompletion ? (
            <div className="w-full max-w-md bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-5 text-center">
              <p className="text-xl font-bold text-white text-center">練習が完了しました！</p>
              <p className="text-sm text-white/70 text-center mt-2">
                お疲れ様でした。準備ができたら本番に進んでください。
              </p>
              <button
                onClick={() => router.push(`/interview/${slug}/session`)}
                className="mt-6 bg-white text-gray-900 rounded-full px-8 py-4 text-base font-bold shadow-xl hover:bg-gray-100 transition-all"
              >
                本番面接を開始する
              </button>
            </div>
          ) : (
            <>
              {/* 質問テロップ */}
              <div className="w-full max-w-md bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-5 text-center">
                {showStartOverlay ? (
                  <p className="text-lg sm:text-xl text-white font-medium">
                    開始ボタンを押すと練習が始まります
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-white/50 mb-2">
                      質問 {currentQuestionIndex + 1}/{PRACTICE_QUESTIONS.length}
                    </p>
                    <p className="text-lg sm:text-xl text-white font-medium">
                      {PRACTICE_QUESTIONS[currentQuestionIndex]}
                    </p>
                  </>
                )}
              </div>

              {/* 録音中表示 */}
              {phase === 'recording' && (
                <div className="mt-4 text-center">
                  {isListening ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse inline-block" />
                      <p className="text-sm text-white/70">あなたの番です。話してください...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse inline-block" />
                      <p className="text-sm text-white/70">録音中... 残り {recordingSeconds}秒</p>
                    </div>
                  )}
                </div>
              )}

              {/* AI面接官が質問している表示 */}
              {phase === 'showing' && !showStartOverlay && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-white/50 animate-pulse">AI面接官が質問しています...</p>
                </div>
              )}

              {/* 練習をスキップボタン */}
              <div className="mt-6 text-center">
                <button
                  onClick={handleSkip}
                  className="text-sm text-white/40 border border-white/20 rounded-full px-6 py-2 hover:bg-white/10 transition-all"
                >
                  練習をスキップして本番へ
                </button>
              </div>
            </>
          )}
        </div>

        {/* 開始オーバーレイ */}
        {showStartOverlay && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <button
              onClick={handleStartPractice}
              className="bg-white text-gray-900 rounded-full px-8 py-4 text-lg font-bold shadow-xl hover:scale-105 transition-transform"
            >
              練習を開始する
            </button>
          </div>
        )}

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
      </div>
      {/* TODO: Phase 4 - Whisperで音声認識、練習回答は記録・評価しない */}
      {/* TODO: 段階4 - OpenAI TTS APIで質問を音声読み上げする。SpeechSynthesisは使用しない。 */}
      {/* TODO: 段階4 - Supabase接続を本実装する */}
    </>
  )
}

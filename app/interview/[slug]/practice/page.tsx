'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Globe, Play, Info, ChevronRight } from 'lucide-react'
import { AI_INTERVIEWER } from '@/lib/interview/interviewer-identity'
import InterviewerAvatar from '@/components/interview/InterviewerAvatar'
import { shouldEndPracticeAnswer, ANSWER_SILENCE_MS } from '@/lib/interview/practice-answer-end'

const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

const PRACTICE_QUESTIONS = [
  '最近ハマっていることは何ですか？',
  '今日の朝ごはんは何を食べましたか？',
  '好きな季節とその理由を教えてください。',
]

// SpeechRecognition の最小型（any を避けつつブラウザ差を吸収）。
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: (e: { resultIndex: number; results: { isFinal: boolean }[] }) => void
  onerror: (e: { error: string }) => void
  onend: () => void
  start: () => void
  stop: () => void
}

export default function PracticePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [companyName, setCompanyName] = useState('テスト株式会社')
  const [selectedLanguage, setSelectedLanguage] = useState('ja')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [hasStream, setHasStream] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [phase, setPhase] = useState<'showing' | 'recording'>('showing')
  const [recordingSeconds, setRecordingSeconds] = useState(30)
  const [showCompletion, setShowCompletion] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showStartOverlay, setShowStartOverlay] = useState(true)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const lastResultTimeRef = useRef<number | null>(null) // 最後に発話を検出した時刻（未発話は null）
  const hasSpokenRef = useRef(false) // 一度でも発話を検出したか（未発話で終了させないためのゲート）
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 企業名（表示のみ・public-config を他画面と同じく再利用）。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/interview/${slug}/public-config`)
        const json = await res.json().catch(() => null)
        if (!cancelled && res.ok && json?.company?.name) setCompanyName(json.company.name)
      } catch {
        /* noop */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  // 言語の表示同期（他画面と同じ sessionStorage キー）。
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch {
      /* noop */
    }
  }, [slug])

  // カメラ取得（練習用の小窓プレビュー）。
  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        streamRef.current = stream
        setHasStream(true)
      } catch {
        /* noop */
      }
    }
    setupCamera()
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (hasStream && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [hasStream])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const goNextOrComplete = () => {
    setIsListening(false)
    setTimeout(() => {
      if (currentQuestionIndex < PRACTICE_QUESTIONS.length - 1) {
        setCurrentQuestionIndex((i) => i + 1)
      } else {
        setShowCompletion(true)
      }
    }, 1000)
  }

  // 録音開始。正式仕様: 発話開始後、最後の発話から約5秒無音で回答終了（未発話では終了しない）。
  const startListening = () => {
    setPhase('recording')
    setIsListening(true)
    setRecordingSeconds(30)
    // 未発話状態から開始（質問提示直後から5秒を数えない）。
    lastResultTimeRef.current = null
    hasSpokenRef.current = false

    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'ja-JP'
      recognition.continuous = true
      recognition.interimResults = true
      recognitionRef.current = recognition

      recognition.onresult = (event) => {
        // 発話を検出＝ゲートを開き、最後の発話時刻を更新。
        hasSpokenRef.current = true
        lastResultTimeRef.current = Date.now()
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            recognition.stop()
            goNextOrComplete()
            return
          }
        }
      }
      recognition.onerror = () => startFallbackTimer()
      recognition.onend = () => {
        if (
          shouldEndPracticeAnswer({
            hasSpoken: hasSpokenRef.current,
            lastSpeechAtMs: lastResultTimeRef.current,
            nowMs: Date.now(),
          })
        ) {
          goNextOrComplete()
        }
      }

      // 発話開始後、最後の発話から ANSWER_SILENCE_MS(=5秒) 無音で終了。未発話中は終了しない。
      const checkSilence = () => {
        if (
          shouldEndPracticeAnswer({
            hasSpoken: hasSpokenRef.current,
            lastSpeechAtMs: lastResultTimeRef.current,
            nowMs: Date.now(),
          })
        ) {
          recognition.stop()
          goNextOrComplete()
        } else {
          silenceTimerRef.current = setTimeout(checkSilence, 500)
        }
      }
      silenceTimerRef.current = setTimeout(checkSilence, 500)
      recognition.start()
    } else {
      // SpeechRecognition 非対応ブラウザ向けフォールバック（既存設計を維持: 30秒カウントダウン）。
      startFallbackTimer()
    }
  }

  function startFallbackTimer() {
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => {
        if (prev <= 1) {
          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
          goNextOrComplete()
          return 30
        }
        return prev - 1
      })
    }, 1000)
  }

  // 「練習を開始する」（既存ロジック維持: overlay を閉じて質問フロー開始）。
  const handleStartPractice = () => {
    setShowStartOverlay(false)
    setPhase('showing')
  }

  const handleSkip = () => {
    if (window.confirm('練習をスキップして本番を開始しますか？')) {
      router.push(`/interview/${slug}/session`)
    }
  }

  // 質問の自動フロー（showing 3秒 → recording）。
  useEffect(() => {
    if (showStartOverlay || showCompletion) return
    if (currentQuestionIndex >= PRACTICE_QUESTIONS.length) return
    if (phase === 'showing') {
      showingTimerRef.current = setTimeout(() => {
        setPhase('recording')
        startListening()
      }, 3000)
      return () => {
        if (showingTimerRef.current) clearTimeout(showingTimerRef.current)
      }
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recognitionRef.current) recognitionRef.current.stop()
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (showingTimerRef.current) clearTimeout(showingTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex, showStartOverlay, phase, showCompletion])

  // 次の質問へ遷移したら再び showing から。
  useEffect(() => {
    if (!showStartOverlay && !showCompletion && currentQuestionIndex < PRACTICE_QUESTIONS.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase('showing')
    }
  }, [currentQuestionIndex, showStartOverlay, showCompletion])

  // ── 共通: dark interview shell（ヘッダー＋応募者カメラ小窓）──────────────────────────────
  const header = (
    <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
      <span className="truncate text-base font-bold text-white">{companyName}</span>
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
          className="cursor-pointer rounded-xl border border-white/15 bg-white/5 py-2 pl-9 pr-3 text-sm font-medium text-white shadow-sm backdrop-blur transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="text-slate-900">
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  )

  const cameraPip = (
    <div className="absolute left-4 top-16 z-10 h-20 w-28 overflow-hidden rounded-xl border border-white/20 bg-slate-800 shadow-lg sm:h-24 sm:w-36">
      {hasStream ? (
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">カメラ</div>
      )}
    </div>
  )

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0a1020] text-white">
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-6 py-3 text-white shadow-lg">
          {toast}
        </div>
      )}
      {header}
      {cameraPip}

      {showStartOverlay ? (
        /* 練習開始画面（参考デザイン左）。 */
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-10">
          <div className="[--tw-shadow-color:rgba(37,99,235,0.35)] drop-shadow-[0_0_40px_var(--tw-shadow-color)]">
            <InterviewerAvatar phase="idle" />
          </div>
          <h1 className="mt-6 text-2xl font-bold sm:text-3xl">AI面接官（練習モード）</h1>
          <span className="mt-3 inline-flex items-center rounded-full bg-blue-500/20 px-4 py-1.5 text-sm font-medium text-blue-300">
            練習モード・評価対象外
          </span>
          <p className="mt-4 text-sm text-white/70">AI面接官との練習を開始します</p>

          <button
            onClick={handleStartPractice}
            className="mt-7 flex w-full max-w-md items-center justify-center gap-2.5 rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-[0_0_30px_-6px_rgba(37,99,235,0.7)] transition hover:bg-blue-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 active:scale-[0.99]"
          >
            <Play className="h-5 w-5 fill-current" />
            練習を開始する
          </button>

          <div className="mt-5 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-white">
              <Info className="h-5 w-5 text-blue-400" />
              <span className="font-bold">練習について</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              本番と同じ形式で練習できます。<br />
              リラックスして、いつも通りお話しください。
            </p>
          </div>

          <button
            onClick={handleSkip}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-6 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            練習をスキップして本番へ
            <ChevronRight className="h-4 w-4" />
          </button>
        </main>
      ) : showCompletion ? (
        /* 練習完了。 */
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-10 text-center">
          <InterviewerAvatar phase="idle" />
          <h1 className="mt-6 text-2xl font-bold">練習が完了しました！</h1>
          <p className="mt-2 text-sm text-white/70">お疲れ様でした。準備ができたら本番に進んでください。</p>
          <button
            onClick={() => router.push(`/interview/${slug}/session`)}
            className="mt-7 w-full max-w-md rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-[0_0_30px_-6px_rgba(37,99,235,0.7)] transition hover:bg-blue-500 active:scale-[0.99]"
          >
            本番面接を開始する
          </button>
        </main>
      ) : (
        /* 練習中（本番とほぼ同じUI・ただし練習モード/評価対象外を明示）。 */
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-40">
          <InterviewerAvatar phase={phase === 'recording' ? 'listening' : 'speaking'} />
          <span className="mt-4 inline-flex items-center rounded-full bg-blue-500/20 px-4 py-1.5 text-sm font-medium text-blue-300">
            練習モード・評価対象外
          </span>

          <div className="mt-6 w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-5 text-center backdrop-blur">
            <span className="inline-flex rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
              練習 {currentQuestionIndex + 1} / {PRACTICE_QUESTIONS.length}
            </span>
            <p className="mt-3 text-lg font-medium leading-relaxed text-white">
              {PRACTICE_QUESTIONS[currentQuestionIndex]}
            </p>
          </div>

          <div className="mt-4 h-6 text-center text-sm text-white/70">
            {phase === 'showing' ? (
              <span className="animate-pulse">AI面接官が質問しています…</span>
            ) : isListening ? (
              <span>あなたの番です。マイクに向かってお話しください</span>
            ) : (
              <span>録音中… 残り {recordingSeconds}秒</span>
            )}
          </div>

          <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
            <button
              onClick={handleSkip}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-6 py-2.5 text-sm text-white/60 transition hover:bg-white/10"
            >
              練習をスキップして本番へ
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </main>
      )}

      {/* 無音しきい値（設計値の参照。UIには出さない）: ANSWER_SILENCE_MS = {ANSWER_SILENCE_MS} */}
      <span className="hidden" aria-hidden="true" data-silence-ms={ANSWER_SILENCE_MS} data-interviewer={AI_INTERVIEWER.displayName} />
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
// 公開フローの DB アクセスは token付き service-role API 経由（browser直アクセス廃止）

const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

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
  const [selectedLanguage, setSelectedLanguage] = useState('ja')
  const [interviewId, setInterviewId] = useState<string | null>(null)
  const [applicantId, setApplicantId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [answeredQuestions, setAnsweredQuestions] = useState(0)
  const [isEnding, setIsEnding] = useState(false)
  const [questionList, setQuestionList] = useState<string[]>([])
  const snapshotSaved = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])

  const MAX_INTERVIEW_SECONDS = 60 * 60
  const TIME_WARNING_SECONDS = 50 * 60
  const [showTimeWarning, setShowTimeWarning] = useState(false)

  // sessionStorageから情報取得と面接開始
  useEffect(() => {
    const storedApplicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    const storedCompanyId = sessionStorage.getItem(`interview_${slug}_company_id`)
    
    if (storedApplicantId) setApplicantId(storedApplicantId)
    if (storedCompanyId) setCompanyId(storedCompanyId)

    // 面接開始: service-role API（token検証）経由で interviews を作成する（browser直INSERTは廃止）
    const storedToken = sessionStorage.getItem(`interview_${slug}_token`)
    async function startInterview() {
      if (!storedApplicantId || !storedToken) {
        return
      }
      try {
        const res = await fetch(`/api/interview/${slug}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: storedToken, applicant_id: storedApplicantId }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.interview_id) {
          return
        }
        setInterviewId(json.interview_id)
        setJobId(json.job_id ?? null)
        if (json.company_id) setCompanyId(json.company_id)
        sessionStorage.setItem(`interview_${slug}_interview_id`, json.interview_id)
      } catch {
      }
    }

    startInterview()
  }, [slug])

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

  // 質問を job_questions（questions API）から取得
  useEffect(() => {
    async function fetchQuestions() {
      if (!jobId || !companyId) return

      try {
        // カスタム質問を取得（token付き service-role API。browser直SELECTは廃止）
        const token = sessionStorage.getItem(`interview_${slug}_token`)
        const applicant_id = sessionStorage.getItem(`interview_${slug}_applicant_id`)
        const interview_id = interviewId ?? sessionStorage.getItem(`interview_${slug}_interview_id`)

        let data: { question_text: string; sort_order: number }[] | null = null
        if (token && applicant_id && interview_id) {
          const res = await fetch(`/api/interview/${slug}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, applicant_id, interview_id }),
          })
          const json = await res.json().catch(() => null)
          if (res.ok && Array.isArray(json?.questions)) {
            data = json.questions
          }
        }

        if (data && data.length > 0) {
          const finalQuestions = data.map(q => q.question_text)

          setQuestionList(finalQuestions)
          setTotalQuestions(finalQuestions.length)
          // 最初の質問を表示
          setAiSpeechText(finalQuestions[0])
        } else {
          // デフォルト質問
          setQuestionList(['本日は面接にお越しいただきありがとうございます。まず自己紹介をお願いできますか？'])
          setTotalQuestions(1)
          setAiSpeechText('本日は面接にお越しいただきありがとうございます。まず自己紹介をお願いできますか？')
        }
      } catch (error) {
        setQuestionList(['本日は面接にお越しいただきありがとうございます。まず自己紹介をお願いできますか？'])
        setTotalQuestions(1)
        setAiSpeechText('本日は面接にお越しいただきありがとうございます。まず自己紹介をお願いできますか？')
      }
    }

    if (jobId && companyId) {
      const t1 = setTimeout(() => {
        fetchQuestions()
      }, 3000)
      const t2 = setTimeout(() => {
        setAiSpeechText('')
        // 質問が表示されたら回答済みカウントを増やす（デモ用）
        setAnsweredQuestions((prev) => Math.min(prev + 1, totalQuestions))
      }, 10000)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [jobId, companyId, totalQuestions, interviewId, slug])

  // interviewIdとquestionListが揃ったら questions_snapshot を1回だけ保存（token付き service-role API）
  useEffect(() => {
    if (!interviewId || questionList.length === 0 || snapshotSaved.current) return

    const token = sessionStorage.getItem(`interview_${slug}_token`)
    const applicant_id = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    if (!token || !applicant_id) return
    snapshotSaved.current = true

    const snapshot = questionList.map((q, i) => ({
      sort_order: i + 1,
      question_text: q,
    }))

    // 保存失敗で面接全体が止まらないよう fire-and-forget（後続の質問表示・終了処理に影響させない）
    fetch(`/api/interview/${slug}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, applicant_id, interview_id: interviewId, questions_snapshot: snapshot }),
    }).catch(() => {})
  }, [interviewId, questionList, slug])

  // 面接タイマー（60分で自動終了）
  useEffect(() => {
    if (elapsedSeconds >= MAX_INTERVIEW_SECONDS && !isEnding) {
      setAiSpeechText('お時間となりましたので、面接を終了いたします。結果は後日、お知らせいたします。本日はありがとうございました。')
      const endTimer = setTimeout(() => {
        handleEndInterview('時間切れ')
      }, 4000)
      return () => clearTimeout(endTimer)
    }
    // 50分経過で残り時間アラート表示
    if (elapsedSeconds >= TIME_WARNING_SECONDS && !showTimeWarning && !isEnding) {
      setShowTimeWarning(true)
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [elapsedSeconds, isEnding, totalQuestions, answeredQuestions, showTimeWarning])

  // ブラウザ離脱時の処理
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      if (interviewId && applicantId && !isEnding) {
        // ブラウザ離脱時の警告を表示
        e.preventDefault()
        e.returnValue = '面接を終了しますか？'
        
        // pagehideイベントで確実に送信（beforeunloadは送信が保証されないため）
        // 実際の送信はpagehideイベントで行う
        return e.returnValue
      }
    }

    const handlePageHide = () => {
      if (interviewId && applicantId && !isEnding) {
        const token = sessionStorage.getItem(`interview_${slug}_token`)
        if (!token) return
        // タブ閉じ等の離脱は途中終了＝cancelled。token付きで end API へ sendBeacon（service-roleで確定）。
        const payload = JSON.stringify({
          token,
          applicant_id: applicantId,
          interview_id: interviewId,
          final_status: 'cancelled',
          end_reason: '自主終了',
          duration_seconds: elapsedSeconds,
          total_questions: totalQuestions,
          answered_questions: answeredQuestions,
        })
        navigator.sendBeacon(`/api/interview/${slug}/end`, new Blob([payload], { type: 'application/json' }))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [interviewId, applicantId, elapsedSeconds, totalQuestions, answeredQuestions, isEnding, slug])

  async function handleEndInterview(endReason: '全質問完了' | '時間切れ' | '自主終了' = '自主終了') {
    if (isEnding) return // 重複実行を防止
    setIsEnding(true)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }

    // 面接終了: interviewsテーブルをUPDATE
    if (interviewId && applicantId) {
      try {
        // 全質問完了かどうかを判定（回答済み質問数が全質問数以上の場合）
        const isAllQuestionsAnswered = answeredQuestions >= totalQuestions && totalQuestions > 0
        const finalEndReason = endReason === '全質問完了' || (endReason === '時間切れ' && isAllQuestionsAnswered)
          ? '全質問完了'
          : endReason === '時間切れ'
          ? '時間切れ'
          : '自主終了'
        // 正常完了（全質問完了）のみ completed。途中終了（自主終了・未完答の時間切れ）は cancelled。
        const interviewStatus = finalEndReason === '全質問完了' ? 'completed' : 'cancelled'

        // 面接終了は service-role API（token検証）で interviews / applicants の status を確定する
        const endToken = sessionStorage.getItem(`interview_${slug}_token`)
        await fetch(`/api/interview/${slug}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: endToken,
            applicant_id: applicantId,
            interview_id: interviewId,
            final_status: interviewStatus,
            end_reason: finalEndReason,
            duration_seconds: elapsedSeconds,
            total_questions: totalQuestions,
            answered_questions: answeredQuestions,
          }),
        }).catch(() => {})

        // 終了理由に応じて画面遷移を分岐
        // 全質問完了または時間切れ（全質問回答済み）→ 完了画面へ
        // それ以外（自主終了、時間切れで未完了）→ 途中終了画面へ
        if (finalEndReason === '全質問完了' || (finalEndReason === '時間切れ' && isAllQuestionsAnswered)) {
          // TODO: Cloudflare R2に録画保存
          router.push(`/interview/${slug}/uploading`)
        } else {
          // 途中離脱の場合は途中終了画面へ
          router.push(`/interview/${slug}/ended`)
        }
      } catch (error) {
        // エラー時も途中終了画面へ遷移（安全側に倒す）
        router.push(`/interview/${slug}/ended`)
      }
    } else {
      // interviewIdがない場合も途中終了画面へ
      router.push(`/interview/${slug}/ended`)
    }
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
        {/* 言語選択ドロップダウン（右上） */}
        <div className="fixed top-4 right-4 z-30">
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="bg-slate-800/80 text-white text-sm px-3 py-2 rounded-lg border border-white/20 hover:bg-slate-700/80 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-slate-800">
                {lang.label}
              </option>
            ))}
          </select>
          {/* TODO: Phase 4 - 言語切替で面接AIの応答言語・UIテキストを変更 */}
        </div>

        {/* 面接経過時間（上部中央） */}
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-30 text-sm text-gray-500">
          {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:
          {String(elapsedSeconds % 60).padStart(2, '0')} / 60:00
        </div>

        {/* 応募者カメラ小窓（左上固定） */}
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

        {/* 回線品質バナー（上部中央） */}
        {showConnectionBanner && (
          <div
            className="fixed top-4 left-1/2 transform -translate-x-1/2 z-20 bg-yellow-500/90 text-white text-sm py-2 px-4 rounded-lg transition-opacity duration-300"
            style={{ opacity: bannerOpacity }}
          >
            通信が不安定です。Wi-Fi環境をお試しください。
          </div>
        )}

        {/* 残り時間アラート */}
        {showTimeWarning && !isEnding && (
          <div className="fixed top-12 left-1/2 transform -translate-x-1/2 z-20 bg-orange-500/90 text-white text-sm py-2 px-4 rounded-lg">
            残り10分です。回答をまとめてください。
          </div>
        )}

        {/* AIアバターエリア（画面中央） */}
        <div className="flex flex-col items-center">
          <div className="rounded-full ring-4 ring-blue-500/20 shadow-2xl">
            <img
              src="/images/ai-interviewer.jpg"
              alt="AI面接官"
              className="w-[220px] h-[220px] md:w-[300px] md:h-[300px] rounded-full object-cover border-4 border-white/20"
            />
          </div>

          {/* AI面接官テキスト */}
          <p className="text-sm sm:text-base text-white/90 mt-3">AI面接官</p>

          {/* 発話状態テキスト（聞いています…/考えています…） */}
          <div
            className={`mt-2 transition-opacity duration-300 ${
              interviewState === 'listen' || interviewState === 'think'
                ? 'opacity-100'
                : 'opacity-0'
            }`}
          >
            {interviewState === 'listen' && (
              <p className="text-green-400 text-xs sm:text-sm">聞いています...</p>
            )}
            {interviewState === 'think' && (
              <p className="text-blue-400 text-xs sm:text-sm">考えています...</p>
            )}
          </div>

          {/* AI発話テキスト表示エリア */}
          <div
            className={`max-w-lg mx-6 sm:mx-auto mt-6 bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-white text-sm sm:text-base leading-relaxed text-center line-clamp-3 transition-opacity duration-500 ${
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
              handleEndInterview('自主終了')
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
                handleEndInterview('自主終了')
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

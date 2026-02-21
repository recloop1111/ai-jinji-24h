'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CULTURE_FIT_QUESTIONS, distributeQuestionsSimple } from '@/lib/constants/questions'

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
  const supabase = createClient()

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
  const [cultureAnalysisEnabled, setCultureAnalysisEnabled] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])

  const MAX_INTERVIEW_SECONDS = 40 * 60

  // sessionStorageから情報取得と面接開始
  useEffect(() => {
    const storedApplicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    const storedCompanyId = sessionStorage.getItem(`interview_${slug}_company_id`)
    
    if (storedApplicantId) setApplicantId(storedApplicantId)
    if (storedCompanyId) setCompanyId(storedCompanyId)

    // 応募者情報からjob_idを取得
    if (storedApplicantId) {
      supabase
        .from('applicants')
        .select('job_id')
        .eq('id', storedApplicantId)
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            setJobId(data.job_id)
          }
        })
    }

    // 面接開始: interviewsテーブルにINSERT
    async function startInterview() {
      if (!storedApplicantId || !storedCompanyId) {
        return
      }

      try {
        const { data: applicantData } = await supabase
          .from('applicants')
          .select('job_id')
          .eq('id', storedApplicantId)
          .single()

        const resolvedJobId = applicantData?.job_id || null

        const { data, error } = await supabase
          .from('interviews')
          .insert({
            applicant_id: storedApplicantId,
            company_id: storedCompanyId,
            job_id: resolvedJobId,
            started_at: new Date().toISOString(),
            status: 'in_progress',
          })
          .select()
          .single()

        if (error) {
        } else if (data) {
          setInterviewId(data.id)
          setJobId(resolvedJobId)
          sessionStorage.setItem(`interview_${slug}_interview_id`, data.id)
        }
      } catch (error) {
      }
    }

    startInterview()
  }, [slug, supabase])

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

  // 質問をjob_questionsテーブルから取得し、社風分析質問を分散配置
  useEffect(() => {
    async function fetchQuestions() {
      if (!jobId || !companyId) return

      try {
        // 会社の社風分析設定を取得
        const { data: companyData } = await supabase
          .from('companies')
          .select('culture_analysis_enabled')
          .eq('id', companyId)
          .single()

        const isCultureEnabled = companyData?.culture_analysis_enabled ?? false
        setCultureAnalysisEnabled(isCultureEnabled)

        // カスタム質問を取得
        const { data, error } = await supabase
          .from('job_questions')
          .select('question_text, sort_order')
          .eq('job_id', jobId)
          .order('sort_order', { ascending: true })

        if (!error && data && data.length > 0) {
          const customQuestions = data.map(q => q.question_text)

          // 社風分析ONの場合、社風分析質問を分散配置
          let finalQuestions: string[]
          if (isCultureEnabled) {
            const cultureQuestions = CULTURE_FIT_QUESTIONS.map(q => q.question)
            finalQuestions = distributeQuestionsSimple(customQuestions, cultureQuestions)
          } else {
            finalQuestions = customQuestions
          }

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
  }, [jobId, companyId, supabase, totalQuestions])

  // 面接タイマー（40分で自動終了）
  useEffect(() => {
    if (elapsedSeconds >= MAX_INTERVIEW_SECONDS && !isEnding) {
      handleEndInterview('時間切れ')
      return
    }
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [elapsedSeconds, isEnding, totalQuestions, answeredQuestions])

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

    const handlePageHide = async () => {
      if (interviewId && applicantId && !isEnding) {
        try {
          // interviewsテーブルを更新
          const endData = {
            interviewId,
            applicantId,
            endReason: '自主終了',
            elapsedSeconds,
            totalQuestions,
            answeredQuestions,
          }
          
          // navigator.sendBeaconで非同期に終了処理を送信
          // TODO: APIエンドポイント /api/interview/end を作成して、そこでSupabase更新を行う
          const blob = new Blob([JSON.stringify(endData)], { type: 'application/json' })
          navigator.sendBeacon(`/api/interview/end?interview_id=${interviewId}&applicant_id=${applicantId}`, blob)
          
          // 直接Supabase更新も試行（sendBeaconが失敗する可能性があるため）
          // 注意: この方法は確実ではないため、APIエンドポイントの実装を推奨
          await supabase
            .from('interviews')
            .update({
              status: 'completed',
              ended_at: new Date().toISOString(),
              duration_seconds: elapsedSeconds,
              total_questions: totalQuestions,
              answered_questions: answeredQuestions,
              end_reason: '自主終了',
            })
            .eq('id', interviewId)
          
          await supabase
            .from('applicants')
            .update({
              status: '途中離脱',
              result: '不採用', // 途中離脱の場合は自動的に不採用に設定
              updated_at: new Date().toISOString(),
            })
            .eq('id', applicantId)
        } catch (error) {
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [interviewId, applicantId, elapsedSeconds, totalQuestions, answeredQuestions, isEnding, supabase])

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

        // interviewsテーブルを更新
        const { error: interviewError } = await supabase
          .from('interviews')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString(),
            duration_seconds: elapsedSeconds,
            total_questions: totalQuestions,
            answered_questions: answeredQuestions,
            end_reason: finalEndReason,
          })
          .eq('id', interviewId)

        if (interviewError) {
        } else {
        }

        // applicantsテーブルのstatusを更新
        const applicantStatus = finalEndReason === '全質問完了' || finalEndReason === '時間切れ'
          ? '完了'
          : '途中離脱'

        // 途中離脱の場合は result も自動的に '不採用' に設定
        const updateData: any = {
          status: applicantStatus,
          updated_at: new Date().toISOString(),
        }
        if (applicantStatus === '途中離脱') {
          updateData.result = '不採用'
        }

        const { error: applicantError } = await supabase
          .from('applicants')
          .update(updateData)
          .eq('id', applicantId)

        if (applicantError) {
        } else {
        }

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
          {String(elapsedSeconds % 60).padStart(2, '0')} / 40:00
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

'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  MAX_INTERVIEW_SECONDS,
  INTERVIEW_WARNING_SECONDS,
  MAX_INTERVIEW_MINUTES,
  INTERVIEW_WARNING_REMAINING_MINUTES,
} from '@/lib/config/interview-policy'
// 公開フローの DB アクセスは token付き service-role API 経由（browser直アクセス廃止）

const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

// モック面接のオートプログレッション設定（音声/Realtime/ラリーUIは未実装）。
// 1問あたりの提示間隔と、最終質問後に締めメッセージを見せてから完了させるまでの待機。
const QUESTION_INTERVAL_MS = 8000
const CLOSING_HOLD_MS = 4000
const CLOSING_MESSAGE = 'すべての質問が完了しました。面接を終了します。'

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
  // start / questions が失敗した場合のブロッキングエラー（面接UIを描画させない）
  const [blockingError, setBlockingError] = useState<string | null>(null)
  const [questionList, setQuestionList] = useState<string[]>([])
  const snapshotSaved = useRef(false)
  // 二重 /end 防止（自動完了・手動終了・時間切れの競合を同期的に弾く）
  const endTriggeredRef = useRef(false)
  // モック質問プログレッションを1セッションにつき1回だけ起動させるガード
  const progressionStartedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // blockingError の最新値を camera 取得の非同期処理から参照するための ref（クロージャの陳腐化対策）
  const blockingErrorRef = useRef(false)
  const timeoutRefs = useRef<NodeJS.Timeout[]>([])

  // 共通ポリシー（lib/config/interview-policy）へ接続。60分終了 / 50分警告。
  const TIME_WARNING_SECONDS = INTERVIEW_WARNING_SECONDS
  const [showTimeWarning, setShowTimeWarning] = useState(false)

  // sessionStorageから情報取得と面接開始
  useEffect(() => {
    const storedApplicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    const storedCompanyId = sessionStorage.getItem(`interview_${slug}_company_id`)
    
    if (storedApplicantId) setApplicantId(storedApplicantId)
    if (storedCompanyId) setCompanyId(storedCompanyId)

    // 面接開始: service-role API（token検証）経由で interviews を作成する（browser直INSERTは廃止）
    const storedToken = sessionStorage.getItem(`interview_${slug}_token`)
    const storedSmsToken = sessionStorage.getItem(`interview_${slug}_sms_token`)
    async function startInterview() {
      // フロー無効（token/applicant 欠落）→ 最初からやり直し
      if (!storedApplicantId || !storedToken) {
        router.push(`/interview/${slug}`)
        return
      }
      // SMS未認証（sms_token 欠落）→ verify へ戻す（/verify を飛ばした直アクセス対策）
      if (!storedSmsToken) {
        router.push(`/interview/${slug}/verify`)
        return
      }
      try {
        const res = await fetch(`/api/interview/${slug}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // SMS認証完了トークン（sms_token）も送る。start 側で必須検証される。
          body: JSON.stringify({ token: storedToken, applicant_id: storedApplicantId, sms_token: storedSmsToken }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.interview_id) {
          // SMS系の 403（SMS_VERIFICATION_REQUIRED）だけ verify へ戻す。
          // 企業停止/月間上限など他の 403（FORBIDDEN）や非403は blockingError（verify↔start ループを作らない）。
          if (res.status === 403 && json?.error?.code === 'SMS_VERIFICATION_REQUIRED') {
            router.push(`/interview/${slug}/verify`)
          } else {
            setBlockingError('面接を開始できませんでした。お手数ですが最初からやり直してください。')
          }
          return
        }
        setInterviewId(json.interview_id)
        setJobId(json.job_id ?? null)
        if (json.company_id) setCompanyId(json.company_id)
        sessionStorage.setItem(`interview_${slug}_interview_id`, json.interview_id)
      } catch {
        setBlockingError('面接を開始できませんでした。通信環境をご確認のうえ、もう一度お試しください。')
      }
    }

    startInterview()
  }, [slug, router])

  // カメラ取得（start 成功＝interviewId 確定後のみ。403/失敗時は起動しない）
  useEffect(() => {
    if (!interviewId) return
    // ブロッキングエラーが既に出ているならカメラを起動しない
    if (blockingErrorRef.current) return
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })
        // 取得が blockingError 発生後に解決した場合（権限プロンプト遅延等）は即停止して保持しない
        if (blockingErrorRef.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        setHasStream(true)
      } catch {
      }
    }

    setupCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [interviewId])

  // blockingError 表示中はカメラ/マイクを確実に停止する。
  // カメラ取得 effect の deps は [interviewId] のみで、blockingError が立っても cleanup が走らないため、
  // 取得済みストリームがブロッキング画面で動き続けないよう専用に停止する。
  useEffect(() => {
    blockingErrorRef.current = blockingError !== null
    if (!blockingError) return
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setHasStream(false)
    }
  }, [blockingError])

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
    // job_id 無し / 200+空配列 のときに使う既存デフォルト質問（質問ゼロで面接UIに入らないようにする）
    const DEFAULT_QUESTION = '本日は面接にお越しいただきありがとうございます。まず自己紹介をお願いできますか？'
    function setDefaultQuestions() {
      setQuestionList([DEFAULT_QUESTION])
      setTotalQuestions(1)
      setAiSpeechText(DEFAULT_QUESTION)
    }

    // /questions 失敗時に当該 in_progress を非課金で中断確定する（P2 #2）。
    // applicant.status は変えず、サーバが is_billable=false を強制（質問未提示は課金しない）。
    async function abortForQuestionsFailure() {
      const token = sessionStorage.getItem(`interview_${slug}_token`)
      const applicant_id = sessionStorage.getItem(`interview_${slug}_applicant_id`)
      const interview_id = interviewId ?? sessionStorage.getItem(`interview_${slug}_interview_id`)
      if (!token || !applicant_id || !interview_id) return
      try {
        await fetch(`/api/interview/${slug}/abort`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, applicant_id, interview_id }),
        })
      } catch {
        // abort 失敗時もブロッキング表示は維持（pagehide beacon 等の追加緩和は別タスク）
      }
    }

    async function fetchQuestions() {
      if (!jobId || !companyId) return

      try {
        // カスタム質問を取得（token付き service-role API。browser直SELECTは廃止）
        const token = sessionStorage.getItem(`interview_${slug}_token`)
        const applicant_id = sessionStorage.getItem(`interview_${slug}_applicant_id`)
        const interview_id = interviewId ?? sessionStorage.getItem(`interview_${slug}_interview_id`)

        if (!token || !applicant_id || !interview_id) return

        const res = await fetch(`/api/interview/${slug}/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, applicant_id, interview_id }),
        })
        const json = await res.json().catch(() => null)

        // non-OK（QUESTION_LIMIT_EXCEEDED 等のAPIエラー）はデフォルトに落とさずブロッキング。
        // ※ end API は叩かない（応募者ステータス/結果を不用意に変更しない）。abort で非課金確定のみ行う。
        if (!res.ok || !Array.isArray(json?.questions)) {
          await abortForQuestionsFailure()
          setBlockingError('面接質問の取得に失敗しました。管理者にお問い合わせください。')
          return
        }

        const data: { question_text: string; sort_order: number }[] = json.questions
        if (data.length > 0) {
          const finalQuestions = data.map((q) => q.question_text)
          setQuestionList(finalQuestions)
          setTotalQuestions(finalQuestions.length)
          // 最初の質問を表示
          setAiSpeechText(finalQuestions[0])
        } else {
          // 200 + 空配列 = pattern未設定の正当なデフォルト質問フォールバック（維持）
          setDefaultQuestions()
        }
      } catch {
        // 通信失敗もデフォルトに落とさずブロッキング（取得不能のため続行しない）。abort で非課金確定。
        await abortForQuestionsFailure()
        setBlockingError('面接質問の取得に失敗しました。管理者にお問い合わせください。')
      }
    }

    // start 成功（interviewId 確定）後に質問を用意する。
    if (!interviewId || !companyId) return

    // job_id 無し → /questions を呼ばず、明示的に既存デフォルト質問を即セット（totalQuestions=1・最初の質問）
    if (!jobId) {
      setDefaultQuestions()
      return
    }

    // 一度きりの answeredQuestions+1 は撤去（下のオートプログレッションが進行を管理し二重カウントを防ぐ）。
    const t1 = setTimeout(() => {
      fetchQuestions()
    }, 3000)
    return () => {
      clearTimeout(t1)
    }
  }, [jobId, companyId, interviewId, slug])

  // モック面接のオートプログレッション＋完了配線。
  // 質問を QUESTION_INTERVAL_MS ごとに1問ずつ提示して answeredQuestions を進め、
  // 最後まで到達したら締めメッセージを表示し handleEndInterview('全質問完了') を1回だけ呼ぶ。
  // → /end に final_status='completed' / end_reason='全質問完了' が渡り applicant は「完了」になる。
  // ※ 音声/OpenAI Realtime/EBCA/複雑な質問ラリーUIは未実装（モックの自動進行のみ）。
  useEffect(() => {
    if (!interviewId || blockingError) return
    if (questionList.length === 0) return
    if (progressionStartedRef.current) return
    progressionStartedRef.current = true

    const total = questionList.length
    const timers: NodeJS.Timeout[] = []
    // 各質問を順に提示し回答済み数を進める（モック）
    for (let i = 0; i < total; i++) {
      timers.push(
        setTimeout(() => {
          setAiSpeechText(questionList[i])
          setAnsweredQuestions(i + 1)
        }, i * QUESTION_INTERVAL_MS),
      )
    }
    // 最終質問の後: 締めメッセージ → 全質問完了で終了
    timers.push(
      setTimeout(() => {
        setAiSpeechText(CLOSING_MESSAGE)
      }, total * QUESTION_INTERVAL_MS),
    )
    timers.push(
      setTimeout(() => {
        // 自動完了は全問回答済み。古いクロージャの answeredQuestions(0) ではなく確定値を渡す。
        handleEndInterview('全質問完了', total)
      }, total * QUESTION_INTERVAL_MS + CLOSING_HOLD_MS),
    )
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
    // handleEndInterview は他 effect と同様に依存に含めない（毎レンダー再生成・ref で二重起動防止済み）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, blockingError, questionList])

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

  // 面接タイマー（60分で自動終了）。interviewId 確定（start 成功）後のみ作動させる。
  useEffect(() => {
    if (!interviewId) return
    // ブロッキングエラー中はタイマー（自動終了＝end 送信経路）を作動させない
    if (blockingError) return
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
  }, [interviewId, blockingError, elapsedSeconds, isEnding, totalQuestions, answeredQuestions, showTimeWarning])

  // ブラウザ離脱時の処理
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      // ブロッキングエラー中（start/questions 失敗）は離脱警告を出さない（end も送らない）
      if (blockingError) return
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
      // ブロッキングエラー中は /end を送らない（応募者を途中離脱/不採用に変えない）
      if (blockingError) return
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
  }, [interviewId, applicantId, elapsedSeconds, totalQuestions, answeredQuestions, isEnding, slug, blockingError])

  // answeredOverride: 自動完了時など、最新の回答数をクロージャの古い値ではなく明示的に渡すための上書き。
  async function handleEndInterview(
    endReason: '全質問完了' | '時間切れ' | '自主終了' = '自主終了',
    answeredOverride?: number,
  ) {
    // ref で同期的に二重 /end を弾く（自動完了・手動終了・時間切れが競合しても1回だけ送る）。
    if (endTriggeredRef.current) return
    endTriggeredRef.current = true
    if (isEnding) return // 重複実行を防止（UI状態）
    setIsEnding(true)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }

    // 面接終了: interviewsテーブルをUPDATE
    if (interviewId && applicantId) {
      try {
        // 送信する回答数（自動完了は確定値を渡す。古いクロージャ値で 0 を送らないため）。
        const answeredForPayload = answeredOverride ?? answeredQuestions
        // 全質問完了かどうかを判定（回答済み質問数が全質問数以上の場合）
        const isAllQuestionsAnswered = answeredForPayload >= totalQuestions && totalQuestions > 0
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
            answered_questions: answeredForPayload,
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
      } catch {
        // エラー時も途中終了画面へ遷移（安全側に倒す）
        router.push(`/interview/${slug}/ended`)
      }
    } else {
      // interviewIdがない場合も途中終了画面へ
      router.push(`/interview/${slug}/ended`)
    }
  }

  // start / questions が失敗した場合: カメラ・タイマー・面接UIを一切描画せずブロッキング表示。
  if (blockingError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.5 12.99A1.5 1.5 0 004.14 19.5h15.72a1.5 1.5 0 001.3-2.25l-7.5-12.99a1.5 1.5 0 00-2.6 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800">面接を開始できませんでした</h2>
          <p className="text-sm text-gray-600 whitespace-pre-line">{blockingError}</p>
        </div>
      </div>
    )
  }

  // start 成功（interviewId 確定）まではカメラ/タイマー/面接UIを出さず「接続中」のみ表示。
  if (!interviewId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white">
          <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-gray-300">面接を準備しています…</p>
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
          {String(elapsedSeconds % 60).padStart(2, '0')} / {String(MAX_INTERVIEW_MINUTES).padStart(2, '0')}:00
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
            残り{INTERVIEW_WARNING_REMAINING_MINUTES}分です。回答をまとめてください。
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

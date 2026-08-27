'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Volume2, User, AlertCircle, Check, RefreshCw, Globe, Mic } from 'lucide-react'
import { StepIndicator } from '@/components/interview/FormComponents'
import {
  classifyMediaError,
  mediaErrorMessage,
  isGetUserMediaSupported,
  stopStream,
} from '@/lib/interview/media'
import { canProceedToInterview } from '@/lib/interview/prepare-gate'

// 応募フロー共通のステップ（既存フロー優先: 同意→情報入力→SMS認証→環境確認→面接）。環境確認=現在=4。
const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '面接']
// 応募開始/基本情報/本人確認画面と同一の言語リスト。切替は sessionStorage 保存のみ（メディア/遷移ロジックに非干渉）。
const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

// 取得できない場合のダミーデータ
const dummyCompany = {
  id: 'dummy-company-id',
  name: 'テスト株式会社',
  logo_url: null,
  is_suspended: false,
}

export default function PreparePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [company, setCompany] = useState<{
    id: string
    name: string
    logo_url: string | null
    is_suspended: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  // 応募開始/基本情報/本人確認画面と統一のヘッダー言語切替（表示＋sessionStorage 保存のみ）。
  const [selectedLanguage, setSelectedLanguage] = useState('ja')

  // 正式仕様: マイク=必須 / カメラ=必須。mic/camera を独立に状態管理する。
  const [micStatus, setMicStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [micTestPassed, setMicTestPassed] = useState(false)
  const [volume, setVolume] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const thresholdStartTimeRef = useRef<number | null>(null)
  const micTestPassedRef = useRef(false)
  const acquiringRef = useRef(false) // 連打/race 防止
  const cancelledRef = useRef(false) // unmount 後の state 更新防止

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/interview/${slug}/public-config`)
        const json = await res.json().catch(() => null)
        if (cancelled) return
        setCompany(!res.ok || !json?.company ? dummyCompany : json.company)
      } catch {
        if (!cancelled) setCompany(dummyCompany)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  // 同一タブで以前選んだ言語があれば表示を合わせる（他画面と同じ sessionStorage キー）。表示同期のための意図的な setState。
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch {
      /* noop */
    }
  }, [slug])

  // マイクテスト（音量解析）の後始末。再試行/アンマウントで確実に解放する。
  const cleanupMicTest = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch {
        /* noop */
      }
      audioContextRef.current = null
    }
    analyserRef.current = null
    thresholdStartTimeRef.current = null
  }, [])

  // マイクの音量を解析し、一定音量が0.5秒続いたら合格。analyser 失敗でも mic 取得自体は成功扱い。
  const startMicTest = useCallback(
    (stream: MediaStream) => {
      cleanupMicTest()
      try {
        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        audioContext.createMediaStreamSource(stream).connect(analyser)
        audioContextRef.current = audioContext
        analyserRef.current = analyser
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          if (!analyserRef.current || micTestPassedRef.current || cancelledRef.current) return
          analyserRef.current.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length
          const vol = Math.round(avg)
          setVolume(vol)
          if (vol > 40) {
            const now = Date.now()
            if (thresholdStartTimeRef.current === null) thresholdStartTimeRef.current = now
            else if (now - thresholdStartTimeRef.current >= 500) {
              micTestPassedRef.current = true
              setMicTestPassed(true)
            }
          } else {
            thresholdStartTimeRef.current = null
          }
          animationFrameRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        // Codex P2: AudioContext/analyser 非対応・制限環境では音量テストを実行できない。
        // ただし getUserMedia は成功済み＝マイクは利用可能。テスト不能を理由に「準備完了」ボタンを
        // 永久に無効化して詰まらせない。合格扱いにして先へ進めるようにする（マイクは必須要件を満たしている）。
        if (!cancelledRef.current) {
          micTestPassedRef.current = true
          setMicTestPassed(true)
        }
      }
    },
    [cleanupMicTest],
  )

  // カメラ・マイク取得（再試行にも使う）。カメラ・マイク**ともに必須**。
  //   まず {video,audio} を要求。失敗時のみ {audio} でマイクだけ確立し「マイクテスト実行 / camera-only 再取得」を可能にするが、
  //   カメラ未取得（cameraStatus!=='ok'）の間は canProceedToInterview が false ＝ 面接練習へは進めない（カメラ無しで進行しない）。
  const acquire = useCallback(async () => {
    if (acquiringRef.current) return
    acquiringRef.current = true
    // reset（旧 stream を必ず stop してから）
    micTestPassedRef.current = false
    setMicTestPassed(false)
    setVolume(0)
    setMicStatus('loading')
    setCameraStatus('loading')
    setMicError(null)
    setCameraError(null)
    cleanupMicTest()
    stopStream(streamRef.current)
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null

    if (!isGetUserMediaSupported()) {
      setMicStatus('error')
      setMicError(mediaErrorMessage('unsupported', 'both'))
      setCameraStatus('error')
      acquiringRef.current = false
      return
    }

    let stream: MediaStream | null = null
    let cameraOk = false
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      cameraOk = true
    } catch (e1) {
      // Codex P2: 離脱後（cancelledRef）はフォールバック取得を始めない
      //（準備画面を離れた後にマイク許可プロンプトを出さない・cleanup 意図を尊重）。
      if (cancelledRef.current) {
        acquiringRef.current = false
        return
      }
      // カメラ取得に失敗。マイクだけ確立して「マイクテスト実行 / camera-only 再取得」を可能にする
      //（カメラは必須。cameraStatus='error' のままにして canProceed で進行不可＝カメラ無しでは進めない）。
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        setCameraError(mediaErrorMessage(classifyMediaError(e1), 'camera'))
      } catch (e2) {
        // マイクも取得不可 → 面接開始不可（離脱後は state 更新しない）
        if (cancelledRef.current) {
          acquiringRef.current = false
          return
        }
        setMicStatus('error')
        setMicError(mediaErrorMessage(classifyMediaError(e2), 'mic'))
        setCameraStatus('error')
        acquiringRef.current = false
        return
      }
    }

    if (cancelledRef.current) {
      stopStream(stream)
      acquiringRef.current = false
      return
    }

    streamRef.current = stream
    setMicStatus('ok')
    if (cameraOk && stream.getVideoTracks().length > 0) {
      setCameraStatus('ok')
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } else {
      setCameraStatus('error') // カメラ未取得（必須。canProceed で進行不可・再取得を促す）
    }
    startMicTest(stream)
    acquiringRef.current = false
  }, [cleanupMicTest, startMicTest])

  // Codex P2: カメラのみ再試行。マイクが既に動作中（micStatus==='ok'）なら、
  // 動作中の音声ストリーム・micTestPassed を壊さず、カメラトラックだけ取得して既存ストリームへ追加する。
  // （任意のカメラ再試行で必須マイクの進行をリセットしない／再取得失敗でも進行不能にしない）
  const retryCameraOnly = useCallback(async () => {
    if (acquiringRef.current) return
    // マイク未確立なら通常のフル再取得（マイク優先で立て直す）
    if (micStatus !== 'ok' || !streamRef.current) {
      acquire()
      return
    }
    acquiringRef.current = true
    setCameraError(null)
    setCameraStatus('loading')
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({ video: true })
      const videoTrack = vStream.getVideoTracks()[0]
      // 破棄後/マイク喪失後に解決したら追加せず即停止（カメラを残さない）
      if (cancelledRef.current || !streamRef.current || !videoTrack) {
        stopStream(vStream)
        setCameraStatus((s) => (s === 'loading' ? 'error' : s))
        return
      }
      streamRef.current.addTrack(videoTrack)
      setCameraStatus('ok')
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current
        videoRef.current.play().catch(() => {})
      }
    } catch (e) {
      setCameraStatus('error')
      setCameraError(mediaErrorMessage(classifyMediaError(e), 'camera'))
    } finally {
      acquiringRef.current = false
    }
  }, [acquire, micStatus])

  useEffect(() => {
    cancelledRef.current = false
    const timer = setTimeout(() => {
      acquire()
    }, 500)
    return () => {
      cancelledRef.current = true
      clearTimeout(timer)
      cleanupMicTest()
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [acquire, cleanupMicTest])

  // マイク必須・カメラ必須: 3条件（mic ok / camera ok / micTestPassed）を満たすときだけ進める。
  function handleNext() {
    if (canProceedToInterview({ micStatus, cameraStatus, micTestPassed })) {
      router.push(`/interview/${slug}/practice`)
    }
  }

  const displayCompany = company || dummyCompany

  // 応募開始/基本情報/本人確認画面と統一のヘッダー（会社名 左 ＋ 言語切替 右）。loading/本体で共用。
  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur sm:px-8">
      <span className="truncate text-base font-bold text-slate-900">{displayCompany.name}</span>
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
          className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        {header}
        <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // カメラ・マイクともに必須。3条件（mic ok / camera ok / micTestPassed）を満たすときだけ進行可。
  const canProceed = canProceedToInterview({ micStatus, cameraStatus, micTestPassed })
  const bothVerified = micStatus === 'ok' && cameraStatus === 'ok' && micTestPassed

  return (
    <div className="min-h-screen bg-slate-100">
      {header}

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* ステッパー（環境確認=現在=4）。既存フロー優先（同意→情報入力→SMS認証→環境確認→面接）。 */}
        <div className="mb-8">
          <StepIndicator currentStep={4} totalSteps={5} labels={STEP_LABELS} />
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-10">
          {/* 見出し＋補足（マイクテスト前/後で文言を切替）。 */}
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">カメラ・マイクの確認</h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
              面接ではカメラ・マイクを使用します。<br />
              {bothVerified ? '正常に動作していることを確認しました。' : 'マイクに向かって「こんにちは」と話しかけてください。'}
            </p>
          </div>

          {/* カメラプレビュー（16:9・mirror）。カメラは必須。取得不可なら honest 案内＋再取得。 */}
          <div className="relative mt-6 aspect-video overflow-hidden rounded-2xl bg-slate-900">
            <video
              ref={videoRef}
              autoPlay={true}
              playsInline={true}
              muted={true}
              style={{ transform: 'scaleX(-1)', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {cameraStatus === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4" role="status">
                <div className="text-center text-white">
                  <AlertCircle className="mx-auto mb-2 h-10 w-10 opacity-70" aria-hidden="true" />
                  <p className="text-sm font-medium">面接にはカメラが必要です。</p>
                  <p className="mt-1 text-xs text-white/70">{cameraError ?? 'ブラウザのカメラ使用を許可してください。'}</p>
                  <button
                    type="button"
                    onClick={retryCameraOnly}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium transition-colors hover:bg-white/25"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    カメラを再確認する
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* マイクエラー（必須＝ブロッキング）。 */}
          {micStatus === 'error' && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-center" role="alert">
              <AlertCircle className="mx-auto mb-1.5 h-6 w-6 text-red-500" aria-hidden="true" />
              <p className="text-sm text-red-700">{micError ?? 'マイクを利用できません。'}</p>
              <p className="mt-1 text-xs text-red-500">マイクは面接に必須です。許可・接続を確認してください。</p>
              <button
                type="button"
                onClick={acquire}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                マイクを再確認する
              </button>
            </div>
          )}

          {/* マイクテスト: 未合格は「こんにちは」案内＋音量バー、合格は大きな緑チェック。 */}
          {micStatus === 'ok' && (
            <div className="mt-6 text-center">
              {!micTestPassed ? (
                <>
                  <p className="text-sm font-medium text-slate-700">「こんにちは」と話しかけてください</p>
                  <div className="mx-auto mt-3 h-2 w-64 max-w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-100"
                      style={{ width: `${Math.min((volume / 255) * 100, 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-700" role="status">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-base font-bold">マイク確認済み</span>
                </div>
              )}
            </div>
          )}

          {/* ステータス pill（色だけに依存せず ✓/✗＋文言）。マイク: 待ち=blue / 合格=green。カメラ: 正常=green / エラー=red。 */}
          <div className="mt-5 flex items-center justify-center gap-3">
            {micStatus === 'loading' ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500">マイク確認中...</span>
            ) : micTestPassed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                マイク正常
              </span>
            ) : micStatus === 'ok' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                <Mic className="h-4 w-4" aria-hidden="true" />
                マイクテスト待ち
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
                <span aria-hidden="true">✗</span>
                マイクエラー
              </span>
            )}

            <span className="h-6 w-px bg-slate-200" aria-hidden="true" />

            {cameraStatus === 'loading' ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500">カメラ確認中...</span>
            ) : cameraStatus === 'ok' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                カメラ正常
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
                <span aria-hidden="true">✗</span>
                カメラエラー
              </span>
            )}
          </div>

          {/* 面接中の注意事項（カメラは必須＝「使う場合は」を撤去）。 */}
          <div className="mt-8">
            <h2 className="mb-3 text-base font-bold text-slate-900">面接中の注意事項</h2>
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Volume2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-500">静かな場所で、はっきりお話しください</p>
              </div>
              <div className="flex items-start gap-2.5">
                <User className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-500">顔全体が映るようにしてください</p>
              </div>
            </div>
          </div>

          {/* 面接練習へ進む（カメラ・マイクともに正常＋マイクテスト合格のときだけ active）。 */}
          <button
            onClick={handleNext}
            disabled={!canProceed}
            aria-disabled={!canProceed}
            className="mt-7 flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 active:scale-[0.99] disabled:pointer-events-none disabled:bg-blue-300 disabled:opacity-70 disabled:shadow-none"
          >
            面接練習へ進む
          </button>

          <div className="mt-4 text-center">
            <button onClick={() => router.back()} className="text-sm text-slate-400 underline underline-offset-2 hover:text-slate-500">
              面接をキャンセルする
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import InterviewLayout from '@/components/interview/InterviewLayout'
import {
  StepIndicator,
  PrimaryButton,
  SecondaryButton,
  TextLink,
} from '@/components/interview/FormComponents'

const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '面接']

type CheckStatus = 'idle' | 'checking' | 'pass' | 'fail'

type CheckItem = {
  id: string
  label: string
  status: CheckStatus
  message: string
  helpMessage?: string
}

export default function PreparePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [checks, setChecks] = useState<CheckItem[]>([
    { id: 'camera', label: 'カメラ', status: 'idle', message: '' },
    { id: 'network', label: '通信速度', status: 'idle', message: '' },
    { id: 'mic_test', label: 'マイクテスト', status: 'idle', message: '' },
  ])
  const [micLevel, setMicLevel] = useState(0)
  const [allPassed, setAllPassed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [hasRunChecks, setHasRunChecks] = useState(false)
  const [hasStream, setHasStream] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const micTestIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  useEffect(() => {
    return () => {
      // クリーンアップ
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (micTestIntervalRef.current) {
        clearInterval(micTestIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const passed = checks.every((c) => c.status === 'pass')
    setAllPassed(passed)
  }, [checks])

  useEffect(() => {
    if (hasStream && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [hasStream])

  useEffect(() => {
    runChecks()
  }, [])

  function updateCheck(
    id: string,
    status: CheckStatus,
    message: string = '',
    helpMessage?: string
  ) {
    setChecks((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status, message, helpMessage } : c
      )
    )
  }

  async function checkCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      streamRef.current = stream
      setHasStream(true)

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        // マイクは取得できなかったが、カメラはOK
      }

      updateCheck('camera', 'pass', 'カメラが正常に動作しています')
    } catch (e) {
      const err = e as DOMException
      if (err.name === 'NotAllowedError') {
        updateCheck(
          'camera',
          'fail',
          'カメラへのアクセスが許可されていません',
          'アドレスバー左の鍵アイコン → カメラを「許可」に変更 → ページを再読み込みしてください'
        )
      } else if (err.name === 'NotFoundError') {
        updateCheck(
          'camera',
          'fail',
          'カメラが見つかりません',
          'カメラが接続されているか確認してください'
        )
      } else {
        updateCheck(
          'camera',
          'fail',
          'カメラの起動に失敗しました',
          'ブラウザを再起動してもう一度お試しください'
        )
      }
    }
  }

  async function runChecks() {
    setChecking(true)
    setHasRunChecks(true)

    // カメラと通信速度を並列実行
    const cameraPromise = (async () => {
      updateCheck('camera', 'checking', 'カメラにアクセスしています...')
      await checkCamera()
    })()

    const networkPromise = (async () => {
      updateCheck('network', 'checking', '通信速度を測定しています...')
      const fetchWork = (async () => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        try {
          const start = performance.now()
          await fetch('https://www.google.com/favicon.ico', {
            mode: 'no-cors',
            cache: 'no-cache',
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
          const duration = performance.now() - start
          if (duration < 3000) {
            updateCheck(
              'network',
              'pass',
              `通信速度: 良好（応答時間 ${Math.round(duration)}ms）`
            )
          } else {
            updateCheck('network', 'fail', '通信速度が遅い可能性があります')
          }
        } catch (e) {
          clearTimeout(timeoutId)
          updateCheck(
            'network',
            'fail',
            '通信速度が遅いため、面接が不安定になる可能性があります'
          )
        }
      })()
      await Promise.all([fetchWork, new Promise((r) => setTimeout(r, 2000))])
    })()

    try {
      await Promise.all([cameraPromise, networkPromise])
    } catch {
      setChecking(false)
      return
    }

    // マイクテスト（閾値25を0.5秒連続で超えたら即合格、最大10秒）
    updateCheck('mic_test', 'checking', '')
    const stream = streamRef.current
    if (!stream) {
      updateCheck('mic_test', 'fail', 'ストリームが取得できませんでした')
      setChecking(false)
    } else if (stream.getAudioTracks().length === 0) {
      updateCheck(
        'mic_test',
        'fail',
        'マイクが見つかりません',
        'マイクが接続されているか確認してください'
      )
      setChecking(false)
    } else {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let continuousAboveThreshold = 0
      let tickCount = 0
      const THRESHOLD = 25
      const TICKS_FOR_PASS = 5 // 0.5秒 = 5 × 100ms
      const MAX_TICKS = 100 // 10秒 = 100 × 100ms
      const INTERVAL_MS = 100

      if (micTestIntervalRef.current) {
        clearInterval(micTestIntervalRef.current)
      }
      micTestIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray)
        const average =
          dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length
        const level = Math.min(100, (average / 255) * 100)
        setMicLevel(level)

        if (level > THRESHOLD) {
          continuousAboveThreshold += 1
          if (continuousAboveThreshold >= TICKS_FOR_PASS) {
            if (micTestIntervalRef.current) {
              clearInterval(micTestIntervalRef.current)
              micTestIntervalRef.current = null
            }
            updateCheck('mic_test', 'pass', '音声が正常に検出されました')
            setChecking(false)
            return
          }
        } else {
          continuousAboveThreshold = 0
        }

        tickCount += 1
        if (tickCount >= MAX_TICKS) {
          if (micTestIntervalRef.current) {
            clearInterval(micTestIntervalRef.current)
            micTestIntervalRef.current = null
          }
          updateCheck('mic_test', 'fail', 'マイクの音声が検出されません。マイクがミュートになっていないか確認してください。')
          setChecking(false)
        }
      }, INTERVAL_MS)
    }
  }

  function handleStartInterview() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    // 練習パートへ遷移
    router.push(`/interview/${slug}/practice`)
  }

  function getStatusIcon(status: CheckStatus) {
    switch (status) {
      case 'pass':
        return (
          <svg
            className="w-5 h-5 text-green-600"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'fail':
        return (
          <svg
            className="w-5 h-5 text-red-600"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      case 'checking':
        return (
          <svg
            className="animate-spin h-5 w-5 text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )
      default:
        return (
          <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
        )
    }
  }

  return (
    <InterviewLayout maxWidth="lg">
      <div className="mb-6">
        <StepIndicator currentStep={4} totalSteps={5} labels={STEP_LABELS} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            面接の準備
          </h1>
        </div>

        <div className="mb-6">
          <div className="bg-black rounded-xl aspect-video max-w-md mx-auto flex items-center justify-center relative overflow-hidden">
            {hasStream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="text-white text-center p-4">
                <p className="text-sm mb-2">カメラへのアクセスを許可してください</p>
                <p className="text-sm text-gray-500">ブラウザの許可ダイアログで「許可」を選択してください</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {checks.map((check) =>
            check.id === 'mic_test' ? (
              <div
                key={check.id}
                className={`p-6 rounded-xl border-2 transition-colors ${
                  check.status === 'checking'
                    ? 'border-blue-200 bg-blue-50'
                    : check.status === 'pass'
                    ? 'border-green-200 bg-green-50'
                    : check.status === 'fail'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {getStatusIcon(check.status)}
                  <p className="text-sm font-medium text-gray-900">{check.label}</p>
                </div>
                <div className="flex flex-col items-center">
                  {check.status === 'idle' ? (
                    <>
                      <svg
                        className="w-12 h-12 text-gray-400 mb-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                      <p className="text-sm text-gray-400 text-center">
                        カメラと通信速度のチェック完了後にマイクテストを開始します
                      </p>
                    </>
                  ) : check.status === 'checking' ? (
                    <>
                      <svg
                        className="w-12 h-12 text-blue-600 mb-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                      <div className="w-full mb-4">
                        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                          <div
                            className={`h-4 rounded-full transition-all duration-100 ${
                              micLevel <= 30
                                ? 'bg-green-400'
                                : micLevel <= 70
                                ? 'bg-yellow-400'
                                : 'bg-red-400'
                            }`}
                            style={{ width: `${micLevel}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 text-center">
                        マイクの動作を確認します。「こんにちは」と話しかけてください。
                      </p>
                    </>
                  ) : check.status === 'pass' ? (
                    <>
                      <svg
                        className="w-12 h-12 text-green-600 mb-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                      <p className="text-sm text-green-600 text-center">
                        音声が正常に検出されました
                      </p>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-12 h-12 text-red-500 mb-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                      <p className="text-sm text-red-500 text-center">
                        {check.message || '音声が検出されませんでした。マイクがミュートになっていないか確認してください。'}
                      </p>
                      {check.helpMessage && (
                        <p className="text-sm text-gray-500 text-center mt-1">
                          {check.helpMessage}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div
                key={check.id}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  check.status === 'pass'
                    ? 'border-green-200 bg-green-50'
                    : check.status === 'fail'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(check.status)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {check.label}
                    </p>
                    {check.message && (
                      <p
                        className={`text-xs mt-1 ${
                          check.status === 'fail'
                            ? 'text-red-600'
                            : check.status === 'pass'
                            ? 'text-green-600'
                            : 'text-gray-600'
                        }`}
                      >
                        {check.message}
                      </p>
                    )}
                    {check.status === 'fail' && check.helpMessage && (
                      <p className="text-sm text-gray-500 mt-1">
                        {check.helpMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div className="space-y-3 mb-20 pb-8">
          {checks.some((c) => c.status === 'fail') && (
            <SecondaryButton
              onClick={runChecks}
              disabled={checking}
            >
              もう一度チェックする
            </SecondaryButton>
          )}

          <p className="text-sm text-red-500">環境確認完了後、練習パートに進みます。</p>
          <PrimaryButton
            onClick={handleStartInterview}
            disabled={!allPassed || checking}
          >
            練習パートへ進む
          </PrimaryButton>

          <div className="text-center pt-4">
            <TextLink
              onClick={() => {
                if (window.confirm('面接をキャンセルしますか？')) {
                  router.push(`/interview/${slug}/cancelled`)
                }
              }}
            >
              面接をキャンセルする
            </TextLink>
          </div>
        </div>
      </div>
    </InterviewLayout>
  )
}

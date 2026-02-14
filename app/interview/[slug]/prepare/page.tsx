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
}

export default function PreparePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [checks, setChecks] = useState<CheckItem[]>([
    { id: 'camera', label: 'カメラ', status: 'idle', message: '' },
    { id: 'microphone', label: 'マイク', status: 'idle', message: '' },
    { id: 'network', label: '通信速度', status: 'idle', message: '' },
    { id: 'mic_test', label: 'マイクテスト', status: 'idle', message: '' },
  ])
  const [micLevel, setMicLevel] = useState(0)
  const [allPassed, setAllPassed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [hasRunChecks, setHasRunChecks] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
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
    }
  }, [])

  useEffect(() => {
    const passed = checks.every((c) => c.status === 'pass')
    setAllPassed(passed)
  }, [checks])

  useEffect(() => {
    runChecks()
  }, [])

  function updateCheck(id: string, status: CheckStatus, message: string = '') {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status, message } : c))
    )
  }

  async function runChecks() {
    setChecking(true)
    setHasRunChecks(true)

    // 1. カメラチェック
    updateCheck('camera', 'checking', 'カメラにアクセスしています...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

      updateCheck('camera', 'pass', 'カメラが正常に動作しています')
      updateCheck('microphone', 'checking', 'マイクを確認しています...')

      // 2. マイクチェック
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        updateCheck('microphone', 'pass', 'マイクが正常に動作しています')
      } else {
        updateCheck('microphone', 'fail', 'マイクが見つかりません')
      }
    } catch (error) {
      updateCheck('camera', 'fail', 'カメラへのアクセスが拒否されました')
      updateCheck('microphone', 'fail', 'マイクへのアクセスが拒否されました')
      setChecking(false)
      return
    }

    // 3. 通信速度チェック
    updateCheck('network', 'checking', '通信速度を測定しています...')
    const startTime = Date.now()
    try {
      await fetch('https://www.google.com/favicon.ico', {
        mode: 'no-cors',
        cache: 'no-cache',
      })
      const duration = Date.now() - startTime
      if (duration < 3000) {
        updateCheck(
          'network',
          'pass',
          `通信速度: 良好（応答時間 ${duration}ms）`
        )
      } else {
        updateCheck('network', 'fail', '通信速度が遅い可能性があります')
      }
    } catch (error) {
      updateCheck('network', 'fail', '通信速度の測定に失敗しました')
    }

    // 4. マイクテスト
    updateCheck('mic_test', 'checking', 'マイクレベルを測定しています...')
    if (streamRef.current) {
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(streamRef.current)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let maxLevel = 0
      let testDuration = 0
      const testLength = 3000 // 3秒

      function measureMic() {
        if (testDuration >= testLength) {
          if (maxLevel > 5) {
            updateCheck('mic_test', 'pass', '音声が正常に検出されました')
          } else {
            updateCheck('mic_test', 'fail', 'マイクの音声が検出されません。マイクがミュートになっていないか確認してください。')
          }
          setChecking(false)
          return
        }

        analyser.getByteFrequencyData(dataArray)
        const average =
          dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length
        const level = Math.min(100, (average / 255) * 100)
        setMicLevel(level)
        maxLevel = Math.max(maxLevel, level)

        testDuration += 100
        animationFrameRef.current = requestAnimationFrame(measureMic)
      }

      measureMic()
    } else {
      updateCheck('mic_test', 'fail', 'ストリームが取得できませんでした')
      setChecking(false)
    }
  }

  function handleStartInterview() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    router.push(`/interview/${slug}/session`)
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
            {streamRef.current ? (
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
          {checks.map((check) => (
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
                </div>
              </div>
              {check.id === 'mic_test' && check.status === 'checking' && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    何か話してみてください
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {checks.some((c) => c.status === 'fail') && (
            <SecondaryButton
              onClick={runChecks}
              disabled={checking}
            >
              もう一度チェックする
            </SecondaryButton>
          )}

          <p className="text-sm text-red-500">面接を開始すると録画が始まります。</p>
          <PrimaryButton
            onClick={handleStartInterview}
            disabled={!allPassed || checking}
          >
            面接を開始する
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

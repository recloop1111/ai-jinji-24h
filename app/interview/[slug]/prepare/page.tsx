'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Volume2, User, AlertCircle, Check, RefreshCw } from 'lucide-react'
import {
  classifyMediaError,
  mediaErrorMessage,
  isGetUserMediaSupported,
  stopStream,
} from '@/lib/interview/media'

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

  // Phase I-5: マイク=必須 / カメラ=任意。mic/camera を独立に状態管理する。
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
        /* analyser 不可（AudioContext 非対応等）でも mic 取得自体は成功。テストできないだけ。 */
      }
    },
    [cleanupMicTest],
  )

  // カメラ/マイク取得（再試行にも使う）。二段階: まず {video,audio}、失敗なら {audio} のみ（カメラ任意）。
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
      // カメラを諦めてマイクのみで再取得（カメラは任意）
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        setCameraError(mediaErrorMessage(classifyMediaError(e1), 'camera'))
      } catch (e2) {
        // マイクも取得不可 → 面接開始不可
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
      setCameraStatus('error') // カメラ無し（任意なので続行可）
    }
    startMicTest(stream)
    acquiringRef.current = false
  }, [cleanupMicTest, startMicTest])

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

  // マイク必須・カメラ任意: マイクテスト合格で進める。
  function handleNext() {
    if (micTestPassed) {
      router.push(`/interview/${slug}/practice`)
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  const displayCompany = company || dummyCompany
  const cameraOff = cameraStatus === 'error' // 取得不可 or カメラ無し（任意）
  const canProceed = micTestPassed

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen pb-8">
      {/* ロゴと会社名 */}
      <div className="pt-4 pb-3">
        <h1 className="text-blue-700 font-bold text-base text-center">AI人事24h</h1>
        <p className="text-gray-600 text-xs text-center mb-3">{displayCompany.name}</p>
      </div>

      {/* メインカード */}
      <div className="mx-4 sm:max-w-lg sm:mx-auto mt-4 sm:mt-10 bg-white rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-5 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-32 overflow-hidden pointer-events-none">
          <div className="absolute top-[-40px] left-[-20px] w-24 h-24 sm:w-32 sm:h-32 bg-blue-200/30 rounded-full blur-2xl"></div>
          <div className="absolute top-[-30px] right-[-10px] w-24 h-24 sm:w-32 sm:h-32 bg-indigo-200/30 rounded-full blur-2xl"></div>
          <div className="absolute top-[-20px] left-1/2 transform -translate-x-1/2 w-24 h-24 sm:w-32 sm:h-32 bg-sky-200/30 rounded-full blur-2xl"></div>
        </div>

        <div className="relative space-y-5">
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800 text-center">カメラ・マイクの確認</h2>
            <p className="text-sm text-gray-500 text-center mt-2">
              面接では<span className="font-medium text-gray-700">マイク（必須）</span>を使用します。<br />
              カメラは任意です（なくても面接を続けられます）。
            </p>
          </div>

          {/* カメラプレビュー（任意） */}
          <div className="aspect-video rounded-xl bg-black overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay={true}
              playsInline={true}
              muted={true}
              style={{ transform: 'scaleX(-1)', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {cameraStatus === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/90" role="status">
                <div className="text-white text-center">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-60" aria-hidden="true" />
                  <p className="text-sm">{cameraError ?? 'カメラを利用できません。'}</p>
                  <p className="text-xs text-white/60 mt-1">カメラなしでも面接を続けられます。</p>
                  <button
                    type="button"
                    onClick={acquire}
                    className="mt-3 inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    カメラを再確認する
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* マイクエラー（必須＝ブロッキング） */}
          {micStatus === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center" role="alert">
              <AlertCircle className="w-6 h-6 mx-auto mb-1.5 text-red-500" aria-hidden="true" />
              <p className="text-sm text-red-700">{micError ?? 'マイクを利用できません。'}</p>
              <p className="text-xs text-red-500 mt-1">マイクは面接に必須です。許可・接続を確認してください。</p>
              <button
                type="button"
                onClick={acquire}
                className="mt-3 inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full px-4 py-2 text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                マイクを再確認する
              </button>
            </div>
          )}

          {/* マイクテスト（マイクOK時のみ） */}
          {micStatus === 'ok' && (
            <div className="text-center">
              {!micTestPassed ? (
                <>
                  <p className="text-sm text-gray-600 text-center mt-1">『こんにちは』と話しかけてください</p>
                  <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden mx-auto mt-2" aria-hidden="true">
                    <div className="bg-blue-600 h-full rounded-full transition-all duration-100" style={{ width: `${Math.min((volume / 255) * 100, 100)}%` }} />
                  </div>
                </>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-4 py-2 text-green-700 text-sm font-medium mt-1">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>マイク確認済み</span>
                </div>
              )}
            </div>
          )}

          {/* ステータス表示（色だけに依存せず ✓/✗ 記号＋文言） */}
          <div className="flex justify-center gap-3">
            {micStatus === 'loading' ? (
              <div className="bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-3 py-1 text-sm">マイク確認中...</div>
            ) : micTestPassed ? (
              <div className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span aria-hidden="true">✓</span>
                <span>マイク 正常</span>
              </div>
            ) : micStatus === 'ok' ? (
              <div className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1 text-sm">マイク テスト待ち</div>
            ) : (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span aria-hidden="true">✗</span>
                <span>マイク エラー</span>
              </div>
            )}

            {cameraStatus === 'loading' ? (
              <div className="bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-3 py-1 text-sm">カメラ確認中...</div>
            ) : cameraStatus === 'ok' ? (
              <div className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span aria-hidden="true">✓</span>
                <span>カメラ 正常</span>
              </div>
            ) : (
              <div className="bg-gray-50 text-gray-600 border border-gray-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span aria-hidden="true">–</span>
                <span>カメラ なし（任意）</span>
              </div>
            )}
          </div>

          {/* 注意事項 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">面接中の注意事項</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Volume2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <p className="text-xs text-gray-500">静かな場所で、はっきりお話しください</p>
              </div>
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <p className="text-xs text-gray-500">カメラを使う場合は顔全体が映るようにしてください</p>
              </div>
            </div>
          </div>

          {/* 面接練習へ進むボタン（マイク必須。カメラ無しでも進める） */}
          <button
            onClick={handleNext}
            disabled={!canProceed}
            aria-disabled={!canProceed}
            className={`w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-all duration-200 min-h-[48px] ${
              canProceed ? '' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {cameraOff ? 'カメラなしで面接練習へ進む' : '面接練習へ進む'}
          </button>

          <p className="text-center">
            <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-500 underline">
              面接をキャンセルする
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Camera, Mic, Volume2, User, Video, AlertCircle, Check } from 'lucide-react'

// Supabaseから取得できない場合のダミーデータ
const dummyCompany = {
  id: 'dummy-company-id',
  name: '株式会社サンプル',
  logo_url: null,
  is_suspended: false,
}

export default function PreparePage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [company, setCompany] = useState<{
    id: string
    name: string
    logo_url: string | null
    is_suspended: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [micStatus, setMicStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [micTestPassed, setMicTestPassed] = useState(false)
  const [volume, setVolume] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const thresholdStartTimeRef = useRef<number | null>(null)
  const micTestPassedRef = useRef(false)

  useEffect(() => {
    fetchCompany()
  }, [slug])

  useEffect(() => {
    let stream: MediaStream | null = null

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setStream(stream)
        setCameraStatus('ok')
        setMicStatus('ok')

        // AudioContext と AnalyserNode を設定
        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        
        audioContextRef.current = audioContext
        analyserRef.current = analyser

        // 音量をリアルタイムで取得
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        
        const updateVolume = () => {
          if (analyserRef.current && !micTestPassedRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray)
            const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
            const volumeValue = Math.round(average)
            setVolume(volumeValue)

            // 閾値（40）を超えた状態が0.5秒以上継続したら合格
            if (volumeValue > 40) {
              const now = Date.now()
              if (thresholdStartTimeRef.current === null) {
                thresholdStartTimeRef.current = now
              } else if (now - thresholdStartTimeRef.current >= 500) {
                micTestPassedRef.current = true
                setMicTestPassed(true)
              }
            } else {
              thresholdStartTimeRef.current = null
            }

            animationFrameRef.current = requestAnimationFrame(updateVolume)
          }
        }
        updateVolume()
      } catch (err) {
        console.error('Camera error:', err)
        setCameraStatus('error')
        setMicStatus('error')
      }
    }

    const timer = setTimeout(() => {
      startCamera()
    }, 500)

    return () => {
      clearTimeout(timer)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  async function fetchCompany() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, logo_url, is_suspended')
        .eq('interview_slug', slug)
        .single()

      if (error || !data) {
        setCompany(dummyCompany)
      } else {
        setCompany(data)
      }
    } catch (error) {
      // TODO: 段階4 - Supabase接続を本実装する
      console.warn('Supabase取得スキップ（段階3デモ）:', error)
      setCompany(dummyCompany)
    }
    setLoading(false)
  }

  function handleNext() {
    if (cameraStatus === 'ok' && micTestPassed) {
      router.push(`/interview/${slug}/practice`)
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen flex items-center justify-center">
        <svg
          className="animate-spin h-8 w-8 text-blue-600"
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
      </div>
    )
  }

  const displayCompany = company || dummyCompany
  const isReady = cameraStatus === 'ok' && micTestPassed

  return (
    <div className="bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 min-h-screen pb-8">
      {/* ロゴと会社名 */}
      <div className="pt-4 pb-3">
        <h1 className="text-blue-700 font-bold text-base text-center">AI人事24h</h1>
        <p className="text-gray-600 text-xs text-center mb-3">{displayCompany.name}</p>
      </div>

      {/* メインカード */}
      <div className="mx-4 sm:max-w-lg sm:mx-auto mt-4 sm:mt-10 bg-white rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-5 sm:p-8 relative overflow-hidden">
        {/* 上部装飾（円形グラデーション） */}
        <div className="absolute top-0 left-0 right-0 h-32 overflow-hidden pointer-events-none">
          <div className="absolute top-[-40px] left-[-20px] w-24 h-24 sm:w-32 sm:h-32 bg-blue-200/30 rounded-full blur-2xl"></div>
          <div className="absolute top-[-30px] right-[-10px] w-24 h-24 sm:w-32 sm:h-32 bg-indigo-200/30 rounded-full blur-2xl"></div>
          <div className="absolute top-[-20px] left-1/2 transform -translate-x-1/2 w-24 h-24 sm:w-32 sm:h-32 bg-sky-200/30 rounded-full blur-2xl"></div>
        </div>

        <div className="relative space-y-5">
          {/* タイトル */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-800 text-center">カメラ・マイクの確認</h2>
            <p className="text-sm text-gray-500 text-center mt-2">
              面接ではカメラとマイクを使用します。<br />
              正常に動作するか確認してください。
            </p>
          </div>

          {/* カメラプレビュー */}
          <div className="aspect-video rounded-xl bg-black overflow-hidden relative">
            <video
              ref={videoRef}
              autoPlay={true}
              playsInline={true}
              muted={true}
              style={{ transform: 'scaleX(-1)', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {cameraStatus === 'error' && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-black">
                <div className="text-white text-center">
                  <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    カメラにアクセスできません。<br />
                    ブラウザの設定を確認してください。
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* マイクテスト */}
          {cameraStatus === 'ok' && (
            <div className="text-center">
              {!micTestPassed ? (
                <>
                  <p className="text-sm text-gray-600 text-center mt-3">『こんにちは』と話しかけてください</p>
                  {/* 音量バー */}
                  <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden mx-auto mt-2">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-100"
                      style={{ width: `${Math.min((volume / 255) * 100, 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-4 py-2 text-green-700 text-sm font-medium mt-3">
                  <Check className="w-4 h-4" />
                  <span>マイク確認済み</span>
                </div>
              )}
            </div>
          )}

          {/* ステータス表示 */}
          <div className="flex justify-center gap-3">
            {/* カメラステータス */}
            {cameraStatus === 'loading' ? (
              <div className="bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-3 py-1 text-sm">
                カメラ確認中...
              </div>
            ) : cameraStatus === 'ok' ? (
              <div className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span>✓</span>
                <span>カメラ正常</span>
              </div>
            ) : (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span>✗</span>
                <span>カメラエラー</span>
              </div>
            )}

            {/* マイクステータス */}
            {micStatus === 'loading' ? (
              <div className="bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-3 py-1 text-sm">
                マイク確認中...
              </div>
            ) : micTestPassed ? (
              <div className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span>✓</span>
                <span>マイク正常</span>
              </div>
            ) : micStatus === 'error' ? (
              <div className="bg-red-50 text-red-700 border border-red-200 rounded-full px-3 py-1 text-sm flex items-center gap-1">
                <span>✗</span>
                <span>マイクエラー</span>
              </div>
            ) : (
              <div className="bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-3 py-1 text-sm">
                マイクテスト待機中
              </div>
            )}
          </div>

          {/* 注意事項 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">面接中の注意事項</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Volume2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-500">静かな場所で受けてください</p>
              </div>
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-500">顔全体が映るようにしてください</p>
              </div>
              <div className="flex items-start gap-2">
                <Video className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-500">面接中は録画されます</p>
              </div>
            </div>
          </div>

          {/* 面接練習へ進むボタン */}
          <button
            onClick={handleNext}
            disabled={!(cameraStatus === 'ok' && micTestPassed)}
            className={`w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-all duration-200 min-h-[48px] ${
              cameraStatus === 'ok' && micTestPassed
                ? ''
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            面接練習へ進む
          </button>

          {/* 面接をキャンセルする */}
          <p className="text-center">
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-400 hover:text-gray-500 underline"
            >
              面接をキャンセルする
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

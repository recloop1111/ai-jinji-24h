'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Volume2, User, AlertCircle, Check, RefreshCw, Globe, Mic, Sun } from 'lucide-react'
import { StepIndicator } from '@/components/interview/FormComponents'
import {
  classifyMediaError,
  mediaErrorMessage,
  isGetUserMediaSupported,
  stopStream,
} from '@/lib/interview/media'
import {
  shouldPassMicTest,
  isVoiceActive,
  hasSpeechTranscript,
  isFatalSpeechError,
  computeNoiseFloor,
  MIC_NOISE_FLOOR_SAMPLE_MS,
} from '@/lib/interview/mic-test'
import {
  initFaceStability,
  updateFaceStability,
  classifyBrightness,
  classifyFaceFraming,
  faceFramingMessage,
  environmentCanProceed,
  type FaceStabilityState,
  type FaceFraming,
} from '@/lib/interview/environment-check'
import { createFacePresenceDetector, type FacePresenceDetector } from '@/lib/interview/face-detector'

// SpeechRecognition の最小型（ブラウザ差を吸収）。
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: (e: { resultIndex: number; results: { 0: { transcript: string } }[] & { length: number } }) => void
  onerror: (e: { error: string }) => void
  onend: () => void
  start: () => void
  stop: () => void
}

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
  // 顔フレーミング/明るさ（完全ブラウザ内・presence+framing のみ・保存/送信なし）。cameraStatus とは別軸。
  //   facePhase = detector ライフサイクル（loading→running / 失敗で error）。faceFraming = 現在の映り方。
  //   faceVerified = 「顔全体が適正に映っている」状態が約1秒安定したか（＝進行条件の一部）。
  const [facePhase, setFacePhase] = useState<'loading' | 'running' | 'error'>('loading')
  const [faceFraming, setFaceFraming] = useState<FaceFraming>('none')
  const [faceVerified, setFaceVerified] = useState(false)
  const [brightnessStatus, setBrightnessStatus] = useState<'checking' | 'ok' | 'dark'>('checking')
  const [faceRetryNonce, setFaceRetryNonce] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const micTestPassedRef = useRef(false)
  const acquiringRef = useRef(false) // 連打/race 防止
  const cancelledRef = useRef(false) // unmount 後の state 更新防止
  // マイクテスト（誤判定防止）用: robust noise floor・voice activity 継続・発話 transcript 取得。
  const micTestStartRef = useRef<number | null>(null)
  const noiseFloorRef = useRef<number>(0)
  const noiseSamplesRef = useRef<number[]>([]) // noise floor 計測窓のサンプル（median＋cap で robust 化）
  const voiceDetectedRef = useRef(false) // 一度でも発話らしい入力を検出したか
  const voiceActiveStartRef = useRef<number | null>(null) // 連続 voice-active の開始
  const sustainedVoiceMsRef = useRef<number>(0) // 連続 voice-active の最大継続時間
  const transcriptDetectedRef = useRef(false) // recognition が非空の発話 transcript を取得したか
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechApiAvailableRef = useRef(false) // SpeechRecognition API が存在するか
  const speechHealthyRef = useRef(false) // recognition が現在正常に動作しているか（fatal error で false）
  const micTestActiveRef = useRef(false) // マイクテスト稼働中か（cleanup/unmount 後の restart 防止）
  const recognitionRestartsRef = useRef(0) // onend 後の restart 回数（無限 loop 防止）
  // 顔検出/明るさ用（すべて一時 client state。unmount で破棄。保存/送信しない）。
  const faceStabilityRef = useRef<FaceStabilityState>(initFaceStability())
  const faceDetectorRef = useRef<FacePresenceDetector | null>(null)
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // マイクテスト（音量解析＋音声認識）の後始末。再試行/アンマウントで確実に解放し、判定 refs をリセット。
  const cleanupMicTest = useCallback(() => {
    // 先に active フラグを落とす（onend が発火しても restart しない＝unmount 後 restart 防止）。
    micTestActiveRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        /* noop */
      }
      recognitionRef.current = null
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
    micTestStartRef.current = null
    noiseFloorRef.current = 0
    noiseSamplesRef.current = []
    voiceDetectedRef.current = false
    voiceActiveStartRef.current = null
    sustainedVoiceMsRef.current = 0
    transcriptDetectedRef.current = false
    speechApiAvailableRef.current = false
    speechHealthyRef.current = false
    recognitionRestartsRef.current = 0
  }, [])

  // マイクテスト（誤判定防止）。目的＝「マイクが正常で本人の明確な発話が入力されている」ことの確認。
  //   - Primary: recognition が正常動作 ＋ 非空の発話 transcript ＋ voice activity（文字列の完全一致は不要）。
  //   - Fallback: recognition が使えない/未取得でも、robust な noise floor を明確に超える sustained voice で合格。
  //   - fatal な recognition error（network/service-not-allowed/audio-capture/not-allowed）は healthy=false にして
  //     必ず WebAudio fallback に移行（ユーザーを永久に詰ませない）。onend は稼働中・未合格・上限内なら安全に restart。
  //   - analyser/AudioContext 失敗を「自動合格」にしない（fail-open 廃止）。
  const startMicTest = useCallback(
    (stream: MediaStream) => {
      cleanupMicTest()
      micTestStartRef.current = Date.now()
      micTestActiveRef.current = true
      recognitionRestartsRef.current = 0

      // 合格判定（recognition/analyser の両経路から共通で呼ぶ）。
      const tryPass = (): boolean => {
        if (micTestPassedRef.current || cancelledRef.current) return false
        const hasLiveAudio = stream.getAudioTracks().some((t) => t.readyState === 'live')
        if (
          shouldPassMicTest({
            hasLiveAudio,
            speechRecognitionHealthy: speechHealthyRef.current,
            transcriptDetected: transcriptDetectedRef.current,
            voiceDetected: voiceDetectedRef.current,
            sustainedVoiceMs: sustainedVoiceMsRef.current,
          })
        ) {
          micTestPassedRef.current = true
          setMicTestPassed(true)
          return true
        }
        return false
      }

      // SpeechRecognition（あれば）をマイクテスト中だけ起動。「API が存在」と「正常動作中」を区別する。
      const w = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike
        webkitSpeechRecognition?: new () => SpeechRecognitionLike
      }
      const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition
      speechApiAvailableRef.current = !!SpeechRecognition
      speechHealthyRef.current = !!SpeechRecognition // API があれば一旦 healthy。fatal error で false へ。
      const MAX_RESTARTS = 6
      const startRecognition = () => {
        if (!SpeechRecognition) return
        try {
          const recognition = new SpeechRecognition()
          recognition.lang = 'ja-JP'
          recognition.continuous = true
          recognition.interimResults = true
          recognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i]?.[0]?.transcript ?? ''
              // 非空の発話 transcript ＝ 実際に人が話した（voice も立てる）。greeting 完全一致は要求しない。
              if (hasSpeechTranscript(transcript)) {
                transcriptDetectedRef.current = true
                voiceDetectedRef.current = true
              }
            }
            tryPass()
          }
          recognition.onerror = (e) => {
            // fatal（recognition service を利用できない）→ healthy=false にして WebAudio fallback に委ねる。
            //   no-speech / aborted 等は retriable（ここで合格にせず、onend で安全に restart）。
            if (isFatalSpeechError(e?.error ?? '')) speechHealthyRef.current = false
          }
          recognition.onend = () => {
            // 稼働中・未合格・上限内・healthy・未離脱なら安全に再開（無限 loop / unmount 後 restart は防止）。
            if (
              !cancelledRef.current &&
              micTestActiveRef.current &&
              !micTestPassedRef.current &&
              speechHealthyRef.current &&
              recognitionRestartsRef.current < MAX_RESTARTS
            ) {
              recognitionRestartsRef.current += 1
              try {
                recognition.start()
              } catch {
                /* 二重 start 等は無視（fallback が継続） */
              }
            }
          }
          recognition.start()
          recognitionRef.current = recognition
        } catch {
          speechHealthyRef.current = false // 起動不可＝正常動作していない。fallback に委ねる。
        }
      }
      startRecognition()

      // Web Audio analyser（voice activity / robust noise floor / 音量バー）。失敗しても「合格」にしない。
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
          const level = Math.round(dataArray.reduce((s, v) => s + v, 0) / dataArray.length)
          setVolume(level)
          const now = Date.now()
          const elapsed = now - (micTestStartRef.current ?? now)

          // 開始直後 MIC_NOISE_FLOOR_SAMPLE_MS は noise floor を計測（median＋cap で robust・この間は合格判定しない）。
          //   即発話でも floor が高止まりせず、普通の声で確実に voice activity を超えられる。
          if (elapsed < MIC_NOISE_FLOOR_SAMPLE_MS) {
            noiseSamplesRef.current.push(level)
            noiseFloorRef.current = computeNoiseFloor(noiseSamplesRef.current)
          } else {
            const active = isVoiceActive(level, noiseFloorRef.current)
            if (active) {
              voiceDetectedRef.current = true
              if (voiceActiveStartRef.current === null) voiceActiveStartRef.current = now
              const dur = now - voiceActiveStartRef.current
              if (dur > sustainedVoiceMsRef.current) sustainedVoiceMsRef.current = dur
            } else {
              voiceActiveStartRef.current = null
            }
            if (tryPass()) return
          }
          animationFrameRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        // fail-open 廃止: analyser 不能でも自動合格にしない。recognition の transcript 経由でのみ合格し得る。
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

  // カメラ映像の安定表示（seam）: cameraStatus==='ok' で live video track があり、<video> の srcObject が未接続なら再attach。
  //   loading 中に取得が解決して <video> 未マウントだった / 再描画で binding が外れた場合でも復旧する。deps 無し（毎レンダー・軽量ガード）。
  useEffect(() => {
    const v = videoRef.current
    const s = streamRef.current
    if (
      cameraStatus === 'ok' &&
      v &&
      s &&
      s.getVideoTracks().some((t) => t.readyState === 'live') &&
      v.srcObject !== streamRef.current
    ) {
      v.srcObject = s
      v.play().catch(() => {
        /* autoplay policy 等で失敗 → 下の pointerdown seam でユーザー操作後に再試行 */
      })
    }
  })

  // play() が autoplay policy 等で失敗した場合の再試行（ユーザー操作起点・UIは変えない）。
  useEffect(() => {
    const onPointerDown = () => {
      const v = videoRef.current
      if (cameraStatus === 'ok' && v && v.srcObject && v.paused) v.play().catch(() => {})
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [cameraStatus])

  // 顔フレーミング判定（presence+framing）＋明るさチェック（完全ブラウザ内・~2fps・保存/送信なし）。cameraStatus==='ok' の間だけ稼働。
  useEffect(() => {
    if (cameraStatus !== 'ok') return
    let disposed = false
    // 明るさ用の小さな offscreen canvas（縮小画像のみ解析・フル解像度は使わない）。
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 36
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // 初期 state（loading/none/false）は既定値と一致。再ロード時は下の cleanup が reset するため、
    // ここで同期 setState はしない（cascading renders 回避）。ref のみリセット。
    faceStabilityRef.current = initFaceStability()
    ;(async () => {
      let detector: FacePresenceDetector
      try {
        detector = await createFacePresenceDetector()
      } catch {
        // モデル/WASM ロード失敗 → fail-open しない（faceVerified は false のまま）。honest error＋retry を表示。
        if (!disposed) setFacePhase('error')
        return
      }
      if (disposed) {
        detector.close()
        return
      }
      faceDetectorRef.current = detector
      if (!disposed) setFacePhase('running')

      faceIntervalRef.current = setInterval(() => {
        if (disposed) return
        const v = videoRef.current
        const det = faceDetectorRef.current
        if (!v || !det || v.readyState < 2) return
        const now = Date.now()
        // bounding box 比率のみ取得（画像/embedding は扱わない）→ フレーミング分類。
        let framing: FaceFraming = 'none'
        try {
          const r = det.detect(v, now)
          framing = classifyFaceFraming(r.box)
        } catch {
          framing = 'none'
        }
        // 「顔全体が適正に映っている(framing==='ok')」が約1秒安定 → verified。debounce で一瞬の NG では戻さない。
        const framingOk = framing === 'ok'
        faceStabilityRef.current = updateFaceStability(faceStabilityRef.current, { faceDetected: framingOk, nowMs: now })
        setFaceVerified(faceStabilityRef.current.verified)
        setFaceFraming(framing)
        // 明るさ: 縮小画像の平均輝度（Y=0.2126R+0.7152G+0.0722B）。警告のみ・blocking しない。
        if (ctx) {
          try {
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
            let sum = 0
            const n = canvas.width * canvas.height
            for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
            setBrightnessStatus(classifyBrightness(sum / n))
          } catch {
            /* noop */
          }
        }
      }, 450)
    })()

    return () => {
      disposed = true
      if (faceIntervalRef.current) {
        clearInterval(faceIntervalRef.current)
        faceIntervalRef.current = null
      }
      if (faceDetectorRef.current) {
        faceDetectorRef.current.close()
        faceDetectorRef.current = null
      }
      faceStabilityRef.current = initFaceStability()
      // 次回 run（camera 再取得 / retry）に備え UI を初期状態へ戻す（cleanup 内の setState は許容）。
      setFaceVerified(false)
      setFaceFraming('none')
      setFacePhase('loading')
    }
    // faceRetryNonce の変化で再ロード（detector load 失敗時の retry）。
  }, [cameraStatus, faceRetryNonce])

  // マイク必須・カメラ必須・発話確認必須・顔検出必須（明るさは警告のみ＝進行条件に含めない）。
  function handleNext() {
    if (environmentCanProceed({ micStatus, cameraStatus, micTestPassed, faceVerified })) {
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

  // 正式仕様: カメラ必須・マイク必須・発話確認必須・顔検出必須（明るさは警告のみで含めない）。
  const canProceed = environmentCanProceed({ micStatus, cameraStatus, micTestPassed, faceVerified })
  const bothVerified = micStatus === 'ok' && cameraStatus === 'ok' && micTestPassed && faceVerified

  return (
    <div className="min-h-screen bg-slate-100">
      {header}

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8 lg:py-6">
        {/* ステッパー（環境確認=現在=4）。既存フロー優先（同意→情報入力→SMS認証→環境確認→面接）。 */}
        <div className="mb-5 lg:mb-4">
          <StepIndicator currentStep={4} totalSteps={5} labels={STEP_LABELS} />
        </div>

        <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-7 lg:p-6">
          {/* 見出し＋補足（マイクテスト前/後で文言を切替）。 */}
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">カメラ・マイクの確認</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              {bothVerified ? '正常に動作していることを確認しました。' : 'マイクに向かって「こんにちは」と話しかけてください。'}
            </p>
          </div>

          {/* カメラプレビュー（16:9・mirror）。カメラは必須。Desktop は高さを clamp して 1画面に収める。 */}
          <div className="relative mx-auto mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 lg:[max-height:clamp(190px,28dvh,260px)] lg:[max-width:calc(clamp(190px,28dvh,260px)*16/9)]">
            <video
              ref={videoRef}
              autoPlay={true}
              playsInline={true}
              muted={true}
              style={{ transform: 'scaleX(-1)', width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* 顔を合わせる位置の薄いガイド（撮影アプリ的に派手にしない・確認済みで消す）。 */}
            {cameraStatus === 'ok' && facePhase === 'running' && !faceVerified && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                <div className="h-[66%] w-[42%] rounded-[50%] border-2 border-dashed border-white/25" />
              </div>
            )}
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

          {/* マイクテスト: 未合格の間だけ「こんにちは」案内＋音量バー（合格状態は下のステータス pill で表示・重複を排除）。 */}
          {micStatus === 'ok' && !micTestPassed && (
            <div className="mt-4 text-center">
              <p className="text-sm font-medium text-slate-700">「こんにちは」と話しかけてください</p>
              <div className="mx-auto mt-2.5 h-2 w-64 max-w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-100"
                  style={{ width: `${Math.min((volume / 255) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* ステータス pill（色だけに依存せず ✓/✗/○/⚠＋文言）。マイク/カメラ/顔/明るさ を別軸で表示（折返し可）。 */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {micStatus === 'loading' ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500">マイク確認中...</span>
            ) : micTestPassed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3.5 py-2 text-sm font-medium text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                マイク正常
              </span>
            ) : micStatus === 'ok' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-medium text-blue-700">
                <Mic className="h-4 w-4" aria-hidden="true" />
                マイクテスト待ち
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700">
                <span aria-hidden="true">✗</span>
                マイクエラー
              </span>
            )}

            {cameraStatus === 'loading' ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500">カメラ確認中...</span>
            ) : cameraStatus === 'ok' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3.5 py-2 text-sm font-medium text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                カメラ正常
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700">
                <span aria-hidden="true">✗</span>
                カメラエラー
              </span>
            )}

            {/* 顔確認（cameraStatus とは別軸）。「顔を確認しました」は顔全体が適正に映って安定したときだけ表示。 */}
            {facePhase === 'error' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-700">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                顔確認を開始できませんでした
                <button type="button" onClick={() => setFaceRetryNonce((n) => n + 1)} className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs hover:bg-amber-200">
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  再試行
                </button>
              </span>
            ) : faceVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3.5 py-2 text-sm font-medium text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                顔を確認しました
              </span>
            ) : facePhase === 'running' && faceFraming !== 'none' && faceFramingMessage(faceFraming) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-700">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {faceFramingMessage(faceFraming)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500">
                <span aria-hidden="true">○</span>
                顔を確認中...
              </span>
            )}

            {/* 明るさ（警告のみ・進行条件に含めない）。 */}
            {brightnessStatus === 'dark' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm font-medium text-amber-700">
                <Sun className="h-4 w-4" aria-hidden="true" />
                少し暗いようです
              </span>
            ) : brightnessStatus === 'ok' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3.5 py-2 text-sm font-medium text-green-700">
                <Check className="h-4 w-4" aria-hidden="true" />
                明るさ正常
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-500">明るさ確認中...</span>
            )}
          </div>

          {/* ガイダンス（warning のみ・blocking しない）。顔未検出の促し＋明るさ。フレーミング指示は上の顔 pill に表示。 */}
          {((facePhase === 'running' && faceFraming === 'none' && !faceVerified && cameraStatus === 'ok') ||
            brightnessStatus === 'dark') && (
            <div className="mt-2.5 space-y-1 text-center text-xs text-amber-600">
              {facePhase === 'running' && faceFraming === 'none' && !faceVerified && cameraStatus === 'ok' && (
                <p>顔全体が映るようにしてください</p>
              )}
              {brightnessStatus === 'dark' && <p>明るい場所へ移動してください</p>}
            </div>
          )}

          {/* 面接中の注意事項（カメラは必須＝「使う場合は」を撤去）。Desktop は横並びで高さを節約。 */}
          <div className="mt-5">
            <h2 className="mb-2 text-sm font-bold text-slate-900">面接中の注意事項</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-6">
              <div className="flex items-start gap-2">
                <Volume2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-500">静かな場所で、はっきりお話しください</p>
              </div>
              <div className="flex items-start gap-2">
                <User className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                <p className="text-sm text-slate-500">顔全体が映るようにしてください</p>
              </div>
            </div>
          </div>

          {/* 面接練習へ進む（カメラ・マイク正常＋マイクテスト合格＋顔確認のときだけ active）。 */}
          <button
            onClick={handleNext}
            disabled={!canProceed}
            aria-disabled={!canProceed}
            className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-lg shadow-blue-600/25 transition-all duration-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-600/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 active:scale-[0.99] disabled:pointer-events-none disabled:bg-blue-300 disabled:opacity-70 disabled:shadow-none"
          >
            面接練習へ進む
          </button>

          <div className="mt-3 text-center">
            <button onClick={() => router.back()} className="text-sm text-slate-400 underline underline-offset-2 hover:text-slate-500">
              面接をキャンセルする
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

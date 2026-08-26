'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  MAX_INTERVIEW_SECONDS,
  INTERVIEW_WARNING_SECONDS,
  MAX_INTERVIEW_MINUTES,
  INTERVIEW_WARNING_REMAINING_MINUTES,
} from '@/lib/config/interview-policy'
import { connectRealtimeCall } from '@/lib/interview/realtime-client'
import { sendTranscriptEvent } from '@/lib/interview/transcript-sender'
import {
  createMockPresenceDriver,
  type InterviewPhase,
  type MockPresenceDriver,
} from '@/lib/interview/presence'
import { computeQuestionProgress, turnHintForPhase } from '@/lib/interview/questionProgress'
import { buildInterviewSummary, serializeSummary, summaryStorageKey } from '@/lib/interview/completeSummary'
import {
  isGetUserMediaSupported,
  stopStream,
  setTracksEnabled,
  hasLiveTrack,
  commitOrStopStream,
  canCommitMediaStream,
  micLossActionForMode,
  cameraFlagsForStream,
  type SessionMode,
} from '@/lib/interview/media'
import { Mic, MicOff, Video, VideoOff, Volume2 } from 'lucide-react'
import InterviewerAvatar from '@/components/interview/InterviewerAvatar'
// 公開フローの DB アクセスは token付き service-role API 経由（browser直アクセス廃止）
// AI音声面接（Realtime）は allowlist 企業＆フラグON時のみ。それ以外は realtime-call が 503/403 → モックへ。

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
// 追加P1（Codex）: realtime 確立後、この時間内に AI が一度も応答しなければ（初回 response.create 失敗等）、
// 無音放置を避けて realtime を閉じ既存モックへフォールバックする（one-shot・初回応答のみ）。
// 後続ターンごとの無音検知（response lifecycle ベース）は follow-up Issue #21。
const REALTIME_RESPONSE_TIMEOUT_MS = 30000

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  // Phase I-1: 面接官プレゼンスの正規状態（connecting/idle/listening/thinking/speaking/ending）。
  // 状態変更は setPhase 一点に集約する（下記）。初期は接続/準備中。
  const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>('connecting')
  const [showConnectionBanner, setShowConnectionBanner] = useState(false)
  const [bannerOpacity, setBannerOpacity] = useState(0)
  const [aiSpeechText, setAiSpeechText] = useState('')
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
  // 面接モード: connecting=Realtime試行中 / realtime=AI音声面接 / mock=既存モック自動進行。
  // ※ 直接 setModeState を呼ばず、必ず下の setMode ラッパ経由にする（modeRef を同期更新するため）。
  const [mode, setModeState] = useState<SessionMode>('connecting')
  // カメラ/マイク取得が失敗（マイク拒否等）したら Realtime 不可 → モックへ落とすためのフラグ。
  const [mediaFailed, setMediaFailed] = useState(false)
  // Phase I-5: マイク=必須 / カメラ=任意。取得できた種別・ミュート/OFF・切断・音声自動再生ブロックを管理。
  const [hasVideoTrack, setHasVideoTrack] = useState(false) // カメラトラックを取得できたか（任意）
  const [micMuted, setMicMuted] = useState(false) // マイクミュート（track.enabled で制御・取り直さない）
  const [cameraOn, setCameraOn] = useState(true) // カメラON/OFF（track.enabled で制御・取り直さない）
  const [micLost, setMicLost] = useState(false) // マイク切断（デバイス取り外し/占有）→ 再接続案内
  const [audioBlocked, setAudioBlocked] = useState(false) // iOS/Safari 等で AI音声の自動再生がブロックされた
  const audioUnlockedRef = useRef(false) // ユーザー操作で音声再生をアンロック済みか（seam）
  const reacquiringRef = useRef(false) // メディア再取得の連打/race 防止
  // Phase I-5(P2): コンポーネントのマウント状態。非同期のメディア再取得（reacquireMedia）が
  // 取得完了する前にページ離脱/面接終了で unmount した場合、取得ストリームを保存せず即 stop するために使う
  //（setupCamera effect の disposed は当該 effect インスタンス限定。こちらはハンドラ用＝コンポーネント寿命）。
  const mountedRef = useRef(true)
  // Codex P1: トラック切断ハンドラ（安定 useCallback）から現在の mode / 最新 handleEndInterview を参照するための ref。
  // realtime 中のマイク切断はローカル再取得では PeerConnection の sender track を張り替えられない（＝#21）。
  // その場合はローカル再接続 UI を出さず、無音送出のまま継続させず「途中終了」で終了する（PR-11 の切断→終了と整合）。
  const modeRef = useRef<SessionMode>('connecting')
  const endInterviewRef = useRef<
    ((endReason?: '全質問完了' | '時間切れ' | '自主終了', answeredOverride?: number) => void) | null
  >(null)
  // Codex P2: mode と modeRef をアトミックに更新する統一ラッパ。全ての mode 遷移はこれ経由にする
  //（setModeState を直接呼ばない）。modeRef.current を先に同期更新してから React state を更新するため、
  // mode 遷移直後に発火するハンドラ（track ended 等）も常に最新 mode を参照する（受動 useEffect 同期の遅延窓を廃止）。
  const setMode = useCallback((next: SessionMode) => {
    modeRef.current = next
    setModeState(next)
  }, [])
  const realtimeRef = useRef<{ close: () => void } | null>(null)
  const realtimeAttemptedRef = useRef(false)
  // 追加P1（Codex）: AI が一度でも応答（transcript）したか。初回 response.create が失敗すると AI が話し始めず
  // 無音のまま放置され得るため、realtime 確立後の「初回応答」ウォッチドッグで使う（one-shot）。
  // ※ 後続ターンごとの無音検知（response lifecycle ベース）は follow-up Issue #21 に切り出し。
  const aiRespondedRef = useRef(false)
  // onDisconnect から /end する際に最新の回答数を渡すための ref（effect クロージャの陳腐化対策）。
  const answeredRef = useRef(0)
  // onInterviewComplete（全質問完了 tool シグナル）から /end する際に全質問数を渡すための ref。
  const totalQuestionsRef = useRef(0)
  // Phase I-4: 完了時 summary に「最新の経過秒」を渡すための ref。handleEndInterview は mock/Realtime の
  // effect クロージャに捕捉されて elapsedSeconds が陳腐化するため、ref で常に現在値を参照する。
  const elapsedRef = useRef(0)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  // transcript は PR-2 ではメモリ保持のみ（DB保存は PR-3）。
  const transcriptRef = useRef<{ role: 'applicant' | 'ai'; text: string }[]>([])
  // 二重 /end 防止（自動完了・手動終了・時間切れの競合を同期的に弾く）
  const endTriggeredRef = useRef(false)
  // モック質問プログレッションを1セッションにつき1回だけ起動させるガード
  const progressionStartedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Phase I-3: 現在質問ボックス（縦スクロール可）を、質問が変わるたび先頭へ戻すための ref。
  const speechScrollRef = useRef<HTMLDivElement>(null)
  // blockingError の最新値を camera 取得の非同期処理から参照するための ref（クロージャの陳腐化対策）
  const blockingErrorRef = useRef(false)

  // Phase I-1: プレゼンス状態変更の「単一入口」。mock ドライバ・mode 効果・終了処理はすべてこれ経由。
  // ending へ遷移したら以後は他状態へ動かさない（面接終了後に状態が書き換わらない）。
  const phaseEndedRef = useRef(false)
  const setPhase = useCallback((p: InterviewPhase) => {
    if (phaseEndedRef.current && p !== 'ending') return
    setInterviewPhase(p)
  }, [])
  // mock 面接用プレゼンス・ドライバ（1セッション1個）。将来 #21 は別ドライバから同じ setPhase を駆動する（seam）。
  const presenceDriverRef = useRef<MockPresenceDriver | null>(null)

  // Phase I-3: 応募者に表示する AI テキスト（現在質問/締め/システム文言）の「単一更新入口」。
  // mock は questionList の現在質問を供給。将来 #21（Realtime live transcript / response lifecycle）は
  // Realtime callback を UI へ直接配線せず、この setCurrentQuestionText に transcript / 現在質問を渡すだけで
  // 表示を差し替えられる（seam）。今回は Realtime 実配線をしない。
  const setCurrentQuestionText = useCallback((text: string) => setAiSpeechText(text), [])

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

  // Codex P1/P2: マイク切断時の分岐（安定ハンドラ・ref のみ参照）。判定は純関数 micLossActionForMode へ委譲。
  //   modeRef は setMode ラッパで遷移とアトミックに更新されるため、遷移直後の切断でも常に最新 mode を参照する。
  //   'end'（realtime）: ローカル再取得では PC の sender track を張り替えられない（#21）→ 途中終了で終了。
  //   'reconnect'（connecting/mock）: ローカル再接続で復旧できる → 再接続バナー＋ボタンを出す。
  const handleMicLost = useCallback(() => {
    if (micLossActionForMode(modeRef.current) === 'end') {
      endInterviewRef.current?.('自主終了', answeredRef.current)
      return
    }
    setMicLost(true)
  }, [])

  // Phase I-5: トラック切断（デバイス取り外し/占有）を検知する。マイク切断は必須なので再接続案内を出す。
  //            カメラ切断は任意なので小窓を OFF 表示に切り替えるだけ（面接は継続）。
  const attachTrackListeners = useCallback((stream: MediaStream) => {
    const audio = stream.getAudioTracks()[0]
    if (audio) audio.addEventListener('ended', () => handleMicLost(), { once: true })
    const video = stream.getVideoTracks()[0]
    if (video)
      video.addEventListener(
        'ended',
        () => {
          setHasVideoTrack(false)
          setCameraOn(false)
        },
        { once: true },
      )
  }, [handleMicLost])

  // カメラ/マイク取得（start 成功＝interviewId 確定後のみ。403/失敗時は起動しない）。
  // Phase I-5: 二段階取得＝まず {video,audio}、失敗ならマイクのみ {audio}（カメラ任意）。
  //            マイクも取得不可のときだけ mediaFailed（Realtime 不可 → モックへ）。
  useEffect(() => {
    if (!interviewId) return
    // ブロッキングエラーが既に出ているならカメラを起動しない
    if (blockingErrorRef.current) return
    let disposed = false
    async function setupCamera() {
      if (!isGetUserMediaSupported()) {
        setMediaFailed(true)
        return
      }
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        // Codex P2: 破棄後（離脱）/blockingError（開始・質問失敗）後は、フォールバック取得も失敗確定もしない
        //（離脱後やブロッキング画面でマイク許可プロンプトを出さない・cleanup 意図を尊重）。
        if (disposed || blockingErrorRef.current) return
        // カメラを諦めマイクのみで再取得（カメラは任意）
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch {
          // マイクも取得失敗 → Realtime（音声）不可。モックへ落とす合図（破棄後は更新しない）。
          if (disposed || blockingErrorRef.current) return
          setMediaFailed(true)
          return
        }
      }
      // 取得が blockingError/破棄後に解決した場合（権限プロンプト遅延等）は即停止して保持しない
      if (disposed || blockingErrorRef.current) {
        stopStream(stream)
        return
      }
      streamRef.current = stream
      const hasVideo = stream.getVideoTracks().length > 0
      setHasVideoTrack(hasVideo)
      setCameraOn(hasVideo)
      setMicMuted(false)
      attachTrackListeners(stream)
      setHasStream(true)
    }

    setupCamera()

    // デバイス抜き差し（devicechange）でマイクが生存していなければ切断とみなす（ブラウザ差の吸収）。
    // realtime/mock の分岐は handleMicLost に集約（realtime は途中終了・mock は再接続案内）。
    const onDeviceChange = () => {
      if (streamRef.current && !hasLiveTrack(streamRef.current, 'audio')) handleMicLost()
    }
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    md?.addEventListener?.('devicechange', onDeviceChange)

    return () => {
      disposed = true
      md?.removeEventListener?.('devicechange', onDeviceChange)
      stopStream(streamRef.current)
    }
  }, [interviewId, attachTrackListeners, handleMicLost])

  // Phase I-5: マイクのミュート/解除。track.enabled のみ変更しストリームは取り直さない
  //（同一トラックを保持＝将来 Realtime へ送出中の audio track も維持。ミュート中は無音が送られる）。
  const toggleMic = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev
      setTracksEnabled(streamRef.current, 'audio', !next)
      return next
    })
  }, [])

  // Phase I-5: カメラON/OFF。track.enabled のみ変更（取り直さない）。トラック未取得時は無効。
  const toggleCamera = useCallback(() => {
    if (!hasVideoTrack) return
    setCameraOn((prev) => {
      const next = !prev
      setTracksEnabled(streamRef.current, 'video', next)
      return next
    })
  }, [hasVideoTrack])

  // Phase I-5: マイク切断からの再接続（デバイス再取得）。連打/race を防ぎ、旧ストリームを必ず停止してから再取得。
  //            ※ Realtime セッション中のトラック差し替え（renegotiation）は #21。ここではローカル取得のみ復旧する。
  const reacquireMedia = useCallback(async () => {
    if (reacquiringRef.current) return
    reacquiringRef.current = true
    setMicLost(false)
    stopStream(streamRef.current)
    streamRef.current = null
    setHasStream(false)
    // Codex P2: 旧ストリーム停止と同時に UI 上のカメラ状態もリセットする。カメラ小窓/操作ボタンは
    // hasStream ではなく hasVideoTrack/cameraOn から描画するため、リセットしないと停止済みトラックの
    // 凍結映像や「カメラON」表示が再取得 pending 中（失敗時は恒久的に）残る。
    {
      const cleared = cameraFlagsForStream(null) // {false,false}
      setHasVideoTrack(cleared.hasVideoTrack)
      setCameraOn(cleared.cameraOn)
    }
    // 「まだ再取得を続けてよい状態か」の単一判定。unmount / 面接終了処理中 / ブロッキング中は false。
    const canContinue = () =>
      canCommitMediaStream({
        mounted: mountedRef.current,
        ending: endTriggeredRef.current,
        blocking: blockingErrorRef.current,
      })
    try {
      let acquired: MediaStream | null = null
      try {
        acquired = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        // Codex P2-①: フォールバック音声取得を始める前に、まだ続けてよい状態かを必ず再確認する
        //（結合取得 pending 中に離脱/終了/ブロッキングになったら、マイク許可プロンプトを出さず即 return）。
        if (!canContinue()) return
        acquired = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      // Codex P2-②: 保存条件を mounted だけにしない。面接終了処理中/ブロッキング中は（まだ mounted でも）
      // 取得済み stream を即 stop し、streamRef へ保存せず state も更新しない＝カメラ/マイクを再アクティブ化しない
      //（/end がハングしても終了/ブロッキング画面でランプが再点灯しない）。二重 stop は stopStream で安全。
      const stream = commitOrStopStream(acquired, canContinue())
      if (!stream) return
      streamRef.current = stream
      // 成功時のみ、実際に video track がある場合だけカメラ表示/操作を復帰させる（audio only は OFF のまま）。
      const flags = cameraFlagsForStream(stream)
      setHasVideoTrack(flags.hasVideoTrack)
      setCameraOn(flags.cameraOn)
      setMicMuted(false)
      attachTrackListeners(stream)
      setHasStream(true)
      if (videoRef.current && flags.hasVideoTrack) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } catch {
      if (canContinue()) setMicLost(true) // マイクも取れない → 案内継続（離脱/終了/ブロッキング後は更新しない）
    } finally {
      reacquiringRef.current = false
    }
  }, [attachTrackListeners])

  // Phase I-5: iOS/Safari の自動再生ポリシー対策（seam）。ユーザー操作を起点に AI音声(<audio>)の再生を解禁する。
  //            モックでは remote stream が無い（srcObject 未設定）ため実音声は鳴らない＝誤動作しない。
  //            将来 Realtime 実配線時、この解禁済み <audio> にそのまま remote stream が入る。
  const unlockAudioPlayback = useCallback(() => {
    audioUnlockedRef.current = true
    const el = remoteAudioRef.current
    if (el && el.srcObject) {
      el.play()
        .then(() => setAudioBlocked(false))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => unlockAudioPlayback()
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [unlockAudioPlayback])

  // Phase I-5(P2): マウント状態を追跡（unmount で false）。reacquireMedia の非同期取得完了時に参照する。
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Codex P2: modeRef は setMode ラッパで mode 遷移とアトミックに更新する（受動 useEffect 同期は撤去）。
  // endInterviewRef は安定ハンドラ（track ended 等）から最新 handleEndInterview を参照するため毎レンダー同期（state 更新なし）。
  useEffect(() => {
    endInterviewRef.current = handleEndInterview
  })

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
    if (hasStream && hasVideoTrack && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [hasStream, hasVideoTrack])

  // Phase I-2: 写真素材では自然なまばたきを作れない（不自然な加工を避ける）ため、死蔵の blinking は撤去した。
  // “生命感” は InterviewerAvatar の breathing / リング / 波形 / ドットで表現する（状態ソースは interviewPhase）。

  // Phase I-1: mode に応じたプレゼンス基底状態（旧 demoMode 依存の死蔵アニメは撤去）。
  //   connecting: 接続/準備中 → 'connecting'
  //   mock:       進行中の各状態（speaking/listening/thinking）は下のオートプログレッションが
  //               MockPresenceDriver で駆動するため、ここでは触らない。
  //   realtime:   将来 #21 が response lifecycle から setPhase を駆動する（seam）。現状 Realtime は既定OFFで
  //               ここへは基本到達しないが、到達時は idle を基底にしておく（誤演出を出さない）。
  // ※ 終了処理中（ending）は setPhase 側のガードで上書きされない。
  useEffect(() => {
    if (mode === 'connecting') setPhase('connecting')
    else if (mode === 'realtime') setPhase('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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
      setCurrentQuestionText(DEFAULT_QUESTION)
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
      // 追加P2（Codex）: job_id 無しでも /questions を呼ぶ（サーバが既定質問を凍結して返す＝記録に残す）。
      if (!companyId) return

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
          setCurrentQuestionText(finalQuestions[0])
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
    // 追加P2（Codex）: job_id の有無に関わらず /questions を呼ぶ。job_id 無し/pattern 未設定でも
    // サーバが既定質問を凍結して返すため、既定質問面接でも questions_snapshot が記録される。
    if (!interviewId || !companyId) return

    // 一度きりの answeredQuestions+1 は撤去（下のオートプログレッションが進行を管理し二重カウントを防ぐ）。
    const t1 = setTimeout(() => {
      fetchQuestions()
    }, 3000)
    return () => {
      clearTimeout(t1)
    }
    // setCurrentQuestionText は安定（useCallback []）。表示テキスト単一入口として deps に含める。
  }, [jobId, companyId, interviewId, slug, setCurrentQuestionText])

  // モック面接のオートプログレッション＋完了配線。
  // 質問を QUESTION_INTERVAL_MS ごとに1問ずつ提示して answeredQuestions を進め、
  // 最後まで到達したら締めメッセージを表示し handleEndInterview('全質問完了') を1回だけ呼ぶ。
  // → /end に final_status='completed' / end_reason='全質問完了' が渡り applicant は「完了」になる。
  // ※ 音声/OpenAI Realtime/EBCA/複雑な質問ラリーUIは未実装（モックの自動進行のみ）。
  useEffect(() => {
    if (!interviewId || blockingError) return
    if (questionList.length === 0) return
    // Realtime（AI音声面接）中はモック自動進行を起動しない。mode==='mock' のときだけ進める。
    if (mode !== 'mock') return
    if (progressionStartedRef.current) return
    progressionStartedRef.current = true

    const total = questionList.length
    const timers: NodeJS.Timeout[] = []
    // Phase I-1: mock 面接のプレゼンス演出。各質問提示で speaking→listening→thinking を駆動する。
    // 状態変更は setPhase 経由（単一入口）。既存の質問進行/回答数/終了ロジックは変更しない。
    const presence = createMockPresenceDriver({ setPhase, intervalMs: QUESTION_INTERVAL_MS })
    presenceDriverRef.current = presence
    // 各質問を順に提示し回答済み数を進める（モック）
    for (let i = 0; i < total; i++) {
      timers.push(
        setTimeout(() => {
          setCurrentQuestionText(questionList[i])
          setAnsweredQuestions(i + 1)
          presence.onQuestionPresented() // speaking→listening→thinking
        }, i * QUESTION_INTERVAL_MS),
      )
    }
    // 最終質問の後: 締めメッセージ → 全質問完了で終了
    timers.push(
      setTimeout(() => {
        setCurrentQuestionText(CLOSING_MESSAGE)
        setPhase('speaking') // AI が締めの言葉を話す
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
      presence.stop() // cleanup 後にサブ timer が状態を書き換えないようにする
      presenceDriverRef.current = null
    }
    // handleEndInterview は他 effect と同様に依存に含めない（毎レンダー再生成・ref で二重起動防止済み）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, blockingError, questionList, mode])

  // 追加P2（Codex）: questions_snapshot の凍結はサーバ側の唯一の権威に一本化した。
  // /questions が assemble して write-once（IS NULL 条件付きUPDATE）で凍結し、realtime-call も
  // その凍結値を使う。クライアントからの /snapshot 書き込み（改竄面）は撤去した（旧: ここで保存）。

  // AI音声面接（Realtime）を試行。成功→realtime、503/403/409/5xx/接続失敗→mock、401/404→blocking。
  // 既定（フラグOFF/allowlist外/demo）は realtime-call が 503/403 を返すため静かにモックへフォールバック。
  useEffect(() => {
    if (mode !== 'connecting') return
    if (!interviewId || questionList.length === 0) return
    if (realtimeAttemptedRef.current) return
    // メディア取得が未解決（権限プロンプト応答待ち）なら待つ。成功(hasStream) or 失敗(mediaFailed)で前進。
    if (!hasStream && !mediaFailed) return
    realtimeAttemptedRef.current = true

    const token = sessionStorage.getItem(`interview_${slug}_token`)
    const applicant_id = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    const stream = streamRef.current

    let cancelled = false
    // この試行が mode/blocking を確定（settle）したか。確定前に破棄された場合は下の cleanup で
    // guard(realtimeAttemptedRef) を戻し、再setup で再試行できるようにする（'connecting' 固着防止）。
    let settled = false
    // 追加P2（Codex）: 破棄された古い試行を中断するための controller。cleanup で abort し、
    // 古い試行が SDP proxy へ POST（＝ロック取得/有料呼び出し）に進むのを止める（並行二重接続防止）。
    const attemptController = new AbortController()
    ;(async () => {
      // メディア失敗（カメラ/マイク拒否）or 前提欠落 → 既存モックへ（詰まり防止）。
      // setMode は async 内で呼び、effect 本体での同期 setState（cascading render）を避ける。
      if (mediaFailed || !hasStream || !token || !applicant_id || !stream) {
        if (!cancelled) {
          settled = true
          setMode('mock')
        }
        return
      }
      const result = await connectRealtimeCall({
        slug,
        token,
        applicantId: applicant_id,
        interviewId,
        micStream: stream,
        signal: attemptController.signal,
        // 追加P2（Codex）: 言語は初期画面で選ばれ sessionStorage に保存された値を単一の真実として使う
        //（session の state は表示用。接続時の取り違えを避けるため保存値を直接読む）。未保存は state→'ja'。
        language: sessionStorage.getItem(`interview_${slug}_language`) || selectedLanguage,
        callbacks: {
          onRemoteStream: (rs) => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = rs
              // Phase I-5: 自動再生がブロックされたら audioBlocked を立て、ユーザー操作で解禁できるようにする
              //（iOS/Safari 対策）。成功したら解除。mock では onRemoteStream は発火しない＝この分岐に来ない。
              remoteAudioRef.current
                .play()
                .then(() => setAudioBlocked(false))
                .catch(() => setAudioBlocked(true))
            }
            // AI 音声チャンネルが有効化＝AI が最初に挨拶/質問する側 → speaking 表示（3状態アバター）。
            setPhase('speaking')
          },
          onTranscript: (t) => {
            transcriptRef.current.push(t) // メモリ保持（表示/ウォッチドッグ用）
            // AI が一度でも応答したら初回応答ウォッチドッグを解除（セッションは生きている）。
            if (t.role === 'ai') aiRespondedRef.current = true
            // 3状態アバターの turn ベース切替（realtime のみ・mock は presence driver が駆動）:
            //   AI 発話の区切り(role='ai') → 応募者の番＝listening / 応募者発話の区切り(role='applicant') → AI が応答＝speaking。
            //   FINAL イベント由来の近似（精緻なタイミングは R1 で確認）。ending 中は setPhase 側ガードで無視。
            setPhase(t.role === 'ai' ? 'listening' : 'speaking')
          },
          // R1-A: FINAL transcript を server 権威 ingest へ best-effort POST（gate OFF＝TRANSCRIPT_INGEST_ENABLED 未設定なら
          //   route が 503 を返し DB 未到達＝no-op）。speaker/source/seq は server が event_type から導出（client は送らない）。
          onTranscriptEvent: (evt) => {
            if (!interviewId) return
            void sendTranscriptEvent(evt, {
              slug,
              token,
              applicantId: applicant_id,
              interviewId,
              language: sessionStorage.getItem(`interview_${slug}_language`) || selectedLanguage,
            })
          },
          // P2-b / 追加P1: realtime のターン数は answeredQuestions に反映しない。
          // ターン数（follow-up / VAD 分割 / ノイズ）は「回答済み質問数」ではないため、これで完了判定
          // （answeredQuestions >= totalQuestions → completed）を駆動すると、切断/時間切れ/手動終了で
          // 面接を誤って completed 化し applicant/interview status を汚染し得る。
          // → realtime 進捗を発話数で完了判定しない。
          // 追加P1（Codex）: 全質問完了は AI が呼ぶサーバー定義 tool（complete_interview）の
          // 明示シグナルでのみ確定する。このシグナルを受けたときだけ '全質問完了' で正常終了させる
          // （発話数ではなく明示イベント。二重 /end は endTriggeredRef で防止）。
          onInterviewComplete: () => {
            handleEndInterview('全質問完了', totalQuestionsRef.current)
          },
          // 追加P1/P2（Codex）: OpenAI の server error（{type:'error'}）を surface する。多くは recoverable
          // でセッション継続のため終了しない。terminal（session_expired 等・セッション終了）のときだけ、
          // 無音放置を避けるため切断と同様に面接を終了する（realtime 終了は '自主終了'＝途中離脱。
          // 二重 /end は endTriggeredRef で防止）。
          onServerError: (info) => {
            if (info.terminal) handleEndInterview('自主終了', answeredRef.current)
          },
          onDisconnect: () => {
            // P2-a: 確立後の切断は終了処理へ（モックへ戻さず・ハングさせない）。二重終了は endTriggeredRef で防止。
            // 最新の回答数は ref から渡す（クロージャの answeredQuestions は陳腐化し 0/N になり得るため）。
            handleEndInterview('自主終了', answeredRef.current)
          },
        },
      })
      if (cancelled) {
        if (result.ok) result.close()
        return
      }
      settled = true
      if (result.ok) {
        // Codex P2: connecting 中にマイクが切断/再取得され、connectRealtimeCall へ渡した track が
        // 古く（ended、または reacquireMedia で別 stream に差し替え）なっている場合、dead track のまま
        // realtime を確立すると無音のまま応募者の声が届かない。その場合は realtime にせず閉じて mock へ落とす
        //（mock 側の handleMicLost が再接続案内を出す）。恒久的な track 張り替え（replaceTrack）は #21。
        if (streamRef.current !== stream || !hasLiveTrack(stream, 'audio')) {
          result.close()
          setMode('mock')
        } else {
          realtimeRef.current = result
          setMode('realtime')
        }
      } else if (result.reason === 'blocking') {
        setBlockingError('AI音声面接を開始できませんでした。お手数ですが最初からやり直してください。')
      } else {
        setMode('mock') // 503/403/409/5xx/接続失敗 → 既存モックへフォールバック
      }
    })()
    return () => {
      cancelled = true
      // 追加P2（Codex）: 破棄する古い試行を中断する。これをしないと、guard を戻した直後に再setupが
      // 2本目の接続を並行起動し、破棄した1本目が先に 65分DBロック取得＋有料 OpenAI 呼び出しを行い、
      // 生きている2本目が 409 で mock に落ちる（無駄な有料呼び出し＋ロック占有）。abort で SDP proxy への
      // POST を止め、1本目が副作用に進む前に切る。
      attemptController.abort()
      // mode を確定する前に破棄された試行（Strict Mode 二重実行 / in-flight 中の依存変化）では guard を
      // 戻し、再setup で再試行できるようにする（'connecting' 固着防止）。確定済みなら戻さない。
      if (!settled) realtimeAttemptedRef.current = false
    }
    // handleEndInterview は他 effect 同様 deps に含めない（ref で二重起動防止済み）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, interviewId, questionList, hasStream, mediaFailed, slug, totalQuestions])

  // 安全網: メディア取得が解決しない（権限プロンプト放置等）まま connecting が続いても
  // 面接が詰まらないよう、一定時間で必ずモックへ落とす（Realtime 試行が始まっていれば何もしない）。
  useEffect(() => {
    if (mode !== 'connecting') return
    if (!interviewId || questionList.length === 0) return
    const t = setTimeout(() => {
      if (!realtimeAttemptedRef.current) {
        realtimeAttemptedRef.current = true
        setMode('mock')
      }
    }, 10000)
    return () => clearTimeout(t)
  }, [mode, interviewId, questionList, setMode])

  // 追加P1（Codex）: realtime 確立後「初回 AI 応答」ウォッチドッグ（one-shot）。初回 response.create が
  // recoverable error で失敗する等で AI が話し始めないと無音のまま 60分放置され得るため、一定時間で AI 応答が
  // 無ければ realtime を閉じてモックへフォールバックする（応募者は面接を継続できる）。AI 応答が来ていれば何もしない。
  // 【既知の限界（Codex P2）/ follow-up: Issue #21】aiRespondedRef は audio_transcript...done（応答完了）でのみ
  //   立つため、初回応答が 30秒超（長い opening question 等）だと発話中でも false のまま健全な接続を切り得る。
  //   厳密には output delta / response-start イベントで「応答開始」を検知すべき。後続ターン別検知と併せて #21。
  //   realtime は既定 OFF のため本番露出は無く、正確化は本番有効化前に #21 で対応する。
  useEffect(() => {
    if (mode !== 'realtime') return
    const t = setTimeout(() => {
      if (!aiRespondedRef.current) {
        realtimeRef.current?.close()
        realtimeRef.current = null
        setMode('mock')
      }
    }, REALTIME_RESPONSE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [mode, setMode])

  // 追加P2（Codex）: 初期画面で選択され sessionStorage に保存された言語を、session のドロップダウン表示へ
  // 反映する（クライアントのみ・マウント後に読む＝SSR/hydration 安全）。realtime へ渡す値は接続時に
  // sessionStorage から直接読む（上記）ため、これは表示同期用。
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // マウント後に sessionStorage から読む（SSR/hydration 安全）。表示同期のための意図的な setState。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch {
      /* noop */
    }
  }, [slug])

  // 最新の回答数を ref に同期（onDisconnect からの /end で正しい answered_questions を渡すため）。
  useEffect(() => {
    answeredRef.current = answeredQuestions
  }, [answeredQuestions])

  // 全質問数を ref に同期（onInterviewComplete からの /end で正しい total を渡すため）。
  useEffect(() => {
    totalQuestionsRef.current = totalQuestions
  }, [totalQuestions])

  // Phase I-4: 経過秒を ref に同期（陳腐化した handleEndInterview クロージャからも最新値を参照するため）。
  useEffect(() => {
    elapsedRef.current = elapsedSeconds
  }, [elapsedSeconds])

  // Phase I-3: 現在質問が変わったら質問ボックスを先頭へスクロールし直す（前の長文で下までスクロール
  // していても、次の質問が途中から見える状態にしない）。DOM 操作のみ（setState ではない）。
  useEffect(() => {
    if (speechScrollRef.current) speechScrollRef.current.scrollTop = 0
  }, [aiSpeechText])

  // アンマウント時に Realtime 接続を確実に切断（ダングリング課金防止）。
  useEffect(() => {
    return () => {
      realtimeRef.current?.close()
      realtimeRef.current = null
    }
  }, [])

  // 面接タイマー（60分で自動終了）。interviewId 確定（start 成功）後のみ作動させる。
  useEffect(() => {
    if (!interviewId) return
    // ブロッキングエラー中はタイマー（自動終了＝end 送信経路）を作動させない
    if (blockingError) return
    if (elapsedSeconds >= MAX_INTERVIEW_SECONDS && !isEnding) {
      setCurrentQuestionText('お時間となりましたので、面接を終了いたします。結果は後日、お知らせいたします。本日はありがとうございました。')
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

    // Phase I-1: 終了フェーズへ。以後 setPhase は ending 以外を無視し、mock プレゼンス演出も停止する
    // （終了後に状態が動かない）。既存の終了ロジック（下記）は変更しない。
    phaseEndedRef.current = true
    setPhase('ending')
    presenceDriverRef.current?.stop()

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    // Realtime 接続を切断（P2P セッションを残さない）。
    if (realtimeRef.current) {
      realtimeRef.current.close()
      realtimeRef.current = null
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
          // Phase I-4: 正常完了時のみ complete 画面用の実データ summary を保存（新API/DB不要）。
          // interview_id を含めて別面接/stale の誤表示を防ぐ。質問数は totalQuestions（設問数＝Realtime でも
          // 虚偽にならない）。所要時間は elapsedSeconds。complete が interview_id 一致時だけ使用する。
          try {
            // 陳腐化しない ref から最新の経過秒・質問数を取る（stale closure 対策）。
            const summary = buildInterviewSummary({
              interviewId,
              durationSeconds: elapsedRef.current,
              questionCount: totalQuestionsRef.current,
            })
            sessionStorage.setItem(summaryStorageKey(slug), serializeSummary(summary))
          } catch {
            /* noop: summary 保存失敗は完了遷移に影響させない */
          }
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

  // Phase I-3: 質問進捗（X/Y）と listening ガイド。mock は answeredQuestions を現在質問番号として使う
  // （＝提示済み質問数。発話数/transcript数ではない）。realtime は index 不確定のため非表示（誤進捗を出さない）。
  const questionProgress = computeQuestionProgress({
    mode,
    currentIndex: answeredQuestions,
    total: totalQuestions,
  })
  const turnHint = turnHintForPhase(interviewPhase)

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
      {/* Phase I-3: 固定コントロール（カメラ top-3・言語 top-4）と内容が重ならないよう、上部に clearance を確保。
          モバイルは top-align（justify-start）＋pt-24（96px＝カメラ下端≈84pxより下）で、長文質問で内容が伸びても
          カラム先頭（進捗バー）が固定カメラの下から始まる（重ならない）。内容が縦に伸びたら overflow-y-auto で
          スクロール。sm+ は画面に余裕があるので中央寄せ（justify-center）に戻す。下部は固定終了バー用に pb を確保。 */}
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 relative flex flex-col items-center justify-start sm:justify-center px-4 pt-24 pb-24 sm:pt-8 sm:pb-10">
        {/* AI音声（Realtime）の再生先。realtime モード時のみ remote stream が入る（mock 時は無音・非表示）。 */}
        <audio ref={remoteAudioRef} autoPlay className="hidden" />
        {/* 言語選択ドロップダウン（右上） */}
        <div className="fixed top-4 right-4 z-30">
          <select
            value={selectedLanguage}
            onChange={(e) => {
              setSelectedLanguage(e.target.value)
              // session で変更した場合も保存（接続時に sessionStorage を読むため）。
              try {
                sessionStorage.setItem(`interview_${slug}_language`, e.target.value)
              } catch {
                /* noop */
              }
            }}
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

        {/* Phase I-3: 進捗＋経過時間バーは「固定配置」をやめ、中央カラムの通常フロー（アバターの上）に置く。
            → 左右の固定コントロール（カメラ/言語）とも、縦中央寄せのアバターとも重ならない（下記カラム内）。 */}

        {/* 応募者カメラ小窓（左上固定）。Phase I-5: カメラは任意。トラック無し/OFF は「カメラOFF」表示。 */}
        <div className="fixed top-3 left-3 z-10 w-24 h-18 sm:w-32 sm:h-24 md:w-36 md:h-28 rounded-xl overflow-hidden shadow-lg border-2 border-white/30 bg-slate-800">
          {/* カメラON/OFF は track.enabled で切り替え、<video> はマウントし続ける（srcObject を失わず即復帰）。 */}
          {hasVideoTrack && (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover scale-x-[-1] ${cameraOn ? '' : 'hidden'}`}
            />
          )}
          {(!hasVideoTrack || !cameraOn) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <VideoOff className="w-7 h-7 mb-1" aria-hidden="true" />
              <span className="text-xs">カメラOFF</span>
            </div>
          )}
        </div>

        {/* Phase I-5: マイク切断の再接続案内（必須デバイス）。上部中央・面接進行より前面。 */}
        {/* Codex P1: realtime 中は handleMicLost が途中終了させるため micLost は立たない。
            万一の並行状態でもローカル再接続 UI を realtime で出さない（PC 張り替え=#21 は不可のため）。 */}
        {micLost && mode !== 'realtime' && (
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-red-600/95 text-white text-sm py-2 px-4 rounded-lg shadow-lg"
            role="alert"
          >
            <span>マイクが切断されました。再接続してください。</span>
            <button
              type="button"
              onClick={reacquireMedia}
              className="bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 text-xs font-medium transition-colors"
            >
              再接続する
            </button>
          </div>
        )}

        {/* Phase I-5: AI音声の自動再生ブロック時のフォールバック（iOS/Safari）。realtime でのみ発火（mock では出ない）。 */}
        {audioBlocked && (
          <button
            type="button"
            onClick={unlockAudioPlayback}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-full shadow-lg transition-colors"
          >
            <Volume2 className="w-4 h-4" aria-hidden="true" />
            タップして音声を有効にする
          </button>
        )}

        {/* Phase I-5: マイク/カメラ操作（左下固定）。色だけでなくアイコン＋ラベル＋aria-pressed で状態を伝える。 */}
        <div className="fixed bottom-16 left-3 z-20 flex gap-2 md:bottom-6">
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={micMuted}
            aria-label={micMuted ? 'マイクのミュートを解除する' : 'マイクをミュートする'}
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg transition-colors min-h-[40px] ${
              micMuted ? 'bg-red-600 text-white' : 'bg-slate-800/85 text-white hover:bg-slate-700'
            }`}
          >
            {micMuted ? <MicOff className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4" aria-hidden="true" />}
            <span>{micMuted ? 'ミュート中' : 'マイク'}</span>
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            disabled={!hasVideoTrack}
            aria-pressed={hasVideoTrack && !cameraOn}
            aria-label={cameraOn ? 'カメラをオフにする' : 'カメラをオンにする'}
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium shadow-lg transition-colors min-h-[40px] ${
              !hasVideoTrack
                ? 'bg-slate-800/50 text-white/40 cursor-not-allowed'
                : cameraOn
                ? 'bg-slate-800/85 text-white hover:bg-slate-700'
                : 'bg-slate-600 text-white'
            }`}
          >
            {hasVideoTrack && cameraOn ? (
              <Video className="w-4 h-4" aria-hidden="true" />
            ) : (
              <VideoOff className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{!hasVideoTrack ? 'カメラなし' : cameraOn ? 'カメラ' : 'カメラOFF'}</span>
          </button>
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

        {/* AIアバターエリア（画面中央）: Phase I-2 で状態表現をコンポーネント化。状態ソースは interviewPhase。 */}
        <div className="flex flex-col items-center">
          {/* Phase I-3: 進捗＋経過時間バー（通常フロー・アバターの上）。固定配置ではないので
              左右の固定コントロールとも縦中央のアバターとも重ならない。max-w で画面外に出ない。 */}
          <div className="mb-4 flex max-w-[90vw] items-center gap-2 sm:gap-3 rounded-full bg-slate-900/60 px-3 py-1 backdrop-blur-sm">
            {questionProgress.visible && (
              <>
                <span className="text-xs sm:text-sm font-medium text-white/85 tabular-nums">
                  {questionProgress.label}
                </span>
                <span className="text-white/25" aria-hidden="true">
                  |
                </span>
              </>
            )}
            <span className="text-xs sm:text-sm text-white/50 tabular-nums">
              {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:
              {String(elapsedSeconds % 60).padStart(2, '0')} /{' '}
              {String(MAX_INTERVIEW_MINUTES).padStart(2, '0')}:00
            </span>
          </div>

          <InterviewerAvatar phase={interviewPhase} />

          {/* Phase I-3: 現在質問（AI発話テキスト）表示エリア。
              長文でも切れずに読めるよう line-clamp を撤去し、max-height＋縦スクロール＋折り返しにする。
              現在質問は SR にも読ませる（aria-live=polite・質問が変わるたび1回）。状態ラベル（アバター側）とは
              別内容なので重複読み上げにならない。 */}
          <div
            ref={speechScrollRef}
            className={`max-w-lg mx-6 sm:mx-auto mt-6 max-h-40 sm:max-h-48 overflow-y-auto bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-4 text-white text-sm sm:text-base leading-relaxed text-center whitespace-pre-wrap break-words transition-opacity duration-500 ${
              aiSpeechText ? 'opacity-100' : 'opacity-0'
            }`}
            aria-live="polite"
            aria-atomic="true"
          >
            {aiSpeechText}
          </div>

          {/* Phase I-3: listening 時のみ「あなたの番」ガイド（うるさくならないよう控えめ）。
              speaking/thinking/ending 等では出さない（turnHint=null）。状態は既にアバターのラベルで
              SR に伝わるため、ここは aria-hidden（重複読み上げを避ける）。 */}
          <div className="mt-2 h-5 flex items-center justify-center">
            {turnHint && (
              <p className="text-xs sm:text-sm text-green-300/90" aria-hidden="true">
                {turnHint}
              </p>
            )}
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

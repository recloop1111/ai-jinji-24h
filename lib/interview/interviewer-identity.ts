// AIMEN24 標準 AI 面接官（全企業共通の 1 キャラクター）の唯一の SoT（グローバル資産）。
//
// 方針（確定）: 企業ごとにキャラクター/声/話し方をカスタムしない。AIMEN24 全体で共通の AI 面接官に統一する。
//   企業ごとに変わるのは company name / logo / job・questions・interview content のみ。面接官そのもの
//   （表示名・画像・基本 persona・基本トーン・基本 voice 方針）は本ファイルを唯一の入口にして共通化する。
//   → 表示名・画像・voice 方針を変えたいときは「ここ 1 箇所」を変えれば全画面へ反映される。
//
// 画像（正式アセット・5 枚・同一人物 同一 pose・1024x1536・WebP 各~55KB）: neutral / mouth-small / mouth-medium /
//   mouth-large / blink。speaking は「音声レベルに応じて mouth-* を切替」、listening/neutral は neutral を使う。
//   画面側で path を直書きしない（本 SoT / interviewerFrameSrc から取得）。差し替えは public/images/interviewer/ の
//   ファイル置換、または本 SoT の images を変えるだけ（1 箇所）。
//
// persona/tone は会話挙動 SoT（lib/interview/conversation-policy.ts の INTERVIEW_TONE / INTERVIEW_PRINCIPLES）を
// 権威にする（本ファイルは「AI 面接官という 1 資産」の identity を束ねる。挙動の詳細はそちらを唯一の権威にする）。

import { REALTIME_VOICE } from '@/lib/config/openai'
import {
  AVATAR_FULLFRAME_LIPSYNC_ENABLED,
  AVATAR_OVERLAY_LIPSYNC_ENABLED,
  AVATAR_LIPSYNC_MODE,
  type AvatarLipsyncMode,
  type MouthState,
} from '@/lib/interview/avatar/avatar-config'

// 面接官の視覚状態（3 状態）。runtime の presence/state からここへ写像する（interviewer-visual.ts）。
export type InterviewerVisualState = 'neutral' | 'speaking' | 'listening'

export const AI_INTERVIEWER = {
  // 応募者に見せる共通の表示名（企業名とは別。企業名は company.name として別途表示）。
  displayName: 'AI面接官',
  // 正式アセット 5 枚（全企業共通・同一 pose・差し替えは 1 箇所）。
  images: {
    neutral: '/images/interviewer/ai-interviewer-neutral.webp', // 口閉じ・目開き（既定：待機/接続/処理/listening/終了 等）
    mouthSmall: '/images/interviewer/ai-interviewer-mouth-small.webp', // 発話・小
    mouthMedium: '/images/interviewer/ai-interviewer-mouth-medium.webp', // 発話・中
    mouthLarge: '/images/interviewer/ai-interviewer-mouth-large.webp', // 発話・大
    blink: '/images/interviewer/ai-interviewer-blink.webp', // 瞬き（目閉じ・口閉じ）
  },
  // 口だけの透過 overlay（採用方式＝neutral 固定 base に口領域のみ重ねる。顔全体モーフを出さない）。
  //   base=neutral（目/髪/顔/肩/背景は不動）＋ speaking 中のみ mouthState に応じた overlay を絶対座標で重ねる。
  //   透過 WebP・full-canvas 1024x1536（object-fit/position が base と一致＝位置合わせ不要）・各~16KB。
  //   offline で neutral へ登録（生成 AI 不使用）＋楕円 feather マスク（唇/開口のみ・矩形の継ぎ目なし）で作成。
  mouthOverlays: {
    small: '/images/interviewer/ai-interviewer-mouth-small-overlay.webp',
    medium: '/images/interviewer/ai-interviewer-mouth-medium-overlay.webp',
    large: '/images/interviewer/ai-interviewer-mouth-large-overlay.webp',
  },
  // 下顔面（Lower-Face）の color-matched 透過 overlay（採用候補・mouth-only の改善版）。
  //   neutral 固定 base に「人中〜顎・口角外側少し」の下顔面差分を重ねる＝口だけでなく顎/口角/下頬の自然な動きを取り込む。
  //   各 mouth source の下顔面 skin を Lab 統計で neutral へ color-match（口＝唇/歯/口腔は保持）＋ organic 楕円 feather。
  //   透過 WebP・full-canvas 1024x1536（base と同 object-fit/position＝位置合わせ不要）・各~18KB。offline 生成（生成 AI 不使用）。
  lowerFaceOverlays: {
    small: '/images/interviewer/ai-interviewer-lowerface-small-overlay.webp',
    medium: '/images/interviewer/ai-interviewer-lowerface-medium-overlay.webp',
    large: '/images/interviewer/ai-interviewer-lowerface-large-overlay.webp',
  },
  // 目だけ閉じた透過 overlay（独立 Eye Layer）。neutral base の上に重ねる＝口 overlay と独立に瞬きできる。
  //   これで speaking 中に mouth=open ＋ eyes=closed を同時成立（「口だけ動いて目が固定」の不自然さを解消）。
  //   neutral vs blink の diff で目領域を実測（x≈0.486/y≈0.258）し、blink の目領域を neutral へ登録＋楕円 feather で切出し。
  //   透過 WebP・full-canvas 1024x1536・~18KB・offline 生成（生成 AI 不使用）。
  eyesClosedOverlay: '/images/interviewer/ai-interviewer-eyes-closed-overlay.webp',
  imageAlt: 'AI面接官',
  // 共通 voice 方針の SoT（実 voice 名の最終確定は将来 actual でも可。現状は Realtime 既定 voice を単一の真実にする）。
  voicePolicy: REALTIME_VOICE,
  // 短い自己説明（UI 補助テキスト。企業共通・中立）。
  shortDescription: 'AIMEN24 の標準AI面接官です。応募者と自然な音声会話で面接を行います。',
} as const

// 既定画像（後方互換 / 単一画像を要する箇所用）。= neutral。
export const AI_INTERVIEWER_DEFAULT_IMAGE = AI_INTERVIEWER.images.neutral

// preload 用の全アセットリスト（session/practice 開始時にキャッシュへ入れ、切替時の network 待ちを防ぐ）。
export const AI_INTERVIEWER_IMAGE_LIST: readonly string[] = [
  AI_INTERVIEWER.images.neutral,
  AI_INTERVIEWER.images.mouthSmall,
  AI_INTERVIEWER.images.mouthMedium,
  AI_INTERVIEWER.images.mouthLarge,
  AI_INTERVIEWER.images.blink,
]

// 有効な overlay 方式の 3 段階 overlay path（mode に追従）。lowerface（採用候補）or mouth（従来）。
function overlaySetForMode(mode: AvatarLipsyncMode): { small: string; medium: string; large: string } {
  return mode === 'lowerface' ? AI_INTERVIEWER.lowerFaceOverlays : AI_INTERVIEWER.mouthOverlays
}

// preload 用（実際に描画される asset だけ・有効フラグ/モードに追従）。旧 full-frame mouth を通常 Production 経路で無駄に
//   download しないよう、AI_INTERVIEWER_IMAGE_LIST（全 base 5 枚）ではなく「今の描画経路で必要な最小集合」を組む。
//   - base 常時: neutral（既定/listening/非 speaking）。
//   - overlay 方式 ON（採用・既定）: 独立 eye overlay（瞬き）＋ 有効 mode の口 overlay 3 枚を追加（初回 download 待ちを出さない）。
//   - full-frame 実験 ON 時のみ: full-frame blink ＋ mouth 3 枚を追加（false の通常 Production 経路では preload しない＝実験用に温存）。
export const AI_INTERVIEWER_PRELOAD_LIST: readonly string[] = [
  AI_INTERVIEWER.images.neutral,
  ...(AVATAR_OVERLAY_LIPSYNC_ENABLED
    ? (() => {
        const s = overlaySetForMode(AVATAR_LIPSYNC_MODE)
        return [AI_INTERVIEWER.eyesClosedOverlay, s.small, s.medium, s.large]
      })()
    : []),
  ...(AVATAR_FULLFRAME_LIPSYNC_ENABLED
    ? [
        AI_INTERVIEWER.images.blink,
        AI_INTERVIEWER.images.mouthSmall,
        AI_INTERVIEWER.images.mouthMedium,
        AI_INTERVIEWER.images.mouthLarge,
      ]
    : []),
]

// 描画フレーム解決（唯一の写像・画面で直書きしない）。優先順位: blink > speaking の mouth > neutral。
//   - blinking=true は最優先で blink（発話中の瞬きも自然に一瞬入る）。
//   - speaking 中は mouthState（closed→neutral / small・medium・large→対応フレーム）。
//   - listening / neutral / その他は neutral。解析不可（mouthState 未指定/closed）でも neutral へ安全退避。
export function interviewerFrameSrc(input: {
  visualState: InterviewerVisualState
  mouthState?: MouthState
  blinking?: boolean
}): string {
  if (input.blinking) return AI_INTERVIEWER.images.blink
  if (input.visualState === 'speaking') {
    switch (input.mouthState) {
      case 'small':
        return AI_INTERVIEWER.images.mouthSmall
      case 'medium':
        return AI_INTERVIEWER.images.mouthMedium
      case 'large':
        return AI_INTERVIEWER.images.mouthLarge
      default:
        return AI_INTERVIEWER.images.neutral // closed / 未解析
    }
  }
  return AI_INTERVIEWER.images.neutral
}

// overlay 解決（唯一の写像・mode で lowerface/mouth を切替）。speaking かつ mouthState=small/medium/large のときだけ
//   overlay path、それ以外（非 speaking / closed / 未解析）は null（＝overlay を出さない＝base の neutral 口閉じのまま）。
//   render 側は base（interviewerFrameSrc）を常に描き、これが非 null のときだけ透過 overlay を上に重ねる。
//   mode 省略時は SoT の既定 AVATAR_LIPSYNC_MODE（＝Human QA 後に確定する正式方式）を用いる。
export function interviewerOverlaySrc(input: {
  visualState: InterviewerVisualState
  mouthState?: MouthState
  mode?: AvatarLipsyncMode
}): string | null {
  if (input.visualState !== 'speaking') return null
  const set = overlaySetForMode(input.mode ?? AVATAR_LIPSYNC_MODE)
  switch (input.mouthState) {
    case 'small':
      return set.small
    case 'medium':
      return set.medium
    case 'large':
      return set.large
    default:
      return null // closed / 未解析 → overlay なし（base neutral の口閉じ）
  }
}

// 後方互換 / 明示的に mouth-only を要する箇所（QA 比較等）。= interviewerOverlaySrc(mode:'mouth')。
export function interviewerMouthOverlaySrc(input: {
  visualState: InterviewerVisualState
  mouthState?: MouthState
}): string | null {
  return interviewerOverlaySrc({ ...input, mode: 'mouth' })
}

// 明示的に lower-face を要する箇所（QA 比較等）。= interviewerOverlaySrc(mode:'lowerface')。
export function interviewerLowerFaceOverlaySrc(input: {
  visualState: InterviewerVisualState
  mouthState?: MouthState
}): string | null {
  return interviewerOverlaySrc({ ...input, mode: 'lowerface' })
}

export type AiInterviewerIdentity = typeof AI_INTERVIEWER

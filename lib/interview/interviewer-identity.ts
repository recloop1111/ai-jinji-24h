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
import type { MouthState } from '@/lib/interview/avatar/avatar-config'

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

export type AiInterviewerIdentity = typeof AI_INTERVIEWER

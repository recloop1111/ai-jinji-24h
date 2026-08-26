// AIMEN24 標準 AI 面接官（全企業共通の 1 キャラクター）の唯一の SoT（グローバル資産）。
//
// 方針（確定）: 企業ごとにキャラクター/声/話し方をカスタムしない。AIMEN24 全体で共通の AI 面接官に統一する。
//   企業ごとに変わるのは company name / logo / job・questions・interview content のみ。面接官そのもの
//   （表示名・画像・基本 persona・基本トーン・基本 voice 方針）は本ファイルを唯一の入口にして共通化する。
//   → 表示名・画像・voice 方針を変えたいときは「ここ 1 箇所」を変えれば全画面へ反映される。
//
// 画像（正式アセット・3 状態）: neutral / speaking / listening。画面側で path を直書きしない（本 SoT から取得）。
//   最終画像への差し替えは public/images/interviewer/ 配下のファイル置換、または本 SoT の images を変えるだけ。
//   ＝差し替え箇所は 1 箇所に集約。現時点は静止画 3 枚の切替のみ（口パク/animation は未実装・別 scope）。
//
// persona/tone は会話挙動 SoT（lib/interview/conversation-policy.ts の INTERVIEW_TONE / INTERVIEW_PRINCIPLES）を
// 権威にする（本ファイルは「AI 面接官という 1 資産」の identity を束ねる。挙動の詳細はそちらを唯一の権威にする）。

import { REALTIME_VOICE } from '@/lib/config/openai'

// 面接官の視覚状態（3 状態）。runtime の presence/state からここへ写像する（interviewer-visual.ts）。
export type InterviewerVisualState = 'neutral' | 'speaking' | 'listening'

export const AI_INTERVIEWER = {
  // 応募者に見せる共通の表示名（企業名とは別。企業名は company.name として別途表示）。
  displayName: 'AI面接官',
  // 正式 3 状態画像（全企業共通・差し替えは 1 箇所）。Web 配信用に WebP へ最適化済み（同寸法・構図/色/顔不変・各~50KB）。
  images: {
    neutral: '/images/interviewer/ai-interviewer-neutral.webp', // 待機/接続/処理/終了/エラー 等（既定）
    speaking: '/images/interviewer/ai-interviewer-speaking.webp', // AI 発話中
    listening: '/images/interviewer/ai-interviewer-listening.webp', // 応募者の回答待ち/回答中
  },
  imageAlt: 'AI面接官',
  // 共通 voice 方針の SoT（実 voice 名の最終確定は将来 actual でも可。現状は Realtime 既定 voice を単一の真実にする）。
  voicePolicy: REALTIME_VOICE,
  // 短い自己説明（UI 補助テキスト。企業共通・中立）。
  shortDescription: 'AIMEN24 の標準AI面接官です。応募者と自然な音声会話で面接を行います。',
} as const

// 既定画像（後方互換 / 単一画像を要する箇所用）。= neutral。
export const AI_INTERVIEWER_DEFAULT_IMAGE = AI_INTERVIEWER.images.neutral

// preload 用の 3 状態画像リスト（session/practice 開始時にキャッシュへ入れ、切替時の network 待ちを防ぐ）。
export const AI_INTERVIEWER_IMAGE_LIST: readonly string[] = [
  AI_INTERVIEWER.images.neutral,
  AI_INTERVIEWER.images.speaking,
  AI_INTERVIEWER.images.listening,
]

// 視覚状態 → 画像 path（未知/未指定は neutral にフォールバック）。
export function interviewerImageForState(state: InterviewerVisualState | null | undefined): string {
  if (state === 'speaking') return AI_INTERVIEWER.images.speaking
  if (state === 'listening') return AI_INTERVIEWER.images.listening
  return AI_INTERVIEWER.images.neutral
}

export type AiInterviewerIdentity = typeof AI_INTERVIEWER

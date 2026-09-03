// OpenAI Realtime（GA・音声AI面接）の定数。API キーはここには置かない（server env のみ）。
// 実際の有効化は OPENAI_REALTIME_ENABLED='true' ＋ OPENAI_API_KEY（未設定なら 503）。

// GA のエフェメラル・クライアントシークレット発行エンドポイント（realtime-session・代替経路用）。
export const OPENAI_REALTIME_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets'

// GA の WebRTC 通話作成エンドポイント（PR-2 本命: realtime-call が SDP proxy でここへ送る）。
export const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

// モデルは OPENAI_REALTIME_MODEL で切替。許可候補のみ採用（不正値は既定へ）。ここが model 名の唯一の SoT。
// 現行公式（2026-08 docs 監査・docs/OPENAI_SPEC_AUDIT.md）: gpt-realtime / gpt-realtime-mini は deprecated
//   （2027-01-20 shutdown）。現行の Realtime family = gpt-realtime-2.1 / gpt-realtime-2.1-mini / gpt-realtime-2 / 1.5。
// モデル方針（AIMEN24 は 1面接4,000円の従量課金＝AI原価を必要品質の範囲で最小化する）:
//   Primary（R1 標準候補・既定）= gpt-realtime-2.1-mini（WebRTC/function calling 対応・音声 $10/$20 per 1M＝2.1 比 約68%減）。
//   Fallback（高品質）= gpt-realtime-2.1（音声 $32/$64）。R1 の acceptance criteria を満たさない場合のみ fallback。
export const REALTIME_DEFAULT_MODEL = 'gpt-realtime-2.1-mini'
// 高品質 fallback の SoT（品質不足時に切替える先）。
export const REALTIME_FALLBACK_MODEL = 'gpt-realtime-2.1'
export const REALTIME_ALLOWED_MODELS = [
  'gpt-realtime-2.1-mini', // primary（既定）
  'gpt-realtime-2.1', // fallback（高品質）
  'gpt-realtime-2',
  'gpt-realtime-1.5',
  // deprecated（2027-01-20 shutdown）。既存互換のため許可は残すが既定にしない。
  'gpt-realtime',
  'gpt-realtime-mini',
] as const
// deprecated model（監査・警告用途）。default にしない。
export const REALTIME_DEPRECATED_MODELS = ['gpt-realtime', 'gpt-realtime-mini'] as const

// reasoning effort は gpt-realtime-2.1（fallback）系の機能。mini は reasoning effort を明記しないため、
// 既定は未指定（null）＝ session に reasoning を載せない（未サポート model へ送って 400 にしない）。
// 明示したい場合のみ OPENAI_REALTIME_REASONING_EFFORT（2.1 使用時に有効）。
export const REALTIME_REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const

// 音声・文字起こし設定。transcript は評価/結果表示/後追い用（応募者にテキスト入力はさせない）。
export const REALTIME_VOICE = 'alloy'
// input transcription model。whisper-1 は GA でも有効（現状維持）。R1 で切替える場合は
//   OPENAI_REALTIME_TRANSCRIPTION_MODEL で上書き（例 gpt-4o-transcribe / gpt-realtime-whisper）。ハードコード分散しない。
export const REALTIME_TRANSCRIPTION_DEFAULT_MODEL = 'whisper-1'
export const REALTIME_TRANSCRIPTION_ALLOWED_MODELS = [
  'whisper-1',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-realtime-whisper',
] as const
// 後方互換の別名（既存 import 名を壊さない）。
export const REALTIME_TRANSCRIPTION_MODEL = REALTIME_TRANSCRIPTION_DEFAULT_MODEL

// 各質問の深掘り上限（自然な会話のための follow-up 回数）。
export const REALTIME_MAX_FOLLOWUPS = 2

// OpenAI 呼び出しのタイムアウト（ms）。
export const OPENAI_FETCH_TIMEOUT_MS = 10000

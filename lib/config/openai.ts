// OpenAI Realtime（GA・音声AI面接）の定数。API キーはここには置かない（server env のみ）。
// 実際の有効化は OPENAI_REALTIME_ENABLED='true' ＋ OPENAI_API_KEY（未設定なら 503）。

// GA のエフェメラル・クライアントシークレット発行エンドポイント（realtime-session・代替経路用）。
export const OPENAI_REALTIME_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets'

// GA の WebRTC 通話作成エンドポイント（PR-2 本命: realtime-call が SDP proxy でここへ送る）。
export const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

// モデルは OPENAI_REALTIME_MODEL で切替。初期値 gpt-realtime。許可候補のみ採用（不正値は既定へ）。
export const REALTIME_DEFAULT_MODEL = 'gpt-realtime'
export const REALTIME_ALLOWED_MODELS = ['gpt-realtime', 'gpt-realtime-2'] as const

// 音声・文字起こし設定。transcript は評価/結果表示/後追い用（応募者にテキスト入力はさせない）。
export const REALTIME_VOICE = 'alloy'
export const REALTIME_TRANSCRIPTION_MODEL = 'whisper-1'

// 各質問の深掘り上限（自然な会話のための follow-up 回数）。
export const REALTIME_MAX_FOLLOWUPS = 2

// OpenAI 呼び出しのタイムアウト（ms）。
export const OPENAI_FETCH_TIMEOUT_MS = 10000

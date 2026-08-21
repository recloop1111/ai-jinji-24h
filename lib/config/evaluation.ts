// PR-4E-1: AI評価（EBCA writer）用の設定・フィーチャーゲート。Realtime とは別系統（env/gate を混同しない）。
// 本ファイルは env を「読むだけ」。設定・変更はしない。既定は必ず OFF（未設定なら無効）。

// OpenAI Responses API（structured output / json_schema strict）のエンドポイント。
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'

// 評価 fetch のタイムアウト（realtime SDP より長め。評価は数秒〜十数秒想定）。
export const EVALUATION_FETCH_TIMEOUT_MS = 30_000
// レスポンス body の上限（巨大レスポンスでメモリを浪費しない）。
export const EVALUATION_MAX_RESPONSE_BYTES = 200_000
// 出力トークン上限（cost guard）。
export const EVALUATION_MAX_OUTPUT_TOKENS = 2_000
// 入力（system+user）文字数上限（cost guard / 暴走入力防御）。
export const EVALUATION_MAX_INPUT_CHARS = 60_000
// 評価は決定性を重視して低温度。
export const EVALUATION_TEMPERATURE = 0.2

// 評価フィーチャーゲート（Realtime の OPENAI_REALTIME_ENABLED とは独立）。厳密一致のみ有効。未設定は OFF。
export function isEvaluationEnabled(): boolean {
  return process.env.OPENAI_EVALUATION_ENABLED === 'true'
}

// 評価モデルを解決する（ハードコードしない）。明示指定 > env。どちらも無ければ null（呼び出し側で config error）。
export function resolveEvaluationModel(explicit?: string | null): string | null {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  const fromEnv = process.env.OPENAI_EVALUATION_MODEL
  return typeof fromEnv === 'string' && fromEnv.trim() ? fromEnv.trim() : null
}

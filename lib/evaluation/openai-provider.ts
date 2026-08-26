// PR-R1-A: 実 OpenAI 評価 Provider の「adapter 実装」。EvaluationProvider interface 準拠。
//
// 【最重要 / OpenAI actual = 0（本 PR）】
//   * network 部分（fetchImpl）を注入可能にし、unit test では fake transport のみを使う（実 network 0）。
//   * gate OFF / API Key 無しでは構築・呼び出し不可（下記 createOpenAiEvaluationProvider の resolver で fail-closed）。
//   * 返す raw は「信頼できない外部出力」。呼び出し側（service）で必ず P4 validation を通す（生出力を保存しない）。
//   * raw response 全文を DB へ保存しない（呼び出し側 mapping は EBCA 正規化結果のみ保存）。
//   * protected 属性は送らない（prompt は P4 builder が protected 非使用で生成済み。ここでは prompt をそのまま送るだけ）。
//   * model 名 / endpoint は config（lib/config/evaluation）を唯一の SoT にする（複数箇所へハードコードしない）。
//
// R1-B（実接続）では OPENAI_API_KEY / OPENAI_EVALUATION_MODEL / OPENAI_EVALUATION_ENABLED を設定するだけで
// 本 adapter が有効化される。本 PR では gate OFF・key 無しのため実呼び出しは発生しない。

import {
  OPENAI_RESPONSES_URL,
  EVALUATION_FETCH_TIMEOUT_MS,
  EVALUATION_MAX_RESPONSE_BYTES,
  EVALUATION_MAX_OUTPUT_TOKENS,
  EVALUATION_TEMPERATURE,
  EVALUATION_MAX_INPUT_CHARS,
} from '@/lib/config/evaluation'
import type { EvaluationProvider, ProviderResult } from './service'
import type { EvaluationPrompt } from './prompt'

export interface OpenAiEvaluationProviderConfig {
  apiKey: string
  model: string
  requestOptions?: OpenAiEvaluationRequestOptions // temperature/reasoning の出し分け（model capability 由来）
  fetchImpl?: typeof fetch // 注入（未指定は global fetch）。test は fake のみ渡す。
  url?: string // 既定は config SoT。test override 用。
  timeoutMs?: number
  now?: () => number
}

// request オプション（model capability により temperature/reasoning を出し分け）。config SoT から供給。
export interface OpenAiEvaluationRequestOptions {
  temperature?: number | null // null/未指定は temperature を送らない（reasoning model 対応）
  reasoningEffort?: string | null // null/未指定は reasoning を送らない
}

// OpenAI Responses API へ送る request body を構築（純関数・送信しない）。
//   response schema（json_schema strict）は P4 prompt.responseSchema をそのまま使う（軸/フィールドが一致）。
//   temperature は「全 model 共通の必須パラメータ」にしない（reasoning model へ送ると 400 になるため条件付き）。
export function buildOpenAiEvaluationRequest(
  prompt: EvaluationPrompt,
  model: string,
  opts?: OpenAiEvaluationRequestOptions,
): Record<string, unknown> {
  // 入力上限（暴走入力防御 / cost guard）。超過は末尾を切る（保存物ではないので truncate 可）。
  const clip = (s: string) => (s.length > EVALUATION_MAX_INPUT_CHARS ? s.slice(0, EVALUATION_MAX_INPUT_CHARS) : s)
  // temperature: 明示 null は送らない。未指定（undefined）は後方互換で既定値を送る。
  const temperature = opts && 'temperature' in opts ? opts.temperature : EVALUATION_TEMPERATURE
  const body: Record<string, unknown> = {
    model,
    input: [
      { role: 'system', content: clip(prompt.system) },
      { role: 'user', content: clip(prompt.user) },
    ],
    // structured output（strict json_schema）。P4 の responseSchema をそのまま採用。
    text: { format: { type: 'json_schema', name: 'ebca_evaluation', strict: true, schema: prompt.responseSchema } },
    max_output_tokens: EVALUATION_MAX_OUTPUT_TOKENS,
  }
  if (temperature !== null && temperature !== undefined) body.temperature = temperature
  if (opts?.reasoningEffort) body.reasoning = { effort: opts.reasoningEffort }
  return body
}

// Responses API のレスポンスから「モデルが生成した JSON テキスト」を安全に取り出す（複数スキーマ差異に耐性）。
//   取り出せなければ null（呼び出し側 P4 validation が insufficient_data 扱い）。
export function extractResponseJson(body: unknown): unknown {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  // 1) output_text（SDK 便宜フィールド）
  if (typeof o.output_text === 'string') return safeJsonParse(o.output_text)
  // 2) output[].content[].text
  const output = o.output
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as Record<string, unknown>)?.content
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = (c as Record<string, unknown>)?.text
          if (typeof t === 'string') {
            const parsed = safeJsonParse(t)
            if (parsed !== null) return parsed
          }
          // 既に object の場合
          const parsedObj = (c as Record<string, unknown>)?.json
          if (parsedObj && typeof parsedObj === 'object') return parsedObj
        }
      }
    }
  }
  return null
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// EvaluationProvider 実装。evaluate() 実行時のみ network（gate/key は resolver で担保済み）。
export function createOpenAiEvaluationProvider(config: OpenAiEvaluationProviderConfig): EvaluationProvider {
  const fetchImpl = config.fetchImpl ?? fetch
  const url = config.url ?? OPENAI_RESPONSES_URL
  const timeoutMs = config.timeoutMs ?? EVALUATION_FETCH_TIMEOUT_MS

  return {
    async evaluate(prompt: EvaluationPrompt): Promise<ProviderResult> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(buildOpenAiEvaluationRequest(prompt, config.model, config.requestOptions)),
          signal: controller.signal,
        })
        if (!res.ok) {
          // 4xx（設定/入力起因）は permanent（retry しても無駄）。429/5xx は temporary（retry 可）。
          const failure: 'temporary' | 'permanent' =
            res.status === 429 || res.status >= 500 ? 'temporary' : 'permanent'
          return { ok: false, failure }
        }
        // レスポンス body の上限（巨大レスポンス防御）。
        const text = await res.text()
        if (text.length > EVALUATION_MAX_RESPONSE_BYTES) return { ok: false, failure: 'permanent' }
        const body = safeJsonParse(text)
        const raw = extractResponseJson(body)
        // raw は「信頼できない外部出力」。null でも service 側 P4 validation が insufficient_data 扱いにする。
        return { ok: true, raw }
      } catch {
        // timeout / network / abort → temporary（retry 可）。
        return { ok: false, failure: 'temporary' }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

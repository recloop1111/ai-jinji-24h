// PR-4E-1: OpenAI 評価 Provider（dry-run / fetch 注入・実ネットワーク非依存）。
// PR-4B の buildEvaluationPrompt 出力（system/user/responseSchema）を OpenAI Responses API 形式へ変換し、
// PR-4C の EvaluationProvider として差し込める。本 PR は fetch を注入する設計で、実ネットワークは呼ばない
//（constructor/create でも fetch しない）。responseSchema は 4B を唯一の schema source として使う（schema drift 防止）。
//
// 信頼境界: OpenAI の raw response を domain として信用しない。envelope→structured text→JSON parse まで行い、
//   raw（unknown）を返す。domain 検証（PR-4A normalizeEvaluation）は Service 側で行う（raw を直接 DB へ保存しない）。
// PII: prompt/transcript/raw response を log/error に出さない。error は code/status/duration などの非 PII のみ。

import {
  OPENAI_RESPONSES_URL,
  EVALUATION_FETCH_TIMEOUT_MS,
  EVALUATION_MAX_RESPONSE_BYTES,
  EVALUATION_MAX_OUTPUT_TOKENS,
  EVALUATION_MAX_INPUT_CHARS,
  EVALUATION_TEMPERATURE,
  isEvaluationEnabled,
} from '../config/evaluation'
import type { EvaluationPrompt } from './prompt'
import type { EvaluationProvider, ProviderResult } from './service'

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>

// provider レベルの失敗コード（必要以上に細分化しない）。retryable 判定に使う。
export type OpenAIEvalErrorCode =
  | 'GATE_DISABLED'
  | 'CONFIG_ERROR'
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_NETWORK'
  | 'UPSTREAM_4XX'
  | 'UPSTREAM_5XX'
  | 'MALFORMED_RESPONSE'
  | 'OVERSIZED_RESPONSE'
  | 'ABORTED'

// retryable 候補（429 / timeout / network / 5xx）。それ以外は non_retryable。
const RETRYABLE: ReadonlySet<OpenAIEvalErrorCode> = new Set([
  'RATE_LIMIT',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_NETWORK',
  'UPSTREAM_5XX',
])

export type OpenAIEvalOutcome =
  | { ok: true; raw: unknown }
  | { ok: false; code: OpenAIEvalErrorCode; retryable: boolean; status?: number }

function fail(code: OpenAIEvalErrorCode, status?: number): OpenAIEvalOutcome {
  return { ok: false, code, retryable: RETRYABLE.has(code), status }
}

export interface OpenAIEvaluationProviderOptions {
  fetchImpl: FetchImpl // 必須（既定なし＝誤って実ネットワークへ行かない）
  apiKey: string | null // server-only。無ければ network 前に fail-close。
  model: string | null // ハードコードしない（呼び出し側/env から）。
  timeoutMs?: number
  maxResponseBytes?: number
  maxOutputTokens?: number
  maxInputChars?: number
  temperature?: number
  signal?: AbortSignal // caller cancellation（HTTP request.signal 等）。timeout signal と combine。
}

// ── request builder（Responses API・structured output json_schema strict）──────────────────────
// responseSchema は 4B を唯一の source として使う（ここで別 schema を再定義しない＝schema drift 防止）。
export function buildOpenAIEvaluationRequest(
  prompt: EvaluationPrompt,
  cfg: { model: string; maxOutputTokens: number; temperature: number },
): { url: string; body: Record<string, unknown> } {
  return {
    url: OPENAI_RESPONSES_URL,
    body: {
      model: cfg.model,
      // system（固定命令）と candidate/job（データ）を role 分離のまま送る（injection 対策・4B の分離を維持）。
      input: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      // structured output（strict）。schema は 4B responseSchema をそのまま使う。
      text: {
        format: {
          type: 'json_schema',
          name: 'ebca_evaluation',
          strict: true,
          schema: prompt.responseSchema,
        },
      },
      max_output_tokens: cfg.maxOutputTokens,
      temperature: cfg.temperature,
    },
  }
}

// OpenAI Responses envelope から structured output のテキスト（JSON文字列）を抽出。想定外は null。
function extractStructuredText(envelope: unknown): string | null {
  if (!envelope || typeof envelope !== 'object') return null
  const o = envelope as Record<string, unknown>
  if (typeof o.output_text === 'string' && o.output_text.trim()) return o.output_text
  const output = o.output
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== 'object') continue
      const content = (item as Record<string, unknown>).content
      if (!Array.isArray(content)) continue
      for (const c of content) {
        if (c && typeof c === 'object') {
          const cc = c as Record<string, unknown>
          if ((cc.type === 'output_text' || cc.type === 'text') && typeof cc.text === 'string' && cc.text.trim()) {
            return cc.text
          }
        }
      }
    }
  }
  return null
}

// body を上限付きで読む（巨大レスポンス防御）。上限超過は null。
async function readCappedText(res: Response, maxBytes: number): Promise<string | null> {
  const cl = res.headers?.get?.('content-length')
  if (cl && Number(cl) > maxBytes) return null
  let text: string
  try {
    text = await res.text()
  } catch {
    return null
  }
  // 文字数ベースの簡易上限（バイト超過の可能性はあるが、上限判定の目的には十分）。
  if (text.length > maxBytes) return null
  return text
}

// ── 詳細評価（テスト観測用に code を返す）───────────────────────────────────────────────────
export async function evaluateWithOpenAI(prompt: EvaluationPrompt, opts: OpenAIEvaluationProviderOptions): Promise<OpenAIEvalOutcome> {
  // ゲート（未有効なら network へ行かない）。Realtime とは独立。
  if (!isEvaluationEnabled()) return fail('GATE_DISABLED')
  // apiKey / model が無ければ network 前に fail-close（fail-open しない）。
  if (!opts.apiKey) return fail('CONFIG_ERROR')
  if (!opts.model) return fail('CONFIG_ERROR')

  const maxInputChars = opts.maxInputChars ?? EVALUATION_MAX_INPUT_CHARS
  if ((prompt.system?.length ?? 0) + (prompt.user?.length ?? 0) > maxInputChars) return fail('CONFIG_ERROR')

  const { url, body } = buildOpenAIEvaluationRequest(prompt, {
    model: opts.model,
    maxOutputTokens: opts.maxOutputTokens ?? EVALUATION_MAX_OUTPUT_TOKENS,
    temperature: opts.temperature ?? EVALUATION_TEMPERATURE,
  })

  // timeout と caller signal を combine（両方で upstream fetch を停止できる seam）。
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, opts.timeoutMs ?? EVALUATION_FETCH_TIMEOUT_MS)
  const onCallerAbort = () => controller.abort()
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort()
    else opts.signal.addEventListener('abort', onCallerAbort, { once: true })
  }
  const cleanup = () => {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onCallerAbort)
  }

  let res: Response
  try {
    res = await opts.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`, // apiKey は header のみ。log/error に出さない。
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e) {
    cleanup()
    if (timedOut) return fail('UPSTREAM_TIMEOUT')
    if (opts.signal?.aborted || (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError')) {
      return fail('ABORTED')
    }
    return fail('UPSTREAM_NETWORK')
  }
  cleanup()

  const status = typeof res.status === 'number' ? res.status : 0
  if (status === 401 || status === 403) return fail('AUTH_ERROR', status)
  if (status === 429) return fail('RATE_LIMIT', status)
  if (status >= 500) return fail('UPSTREAM_5XX', status)
  if (status < 200 || status >= 300) return fail('UPSTREAM_4XX', status)

  const text = await readCappedText(res, opts.maxResponseBytes ?? EVALUATION_MAX_RESPONSE_BYTES)
  if (text === null) return fail('OVERSIZED_RESPONSE', status)
  if (!text.trim()) return fail('MALFORMED_RESPONSE', status)

  let envelope: unknown
  try {
    envelope = JSON.parse(text)
  } catch {
    return fail('MALFORMED_RESPONSE', status)
  }
  const structured = extractStructuredText(envelope)
  if (structured === null) return fail('MALFORMED_RESPONSE', status)

  let raw: unknown
  try {
    raw = JSON.parse(structured)
  } catch {
    return fail('MALFORMED_RESPONSE', status)
  }
  // raw をそのまま domain として使わない（Service が PR-4A validation を通す）。ここでは raw を返すだけ。
  return { ok: true, raw }
}

// ── PR-4C EvaluationProvider として差し込める factory（constructor/create で network しない）──────────
export interface OpenAIEvaluationProvider extends EvaluationProvider {
  // テスト/観測用の詳細版（code 付き）。本番 Service は evaluate（ProviderResult）を使う。
  evaluateDetailed(prompt: EvaluationPrompt): Promise<OpenAIEvalOutcome>
}

export function createOpenAIEvaluationProvider(opts: OpenAIEvaluationProviderOptions): OpenAIEvaluationProvider {
  // ここでは fetch しない（存在するが未接続）。
  return {
    async evaluateDetailed(prompt: EvaluationPrompt): Promise<OpenAIEvalOutcome> {
      return evaluateWithOpenAI(prompt, opts)
    },
    async evaluate(prompt: EvaluationPrompt): Promise<ProviderResult> {
      const outcome = await evaluateWithOpenAI(prompt, opts)
      if (outcome.ok) return { ok: true, raw: outcome.raw }
      // 4C interface の temporary/permanent へ写像（retryable=temporary / non_retryable=permanent）。
      return { ok: false, failure: outcome.retryable ? 'temporary' : 'permanent' }
    },
  }
}

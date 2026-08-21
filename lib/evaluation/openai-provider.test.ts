import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createOpenAIEvaluationProvider,
  evaluateWithOpenAI,
  buildOpenAIEvaluationRequest,
  type FetchImpl,
} from './openai-provider'
import { buildEvaluationPrompt, buildEvaluationJsonSchema } from './prompt'
import { normalizeEvaluation } from './evaluate'
import type { TranscriptReadItem } from '../interview/transcript-read'

// PR-4E-1: OpenAI 評価 Provider（fake fetch only・実ネットワーク 0）。

const PROMPT = buildEvaluationPrompt({ job: { title: '営業' }, transcriptText: '[面接官] 志望動機は？\n[応募者] 顧客提案を工夫しました。' })

const transcript: TranscriptReadItem[] = [
  { id: '1', speaker: 'interviewer', text: '志望動機は？', seq: 1, final: true, createdAt: null },
  { id: '2', speaker: 'applicant', text: '顧客ごとに提案内容を変えていました。', seq: 2, final: true, createdAt: null },
]

// OpenAI Responses envelope（structured output text を包む）
const envelope = (structuredText: string) => JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: structuredText }] }] })
const validStructured = JSON.stringify({
  schema_version: 'ebca-1',
  overall: { status: 'ok', score: 75, recommendation: 'yes', confidence: 'medium' },
  summary: 'x',
  axes: [{ axis_id: 'communication', score: 16, rank: 'B', confidence: 'high', insufficient_reason: null, evidence: [{ seq: 2, quote: '提案内容を変えていました' }], comment: 'c' }],
  strengths: [],
  concerns: [],
  warnings: [],
})

function fakeResponse(status: number, bodyText: string, headers: Record<string, string> = {}): Response {
  return {
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => bodyText,
  } as unknown as Response
}
const okFetch = (bodyText: string, headers?: Record<string, string>): FetchImpl => async () => fakeResponse(200, bodyText, headers)
// abort されるまで解決しない fetch（timeout / caller abort テスト用）。既に aborted なら即 reject。
const hangingFetch = (): FetchImpl => (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    const abort = () => {
      const e = new Error('aborted')
      ;(e as { name?: string }).name = 'AbortError'
      reject(e)
    }
    if (init.signal?.aborted) {
      abort()
      return
    }
    init.signal?.addEventListener('abort', abort)
  })

const baseOpts = (fetchImpl: FetchImpl, over: Record<string, unknown> = {}) => ({
  fetchImpl,
  apiKey: 'sk-test-key',
  model: 'test-eval-model',
  timeoutMs: 50,
  ...over,
})

beforeEach(() => {
  process.env.OPENAI_EVALUATION_ENABLED = 'true'
})
afterEach(() => {
  delete process.env.OPENAI_EVALUATION_ENABLED
})

describe('evaluateWithOpenAI (fake fetch)', () => {
  it('A: 200 + valid structured output → ok・raw を返す', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(envelope(validStructured))))
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.raw as { axes: { axis_id: string }[] }).axes[0].axis_id).toBe('communication')
  })

  it('B: 200 + malformed JSON → MALFORMED_RESPONSE', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(JSON.stringify({ output_text: 'not json {{' }))))
    expect(r).toMatchObject({ ok: false, code: 'MALFORMED_RESPONSE' })
  })

  it('C: 200 + schema-invalid → ok:true raw（provider は validate しない・Service/4A が degrade）', async () => {
    const invalid = JSON.stringify({ schema_version: 'ebca-1', axes: 'not-array', overall: {} })
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(envelope(invalid))))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const domain = normalizeEvaluation({ raw: r.raw, transcript })
      expect(domain.overall.status).toBe('insufficient_data') // raw を直接信用しない
    }
  })

  it('D: empty response → MALFORMED_RESPONSE', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch('')))
    expect(r).toMatchObject({ ok: false, code: 'MALFORMED_RESPONSE' })
  })

  it('E: oversized response → OVERSIZED_RESPONSE（メモリ浪費しない）', async () => {
    const big = 'x'.repeat(500)
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(big), { maxResponseBytes: 100 }))
    expect(r).toMatchObject({ ok: false, code: 'OVERSIZED_RESPONSE' })
  })
  it('E2: content-length ヘッダで上限超過 → OVERSIZED（body 読まずに弾く）', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch('small', { 'content-length': '999999' }), { maxResponseBytes: 100 }))
    expect(r).toMatchObject({ ok: false, code: 'OVERSIZED_RESPONSE' })
  })

  it('F/G/H/I: HTTP status を分類（4xx/401/429/5xx）', async () => {
    expect(await evaluateWithOpenAI(PROMPT, baseOpts(async () => fakeResponse(400, '')))).toMatchObject({ code: 'UPSTREAM_4XX', retryable: false })
    expect(await evaluateWithOpenAI(PROMPT, baseOpts(async () => fakeResponse(401, '')))).toMatchObject({ code: 'AUTH_ERROR', retryable: false })
    expect(await evaluateWithOpenAI(PROMPT, baseOpts(async () => fakeResponse(429, '')))).toMatchObject({ code: 'RATE_LIMIT', retryable: true })
    expect(await evaluateWithOpenAI(PROMPT, baseOpts(async () => fakeResponse(503, '')))).toMatchObject({ code: 'UPSTREAM_5XX', retryable: true })
  })

  it('J: network reject → UPSTREAM_NETWORK', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(async () => { throw new Error('ECONNRESET') }))
    expect(r).toMatchObject({ ok: false, code: 'UPSTREAM_NETWORK', retryable: true })
  })

  it('K: timeout → UPSTREAM_TIMEOUT（fetch を abort・処理が残らない）', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(hangingFetch(), { timeoutMs: 20 }))
    expect(r).toMatchObject({ ok: false, code: 'UPSTREAM_TIMEOUT', retryable: true })
  })

  it('L: caller abort → ABORTED', async () => {
    const controller = new AbortController()
    controller.abort()
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(hangingFetch(), { signal: controller.signal, timeoutMs: 1000 }))
    expect(r).toMatchObject({ ok: false, code: 'ABORTED', retryable: false })
  })

  it('M: missing API key → CONFIG_ERROR・fetch を呼ばない（network 前に fail-close）', async () => {
    const spy = vi.fn<FetchImpl>(async () => fakeResponse(200, envelope(validStructured)))
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(spy, { apiKey: null }))
    expect(r).toMatchObject({ ok: false, code: 'CONFIG_ERROR' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('N: feature gate OFF → GATE_DISABLED・fetch を呼ばない', async () => {
    delete process.env.OPENAI_EVALUATION_ENABLED
    const spy = vi.fn<FetchImpl>(async () => fakeResponse(200, envelope(validStructured)))
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(spy))
    expect(r).toMatchObject({ ok: false, code: 'GATE_DISABLED' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('O: 想定外 envelope → MALFORMED_RESPONSE', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(JSON.stringify({ unexpected: true }))))
    expect(r).toMatchObject({ ok: false, code: 'MALFORMED_RESPONSE' })
  })

  it('P: protected field 混入 → provider は raw を返し、4A が strip（provider は漏らさない）', async () => {
    const withProtected = JSON.stringify({ ...JSON.parse(validStructured), personality_type: 'INTJ', age: 30 })
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(envelope(withProtected))))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const domain = normalizeEvaluation({ raw: r.raw, transcript })
      expect(domain.warnings).toContain('protected_content_excluded')
      expect(JSON.stringify(domain)).not.toContain('INTJ')
    }
  })

  it('Q: score/evidence invalid → 4A で null 化（raw を権威にしない）', async () => {
    const bad = JSON.stringify({ ...JSON.parse(validStructured), axes: [{ axis_id: 'communication', score: 99, evidence: [{ seq: 99, quote: 'x' }] }] })
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(envelope(bad))))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const domain = normalizeEvaluation({ raw: r.raw, transcript })
      expect(domain.axes[0]?.score ?? null).toBeNull()
    }
  })

  it('R: raw が domain へ直通しない（raw は snake_case、domain は camelCase）', async () => {
    const r = await evaluateWithOpenAI(PROMPT, baseOpts(okFetch(envelope(validStructured))))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.raw as { axes: Record<string, unknown>[] }).axes[0].axis_id).toBe('communication') // raw = snake
      const domain = normalizeEvaluation({ raw: r.raw, transcript })
      expect(domain.axes[0].axisId).toBe('communication') // domain = camel（別物）
    }
  })

  it('S: request に Prompt Builder 出力が正しく入る（system/user/schema/model 分離維持）', async () => {
    let captured: RequestInit | null = null
    const capturing: FetchImpl = async (_url, init) => {
      captured = init
      return fakeResponse(200, envelope(validStructured))
    }
    await evaluateWithOpenAI(PROMPT, baseOpts(capturing))
    const body = JSON.parse((captured!.body as string)) as Record<string, unknown>
    const input = body.input as { role: string; content: string }[]
    expect(input[0]).toEqual({ role: 'system', content: PROMPT.system }) // candidate を system に混ぜない
    expect(input[1]).toEqual({ role: 'user', content: PROMPT.user })
    expect(body.model).toBe('test-eval-model')
    expect((captured!.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test-key')
  })

  it('T: responseSchema は 4B schema と同一（schema drift なし）', () => {
    const { body } = buildOpenAIEvaluationRequest(PROMPT, { model: 'm', maxOutputTokens: 100, temperature: 0.2 })
    const format = (body.text as { format: { schema: unknown } }).format
    expect(format.schema).toBe(PROMPT.responseSchema) // 同一参照
    expect(format.schema).toEqual(buildEvaluationJsonSchema())
  })
})

describe('createOpenAIEvaluationProvider (PR-4C EvaluationProvider 互換・construct で network しない)', () => {
  it('construct 時に fetch しない', () => {
    const spy = vi.fn<FetchImpl>(async () => fakeResponse(200, envelope(validStructured)))
    createOpenAIEvaluationProvider(baseOpts(spy))
    expect(spy).not.toHaveBeenCalled()
  })
  it('evaluate() は ProviderResult へ写像（retryable→temporary / non_retryable→permanent）', async () => {
    const p429 = createOpenAIEvaluationProvider(baseOpts(async () => fakeResponse(429, '')))
    expect(await p429.evaluate(PROMPT)).toEqual({ ok: false, failure: 'temporary' })
    const p401 = createOpenAIEvaluationProvider(baseOpts(async () => fakeResponse(401, '')))
    expect(await p401.evaluate(PROMPT)).toEqual({ ok: false, failure: 'permanent' })
    const pOk = createOpenAIEvaluationProvider(baseOpts(okFetch(envelope(validStructured))))
    const ok = await pOk.evaluate(PROMPT)
    expect(ok.ok).toBe(true)
  })
})

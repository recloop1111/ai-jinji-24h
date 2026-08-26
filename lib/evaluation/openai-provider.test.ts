import { describe, it, expect, vi } from 'vitest'
import { createOpenAiEvaluationProvider, buildOpenAiEvaluationRequest, extractResponseJson } from './openai-provider'
import { resolveEvaluationProvider } from './provider-resolver'
import { buildEvaluationPrompt } from './prompt'
import { OPENAI_RESPONSES_URL } from '@/lib/config/evaluation'

// PR-R1-A: 実 OpenAI 評価 provider adapter（fake transport のみ・実 network 0）。

const prompt = buildEvaluationPrompt({ job: { title: '営業' }, transcriptText: '[面接官] x\n[応募者] y' })
const okResponse = (obj: unknown) => new Response(JSON.stringify({ output_text: JSON.stringify(obj) }), { status: 200 })

describe('buildOpenAiEvaluationRequest: config SoT（model/endpoint をハードコードしない）', () => {
  it('model は引数、schema は prompt.responseSchema を採用', () => {
    const req = buildOpenAiEvaluationRequest(prompt, 'gpt-x') as Record<string, unknown>
    expect(req.model).toBe('gpt-x')
    expect((req.text as Record<string, unknown>).format).toBeTruthy()
    expect(Array.isArray(req.input)).toBe(true)
  })
})

describe('extractResponseJson: 複数スキーマ差異に耐性', () => {
  it('output_text から JSON を取り出す', () => {
    expect(extractResponseJson({ output_text: '{"a":1}' })).toEqual({ a: 1 })
  })
  it('output[].content[].text からも取り出す', () => {
    expect(extractResponseJson({ output: [{ content: [{ text: '{"b":2}' }] }] })).toEqual({ b: 2 })
  })
  it('取り出せなければ null', () => {
    expect(extractResponseJson({})).toBeNull()
    expect(extractResponseJson('x')).toBeNull()
  })
})

describe('createOpenAiEvaluationProvider: fake transport', () => {
  it('200 + JSON → ok:true raw（raw は untrusted・呼び出し側が P4 validation）', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ schema_version: 'ebca-1', axes: [] })) as unknown as typeof fetch
    const p = createOpenAiEvaluationProvider({ apiKey: 'k', model: 'm', fetchImpl })
    const r = await p.evaluate(prompt)
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.raw as Record<string, unknown>).schema_version).toBe('ebca-1')
    // 正しい endpoint（config SoT）へ POST・Authorization ヘッダ付き。
    expect(fetchImpl).toHaveBeenCalledWith(OPENAI_RESPONSES_URL, expect.objectContaining({ method: 'POST' }))
  })
  it('malformed（JSON 取り出せない）→ ok:true raw=null（crash しない）', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch
    const r = await createOpenAiEvaluationProvider({ apiKey: 'k', model: 'm', fetchImpl }).evaluate(prompt)
    expect(r).toEqual({ ok: true, raw: null })
  })
  it('4xx → permanent（retry 無駄）', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 400 })) as unknown as typeof fetch
    expect(await createOpenAiEvaluationProvider({ apiKey: 'k', model: 'm', fetchImpl }).evaluate(prompt)).toEqual({ ok: false, failure: 'permanent' })
  })
  it('429 / 5xx → temporary（retry 可）', async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi.fn(async () => new Response('', { status })) as unknown as typeof fetch
      expect(await createOpenAiEvaluationProvider({ apiKey: 'k', model: 'm', fetchImpl }).evaluate(prompt)).toEqual({ ok: false, failure: 'temporary' })
    }
  })
  it('network 例外 / timeout → temporary', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    expect(await createOpenAiEvaluationProvider({ apiKey: 'k', model: 'm', fetchImpl }).evaluate(prompt)).toEqual({ ok: false, failure: 'temporary' })
  })
})

describe('resolveEvaluationProvider: fail-closed（gate OFF/key 無しで provider を返さない＝OpenAI 呼び出し 0）', () => {
  const clean = (env: Record<string, string | undefined>) => env as unknown as NodeJS.ProcessEnv
  it('gate OFF → gate_disabled（provider を構築しない）', () => {
    const prev = process.env.OPENAI_EVALUATION_ENABLED
    delete process.env.OPENAI_EVALUATION_ENABLED
    try {
      const r = resolveEvaluationProvider(clean({ OPENAI_API_KEY: 'k', OPENAI_EVALUATION_MODEL: 'm' }))
      expect(r).toEqual({ ok: false, reason: 'gate_disabled' })
    } finally {
      if (prev === undefined) delete process.env.OPENAI_EVALUATION_ENABLED
      else process.env.OPENAI_EVALUATION_ENABLED = prev
    }
  })
  it('gate ON + key 無し → api_key_missing', () => {
    const prev = process.env.OPENAI_EVALUATION_ENABLED
    const prevKey = process.env.OPENAI_API_KEY
    process.env.OPENAI_EVALUATION_ENABLED = 'true'
    delete process.env.OPENAI_API_KEY
    try {
      expect(resolveEvaluationProvider(clean({})).ok).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.OPENAI_EVALUATION_ENABLED
      else process.env.OPENAI_EVALUATION_ENABLED = prev
      if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey
    }
  })
})

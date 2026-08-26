import { describe, it, expect } from 'vitest'
import {
  resolveRealtimeModel,
  resolveRealtimeTranscriptionModel,
  resolveRealtimeReasoningEffort,
  buildRealtimeSessionConfig,
  buildClientSecretPayload,
} from './realtime'
import {
  REALTIME_DEFAULT_MODEL,
  REALTIME_FALLBACK_MODEL,
  REALTIME_ALLOWED_MODELS,
  REALTIME_DEPRECATED_MODELS,
  REALTIME_TRANSCRIPTION_DEFAULT_MODEL,
} from '@/lib/config/openai'
import {
  isReasoningEvaluationModel,
  evaluationRequestOptionsForModel,
  EVALUATION_TEMPERATURE,
} from '@/lib/config/evaluation'
import { buildOpenAiEvaluationRequest } from '@/lib/evaluation/openai-provider'
import { buildEvaluationPrompt } from '@/lib/evaluation/prompt'

// PR-R1-B model compatibility patch（現行公式仕様・OpenAI 非接続）。

describe('Realtime model SoT（primary=mini / fallback=2.1・deprecated 互換）', () => {
  it('default(primary) は gpt-realtime-2.1-mini、fallback は gpt-realtime-2.1', () => {
    expect(REALTIME_DEFAULT_MODEL).toBe('gpt-realtime-2.1-mini')
    expect(REALTIME_FALLBACK_MODEL).toBe('gpt-realtime-2.1')
    expect(REALTIME_DEPRECATED_MODELS).toContain('gpt-realtime')
    expect(REALTIME_DEPRECATED_MODELS).not.toContain('gpt-realtime-2.1-mini')
  })
  it('allowlist は mini(primary) / 2.1(fallback) / 2 / 1.5 を含む（実在モデルを削除しない・2.1 を残す）', () => {
    for (const m of ['gpt-realtime-2.1-mini', 'gpt-realtime-2.1', 'gpt-realtime-2', 'gpt-realtime-1.5']) {
      expect(REALTIME_ALLOWED_MODELS as readonly string[]).toContain(m)
    }
  })
})

describe('Realtime session config compatibility', () => {
  it('session に type/audio.input.transcription/turn_detection(server_vad)/audio.output.voice/tools を含む', () => {
    const s = buildRealtimeSessionConfig({ model: 'gpt-realtime-2.1', instructions: 'X' })
    expect(s.type).toBe('realtime')
    const audio = s.audio as Record<string, Record<string, unknown>>
    expect((audio.input.transcription as Record<string, unknown>).model).toBe(REALTIME_TRANSCRIPTION_DEFAULT_MODEL)
    expect((audio.input.turn_detection as Record<string, unknown>).type).toBe('server_vad')
    expect(audio.output.voice).toBeTruthy()
    expect(Array.isArray(s.tools)).toBe(true)
  })
  it('reasoning は未指定なら session に載せない（未検証パラメータを送らない）', () => {
    const s = buildRealtimeSessionConfig({ model: 'gpt-realtime-2.1', instructions: 'X' })
    expect('reasoning' in s).toBe(false)
  })
  it('reasoningEffort 明示時のみ reasoning.effort を載せる', () => {
    const s = buildRealtimeSessionConfig({ model: 'gpt-realtime-2.1', instructions: 'X', reasoningEffort: 'low' })
    expect(s.reasoning).toEqual({ effort: 'low' })
  })
  it('transcriptionModel を上書きできる（whisper-1 → gpt-4o-transcribe）', () => {
    const s = buildRealtimeSessionConfig({ model: 'gpt-realtime-2.1', instructions: 'X', transcriptionModel: 'gpt-4o-transcribe' })
    const audio = s.audio as Record<string, Record<string, unknown>>
    expect((audio.input.transcription as Record<string, unknown>).model).toBe('gpt-4o-transcribe')
  })
  it('buildClientSecretPayload も transcription/reasoning を透過', () => {
    const p = buildClientSecretPayload({ model: 'gpt-realtime-2.1', instructions: 'X', reasoningEffort: 'low' }) as Record<string, Record<string, unknown>>
    expect(p.session.reasoning).toEqual({ effort: 'low' })
  })
})

describe('Realtime env resolvers（許可値のみ・不正は既定/null）', () => {
  it('transcription: 許可候補のみ・不正は既定 whisper-1', () => {
    expect(resolveRealtimeTranscriptionModel({ OPENAI_REALTIME_TRANSCRIPTION_MODEL: 'gpt-realtime-whisper' } as NodeJS.ProcessEnv)).toBe('gpt-realtime-whisper')
    expect(resolveRealtimeTranscriptionModel({ OPENAI_REALTIME_TRANSCRIPTION_MODEL: 'bogus' } as NodeJS.ProcessEnv)).toBe('whisper-1')
    expect(resolveRealtimeTranscriptionModel({} as NodeJS.ProcessEnv)).toBe('whisper-1')
  })
  it('reasoning effort: 許可値のみ・未設定/不正は null（送らない）', () => {
    expect(resolveRealtimeReasoningEffort({ OPENAI_REALTIME_REASONING_EFFORT: 'low' } as NodeJS.ProcessEnv)).toBe('low')
    expect(resolveRealtimeReasoningEffort({ OPENAI_REALTIME_REASONING_EFFORT: 'ultra' } as NodeJS.ProcessEnv)).toBeNull()
    expect(resolveRealtimeReasoningEffort({} as NodeJS.ProcessEnv)).toBeNull()
  })
  it('model 名は resolver 経由のみ（複数箇所ハードコードしない）', () => {
    // 未設定 → primary(mini)。明示 → 尊重（fallback 2.1 へ切替は env のみ）。
    expect(resolveRealtimeModel({} as NodeJS.ProcessEnv)).toBe('gpt-realtime-2.1-mini')
    expect(resolveRealtimeModel({ OPENAI_REALTIME_MODEL: 'gpt-realtime-2.1-mini' } as NodeJS.ProcessEnv)).toBe('gpt-realtime-2.1-mini')
    expect(resolveRealtimeModel({ OPENAI_REALTIME_MODEL: 'gpt-realtime-2.1' } as NodeJS.ProcessEnv)).toBe('gpt-realtime-2.1')
  })
  it('mini の session config が正常（reasoning は既定で載せない＝mini 未サポートへ送らない）', () => {
    const s = buildRealtimeSessionConfig({ model: 'gpt-realtime-2.1-mini', instructions: 'X' })
    expect(s.model).toBe('gpt-realtime-2.1-mini')
    expect('reasoning' in s).toBe(false)
    const audio = s.audio as Record<string, Record<string, unknown>>
    expect((audio.input.transcription as Record<string, unknown>).model).toBe('whisper-1')
  })
})

describe('Evaluation model capability（temperature を全 model 必須にしない）', () => {
  const prompt = buildEvaluationPrompt({ job: { title: '営業' }, transcriptText: '[面接官] x\n[応募者] y' })
  it('reasoning model 判定（gpt-5.6-terra / o系 = reasoning、gpt-4o = 非reasoning）', () => {
    expect(isReasoningEvaluationModel('gpt-5.6-terra')).toBe(true)
    expect(isReasoningEvaluationModel('gpt-5.6-luna')).toBe(true)
    expect(isReasoningEvaluationModel('o3-mini')).toBe(true)
    expect(isReasoningEvaluationModel('gpt-4o')).toBe(false)
    expect(isReasoningEvaluationModel('gpt-4o-2024-08-06')).toBe(false)
  })
  it('gpt-5.6-terra request: temperature を送らない・reasoning は env 明示時のみ', () => {
    const opts = evaluationRequestOptionsForModel('gpt-5.6-terra', { OPENAI_EVALUATION_REASONING_EFFORT: 'medium' } as NodeJS.ProcessEnv)
    expect(opts.temperature).toBeNull()
    expect(opts.reasoningEffort).toBe('medium')
    const req = buildOpenAiEvaluationRequest(prompt, 'gpt-5.6-terra', opts) as Record<string, unknown>
    expect('temperature' in req).toBe(false) // reasoning model へ temperature を送らない（400 回避）
    expect(req.reasoning).toEqual({ effort: 'medium' })
    expect((req.text as Record<string, unknown>).format).toBeTruthy() // structured outputs 維持
  })
  it('gpt-5.6-terra: reasoning env 未設定なら reasoning を送らない（既定に委ねる）', () => {
    const opts = evaluationRequestOptionsForModel('gpt-5.6-terra', {} as NodeJS.ProcessEnv)
    const req = buildOpenAiEvaluationRequest(prompt, 'gpt-5.6-terra', opts) as Record<string, unknown>
    expect('temperature' in req).toBe(false)
    expect('reasoning' in req).toBe(false)
  })
  it('gpt-4o request: temperature=0.2 を送る・reasoning は送らない', () => {
    const opts = evaluationRequestOptionsForModel('gpt-4o')
    expect(opts.temperature).toBe(EVALUATION_TEMPERATURE)
    expect(opts.reasoningEffort).toBeNull()
    const req = buildOpenAiEvaluationRequest(prompt, 'gpt-4o', opts) as Record<string, unknown>
    expect(req.temperature).toBe(EVALUATION_TEMPERATURE)
    expect('reasoning' in req).toBe(false)
  })
  it('後方互換: opts 未指定は既定 temperature を送る（既存挙動維持）', () => {
    const req = buildOpenAiEvaluationRequest(prompt, 'gpt-4o') as Record<string, unknown>
    expect(req.temperature).toBe(EVALUATION_TEMPERATURE)
  })
})

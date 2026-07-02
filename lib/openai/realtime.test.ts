import { describe, it, expect } from 'vitest'
import {
  isRealtimeEnabled,
  resolveRealtimeModel,
  isCompanyAllowed,
  buildRealtimeInstructions,
  buildClientSecretPayload,
} from './realtime'
import { DEMO_COMPANY_ID } from '@/lib/config/demo'

describe('isRealtimeEnabled', () => {
  it("only 'true' enables", () => {
    expect(isRealtimeEnabled({ OPENAI_REALTIME_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true)
  })
  it('unset/other values are disabled (default OFF)', () => {
    for (const v of [undefined, '', 'false', 'TRUE', '1', 'yes']) {
      expect(isRealtimeEnabled({ OPENAI_REALTIME_ENABLED: v } as NodeJS.ProcessEnv)).toBe(false)
    }
  })
})

describe('resolveRealtimeModel', () => {
  it('accepts allowed models', () => {
    expect(resolveRealtimeModel({ OPENAI_REALTIME_MODEL: 'gpt-realtime' } as NodeJS.ProcessEnv)).toBe('gpt-realtime')
    expect(resolveRealtimeModel({ OPENAI_REALTIME_MODEL: 'gpt-realtime-2' } as NodeJS.ProcessEnv)).toBe('gpt-realtime-2')
  })
  it('falls back to default for invalid/unset', () => {
    expect(resolveRealtimeModel({} as NodeJS.ProcessEnv)).toBe('gpt-realtime')
    expect(resolveRealtimeModel({ OPENAI_REALTIME_MODEL: 'gpt-4o-realtime-preview' } as NodeJS.ProcessEnv)).toBe('gpt-realtime')
    expect(resolveRealtimeModel({ OPENAI_REALTIME_MODEL: '  ' } as NodeJS.ProcessEnv)).toBe('gpt-realtime')
  })
})

describe('isCompanyAllowed', () => {
  const env = {} as NodeJS.ProcessEnv
  it('blocks is_demo companies', () => {
    expect(isCompanyAllowed({ id: 'c1', is_demo: true }, env)).toBe(false)
  })
  it('blocks the DEMO/test company id', () => {
    expect(isCompanyAllowed({ id: DEMO_COMPANY_ID, is_demo: false }, env)).toBe(false)
  })
  it('allows a normal company when no allowlist is set', () => {
    expect(isCompanyAllowed({ id: 'c1', is_demo: false }, env)).toBe(true)
  })
  it('with allowlist set, only listed ids pass', () => {
    const e = { OPENAI_REALTIME_COMPANY_IDS: 'c1, c2 ,c3' } as NodeJS.ProcessEnv
    expect(isCompanyAllowed({ id: 'c2', is_demo: false }, e)).toBe(true)
    expect(isCompanyAllowed({ id: 'c9', is_demo: false }, e)).toBe(false)
  })
  it('allowlist never overrides the demo/test block', () => {
    const e = { OPENAI_REALTIME_COMPANY_IDS: DEMO_COMPANY_ID } as NodeJS.ProcessEnv
    expect(isCompanyAllowed({ id: DEMO_COMPANY_ID, is_demo: false }, e)).toBe(false)
  })
})

describe('buildRealtimeInstructions', () => {
  it('returns null for empty/non-array/no valid text', () => {
    expect(buildRealtimeInstructions(null)).toBeNull()
    expect(buildRealtimeInstructions([])).toBeNull()
    expect(buildRealtimeInstructions([{ foo: 'bar' }, { question_text: '   ' }])).toBeNull()
  })
  it('builds a numbered, ordered instruction from snapshot', () => {
    const out = buildRealtimeInstructions([
      { question_text: '自己紹介をお願いします', sort_order: 1 },
      { question_text: '志望動機は？', sort_order: 2 },
    ])
    expect(out).toContain('1. 自己紹介をお願いします')
    expect(out).toContain('2. 志望動機は？')
    // 順序が保たれる（1 が 2 より前）
    expect((out as string).indexOf('1. 自己紹介')).toBeLessThan((out as string).indexOf('2. 志望動機'))
  })
  it('honors language option', () => {
    const out = buildRealtimeInstructions([{ question_text: 'Q' }], { language: 'en' })
    expect(out).toContain('使用言語: en')
  })
})

describe('buildClientSecretPayload (GA shape)', () => {
  it('wraps a realtime session with nested audio config', () => {
    const p = buildClientSecretPayload({ model: 'gpt-realtime', instructions: 'X' }) as {
      session: {
        type: string
        model: string
        instructions: string
        audio: { input: { transcription: { model: string }; turn_detection: { type: string } }; output: { voice: string } }
      }
    }
    expect(p.session.type).toBe('realtime')
    expect(p.session.model).toBe('gpt-realtime')
    expect(p.session.instructions).toBe('X')
    expect(p.session.audio.input.turn_detection.type).toBe('server_vad')
    expect(p.session.audio.output.voice).toBeTruthy()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { createProductionEvaluationDependencies } from './production-dependencies'
import type { FetchImpl } from './openai-provider'

// PR-4E-3: 本番依存 factory は create で副作用（DB/network）を起こさない。
describe('createProductionEvaluationDependencies (副作用なし)', () => {
  it('create で DB(from) も fetch も呼ばない', () => {
    const fromSpy = vi.fn()
    const fetchSpy = vi.fn<FetchImpl>(async () => new Response('{}'))
    const deps = createProductionEvaluationDependencies({
      client: { from: fromSpy } as unknown,
      fetchImpl: fetchSpy,
      apiKey: 'sk-test',
      model: 'test-model',
    })
    // create しただけでは DB/network に到達しない
    expect(fromSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    // 依存が揃っている（method 実行時のみ副作用）
    expect(typeof deps.gate).toBe('function')
    expect(deps.service).toBeTruthy()
    expect(deps.lock).toBeTruthy()
    expect(deps.repo).toBeTruthy()
    expect(typeof deps.loadInterviewContext).toBe('function')
    expect(typeof deps.loadTranscriptRows).toBe('function')
  })

  it('apiKey / model が null でも create は落ちない（実行時に fail-close）', () => {
    const fromSpy = vi.fn()
    const deps = createProductionEvaluationDependencies({
      client: { from: fromSpy } as unknown,
      fetchImpl: (async () => new Response('{}')) as FetchImpl,
      apiKey: null,
      model: null,
    })
    expect(deps.service).toBeTruthy()
    expect(fromSpy).not.toHaveBeenCalled()
  })
})

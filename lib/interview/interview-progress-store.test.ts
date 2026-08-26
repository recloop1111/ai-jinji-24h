import { describe, it, expect } from 'vitest'
import { createSupabaseInterviewProgressStore, type ProgressDbClient, type ProgressDbQuery } from './interview-progress-store'
import { initInterviewProgress, applyProgressEvent } from './interview-progress'

// PR-R1-A: interview_progress の Supabase store（version 楽観ロック）を fake client で固定（実 DB なし）。

function fakeClient(onLoad: () => { data: unknown; error: unknown }, onSave: (row: Record<string, unknown>) => { data: unknown; error: unknown }): ProgressDbClient {
  return {
    from: () => {
      let mode: 'load' | 'save' = 'load'
      let savedRow: Record<string, unknown> = {}
      const q: ProgressDbQuery = {
        select: () => q,
        update: (row) => {
          mode = 'save'
          savedRow = row
          return q
        },
        eq: () => q,
        maybeSingle: async () => (mode === 'save' ? onSave(savedRow) : onLoad()),
      }
      return q
    },
  }
}

describe('createSupabaseInterviewProgressStore', () => {
  it('load: interview_progress jsonb を restoreProgress で復元', async () => {
    const state = applyProgressEvent(initInterviewProgress('iv-1', 3), { type: 'ASK_CURRENT' }).state
    const store = createSupabaseInterviewProgressStore(fakeClient(() => ({ data: { interview_progress: state }, error: null }), () => ({ data: null, error: null })))
    const loaded = await store.load('iv-1')
    expect(loaded?.currentIndex).toBe(1)
  })
  it('load: 列 null/malformed → null（crash しない）', async () => {
    const store = createSupabaseInterviewProgressStore(fakeClient(() => ({ data: { interview_progress: null }, error: null }), () => ({ data: null, error: null })))
    expect(await store.load('iv-1')).toBeNull()
  })
  it('save: RETURNING 1 行 → saved（CAS 一致）', async () => {
    const state = initInterviewProgress('iv-1', 3)
    const store = createSupabaseInterviewProgressStore(fakeClient(() => ({ data: null, error: null }), () => ({ data: { id: 'iv-1' }, error: null })))
    expect(await store.save(state, 0)).toBe('saved')
  })
  it('save: RETURNING 0 行 → conflict（version 不一致）', async () => {
    const state = initInterviewProgress('iv-1', 3)
    const store = createSupabaseInterviewProgressStore(fakeClient(() => ({ data: null, error: null }), () => ({ data: null, error: null })))
    expect(await store.save(state, 5)).toBe('conflict')
  })
  it('save: error → error', async () => {
    const state = initInterviewProgress('iv-1', 3)
    const store = createSupabaseInterviewProgressStore(fakeClient(() => ({ data: null, error: null }), () => ({ data: null, error: { code: 'x' } })))
    expect(await store.save(state, 0)).toBe('error')
  })
})

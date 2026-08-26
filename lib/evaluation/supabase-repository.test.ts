import { describe, it, expect, vi } from 'vitest'
import { createSupabaseEvaluationRepository, type EvaluationDbClient, type EvaluationDbResult } from './supabase-repository'
import type { InterviewResultRecord } from './mapping'

// PR-4E-2: Production repository を fake Supabase client で単体テスト（実 DB access = 0）。
function fakeClient(handlers: {
  maybeSingle?: () => EvaluationDbResult
  single?: () => EvaluationDbResult
  onUpsert?: (row: Record<string, unknown>, opts: { onConflict: string }) => void
}): { client: EvaluationDbClient; fromSpy: ReturnType<typeof vi.fn> } {
  const fromSpy = vi.fn(() => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = async () => handlers.maybeSingle?.() ?? { data: null, error: null }
    q.upsert = (row: Record<string, unknown>, opts: { onConflict: string }) => {
      handlers.onUpsert?.(row, opts)
      return q
    }
    q.single = async () => handlers.single?.() ?? { data: { id: 'row-1' }, error: null }
    return q as unknown as ReturnType<EvaluationDbClient['from']>
  })
  return { client: { from: fromSpy } as unknown as EvaluationDbClient, fromSpy }
}

const record = (): InterviewResultRecord => ({
  interview_id: 'iv-1',
  evaluation_axes: [{ axis: 'communication', score: 16 }],
  total_score: 75,
  detail_json: { schema_version: 'ebca-1', evaluation_meta: { transcript_hash: 'h1' } },
})

describe('createSupabaseEvaluationRepository (fake client・no import/create DB access)', () => {
  it('create しても DB access しない（method 実行時のみ from を呼ぶ）', () => {
    const { client, fromSpy } = fakeClient({})
    createSupabaseEvaluationRepository(client)
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('findByInterviewAndHash: hash 一致 → record', async () => {
    const { client } = fakeClient({
      maybeSingle: () => ({ data: { id: 'r1', interview_id: 'iv-1', evaluation_axes: [], total_score: 70, detail_json: { evaluation_meta: { transcript_hash: 'h1' } } }, error: null }),
    })
    const repo = createSupabaseEvaluationRepository(client)
    const r = await repo.findByInterviewAndHash('iv-1', 'h1')
    expect(r?.id).toBe('r1')
    expect(r?.record.total_score).toBe(70)
  })

  it('findByInterviewAndHash: hash 不一致 → null（再評価可）', async () => {
    const { client } = fakeClient({
      maybeSingle: () => ({ data: { id: 'r1', detail_json: { evaluation_meta: { transcript_hash: 'OLD' } } }, error: null }),
    })
    const repo = createSupabaseEvaluationRepository(client)
    expect(await repo.findByInterviewAndHash('iv-1', 'h1')).toBeNull()
  })

  it('findByInterviewAndHash: 行なし → null / read error → throw(code のみ)', async () => {
    const none = createSupabaseEvaluationRepository(fakeClient({ maybeSingle: () => ({ data: null, error: null }) }).client)
    expect(await none.findByInterviewAndHash('iv-1', 'h1')).toBeNull()
    const err = createSupabaseEvaluationRepository(fakeClient({ maybeSingle: () => ({ data: null, error: { message: 'boom' } }) }).client)
    await expect(err.findByInterviewAndHash('iv-1', 'h1')).rejects.toThrow('EVAL_REPO_READ_ERROR')
  })

  it('save: 既存列のみ onConflict:interview_id で upsert（legacy 列を書かない）', async () => {
    let upserted: Record<string, unknown> | null = null
    let conflict = ''
    const { client } = fakeClient({
      onUpsert: (row, opts) => {
        upserted = row
        conflict = opts.onConflict
      },
      single: () => ({ data: { id: 'row-9' }, error: null }),
    })
    const repo = createSupabaseEvaluationRepository(client)
    const r = await repo.save('iv-1', 'h1', record())
    expect(r.id).toBe('row-9')
    expect(conflict).toBe('interview_id')
    expect(Object.keys(upserted!).sort()).toEqual(['detail_json', 'evaluation_axes', 'interview_id', 'total_score', 'updated_at'])
    // legacy 列を書かない
    for (const legacy of ['personality_type', 'culture_fit_score', 'big_five_scores', 'strengths', 'improvement_points', 'summary_text', 'feedback_text']) {
      expect(upserted!).not.toHaveProperty(legacy)
    }
  })

  it('save: write error → throw(code のみ・本文/PII なし)', async () => {
    const { client } = fakeClient({ single: () => ({ data: null, error: { message: 'db down' } }) })
    const repo = createSupabaseEvaluationRepository(client)
    await expect(repo.save('iv-1', 'h1', record())).rejects.toThrow('EVAL_REPO_WRITE_ERROR')
  })
})

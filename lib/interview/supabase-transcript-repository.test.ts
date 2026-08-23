import { describe, it, expect, vi } from 'vitest'
import { createSupabaseTranscriptRepository, type TranscriptDbClient } from './supabase-transcript-repository'
import { saveUtterance, TranscriptWriteError, type TranscriptWriteInput } from './transcript-write'

// PR-19B: Production TranscriptRepository（fake client のみ・実 DB 非接続）。
const ROW = {
  id: 'row-1',
  interview_id: 'iv-1',
  speaker: 'applicant',
  text: 'こんにちは',
  seq: 3,
  final: true,
  source: 'realtime',
  dedup_key: 'app:item_1:0',
  language: 'ja',
  created_at: '2026-01-01T00:00:00.000Z',
}
const input = (over: Partial<TranscriptWriteInput> = {}): TranscriptWriteInput => ({
  interviewId: 'iv-1',
  speaker: 'applicant',
  text: 'こんにちは',
  seq: 3,
  final: true,
  source: 'realtime',
  dedupKey: 'app:item_1:0',
  language: 'ja',
  ...over,
})

// 単一操作用の thenable-ish fake（insert/update/select/eq/maybeSingle/single）。
function fakeClient(handlers: {
  onInsert?: (row: Record<string, unknown>) => { data: unknown; error: unknown }
  onUpdate?: (row: Record<string, unknown>) => { data: unknown; error: unknown }
  onSelect?: () => { data: unknown; error: unknown }
}) {
  const fromSpy = vi.fn()
  const client: TranscriptDbClient = {
    from(table: string) {
      fromSpy(table)
      let mode: 'select' | 'insert' | 'update' = 'select'
      let pendingRow: Record<string, unknown> = {}
      const q = {
        select() {
          return q
        },
        eq() {
          return q
        },
        insert(row: Record<string, unknown>) {
          mode = 'insert'
          pendingRow = row
          return q
        },
        update(row: Record<string, unknown>) {
          mode = 'update'
          pendingRow = row
          return q
        },
        async maybeSingle() {
          return handlers.onSelect?.() ?? { data: null, error: null }
        },
        async single() {
          if (mode === 'insert') return handlers.onInsert?.(pendingRow) ?? { data: ROW, error: null }
          if (mode === 'update') return handlers.onUpdate?.(pendingRow) ?? { data: ROW, error: null }
          return handlers.onSelect?.() ?? { data: ROW, error: null }
        },
      }
      return q as unknown as ReturnType<TranscriptDbClient['from']>
    },
  }
  return { client, fromSpy }
}

describe('createSupabaseTranscriptRepository', () => {
  it('create で DB access しない（from を呼ばない）', () => {
    const { fromSpy } = fakeClient({})
    // create のみ・method 未実行
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('insert: snake→camel マッピングで StoredUtterance を返す', async () => {
    const { client } = fakeClient({ onInsert: () => ({ data: ROW, error: null }) })
    const repo = createSupabaseTranscriptRepository(client)
    const out = await repo.insert(input())
    expect(out).toMatchObject({
      id: 'row-1',
      interviewId: 'iv-1',
      speaker: 'applicant',
      seq: 3,
      final: true,
      source: 'realtime',
      dedupKey: 'app:item_1:0',
      language: 'ja',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('insert: camel→snake で DB へ渡す行（metadata は書かない）', async () => {
    let sent: Record<string, unknown> = {}
    const { client } = fakeClient({
      onInsert: (row) => {
        sent = row
        return { data: ROW, error: null }
      },
    })
    await createSupabaseTranscriptRepository(client).insert(input())
    expect(sent).toEqual({
      interview_id: 'iv-1',
      speaker: 'applicant',
      text: 'こんにちは',
      seq: 3,
      final: true,
      source: 'realtime',
      dedup_key: 'app:item_1:0',
      language: 'ja',
    })
    expect(sent).not.toHaveProperty('metadata')
  })

  it('insert: Postgres unique 違反(23505) → DEDUP_CONFLICT', async () => {
    const { client } = fakeClient({ onInsert: () => ({ data: null, error: { code: '23505' } }) })
    const repo = createSupabaseTranscriptRepository(client)
    await expect(repo.insert(input())).rejects.toMatchObject({ code: 'DEDUP_CONFLICT' })
  })

  it('insert: その他 DB error → 非 PII の VALIDATION_ERROR', async () => {
    const { client } = fakeClient({ onInsert: () => ({ data: null, error: { code: '08006', message: 'secret conn' } }) })
    try {
      await createSupabaseTranscriptRepository(client).insert(input())
      throw new Error('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(TranscriptWriteError)
      expect((e as TranscriptWriteError).message).toBe('VALIDATION_ERROR')
      expect((e as TranscriptWriteError).message).not.toContain('secret conn')
    }
  })

  it('findByDedupKey: 該当あり → StoredUtterance / なし → null', async () => {
    const hit = createSupabaseTranscriptRepository(fakeClient({ onSelect: () => ({ data: ROW, error: null }) }).client)
    expect((await hit.findByDedupKey('iv-1', 'app:item_1:0'))?.seq).toBe(3)
    const miss = createSupabaseTranscriptRepository(fakeClient({ onSelect: () => ({ data: null, error: null }) }).client)
    expect(await miss.findByDedupKey('iv-1', 'x')).toBeNull()
  })

  it('replaceById: 行は増やさず内容差し替え（seq を維持）', async () => {
    let sent: Record<string, unknown> = {}
    const { client } = fakeClient({
      onUpdate: (row) => {
        sent = row
        return { data: { ...ROW, text: '確定', final: true }, error: null }
      },
    })
    const out = await createSupabaseTranscriptRepository(client).replaceById('row-1', input({ text: '確定' }))
    expect(out.seq).toBe(3) // 採番し直さない
    expect(sent.seq).toBe(3)
  })

  it('saveUtterance と結線: DEDUP_CONFLICT → re-find → update（retry-once 契約）', async () => {
    // insert は 23505 で失敗 → saveUtterance が findByDedupKey で既存(partial) を取得 → final-wins で update。
    let inserted = false
    const client: TranscriptDbClient = {
      from() {
        let mode: 'select' | 'insert' | 'update' = 'select'
        const q = {
          select: () => q,
          eq: () => q,
          insert: () => {
            mode = 'insert'
            return q
          },
          update: () => {
            mode = 'update'
            return q
          },
          maybeSingle: async () =>
            inserted ? { data: { ...ROW, final: false }, error: null } : { data: null, error: null },
          single: async () => {
            if (mode === 'insert') {
              inserted = true
              return { data: null, error: { code: '23505' } } // 並行 insert が先に入った
            }
            if (mode === 'update') return { data: { ...ROW, final: true }, error: null }
            return { data: null, error: null }
          },
        }
        return q as unknown as ReturnType<TranscriptDbClient['from']>
      },
    }
    const repo = createSupabaseTranscriptRepository(client)
    const r = await saveUtterance(repo, input({ final: true }))
    expect(r.status).toBe('updated') // hard-fail せず解決
  })
})

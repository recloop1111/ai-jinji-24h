import { describe, it, expect, vi } from 'vitest'
import {
  createTranscriptSeqAllocator,
  createRawSqlAtomicSeqIncrement,
  InMemoryAtomicSeqIncrement,
  SeqAllocError,
  ATOMIC_TRANSCRIPT_SEQ_SQL,
  type AtomicSeqIncrement,
} from './transcript-seq-allocator'
import { saveUtterance, InMemoryTranscriptRepository, type TranscriptWriteInput } from './transcript-write'

// PR-19B: seq allocator（synthetic/fake のみ・実 DB 非接続）。
const fakeAlloc = (ids?: string[]) => {
  const inc = new InMemoryAtomicSeqIncrement(ids)
  return { alloc: createTranscriptSeqAllocator(inc.fn), inc }
}

describe('createTranscriptSeqAllocator', () => {
  it('1: first allocation = 1（off-by-one: DEFAULT 0 + post-increment）', async () => {
    const { alloc } = fakeAlloc()
    expect(await alloc.next('iv-1')).toBe(1)
  })

  it('2: sequential allocation = 1,2,3', async () => {
    const { alloc } = fakeAlloc()
    expect([await alloc.next('iv-1'), await alloc.next('iv-1'), await alloc.next('iv-1')]).toEqual([1, 2, 3])
  })

  it('3: interview A / B は独立（互いの seq に影響しない）', async () => {
    const { alloc } = fakeAlloc()
    expect(await alloc.next('A')).toBe(1)
    expect(await alloc.next('B')).toBe(1)
    expect(await alloc.next('A')).toBe(2)
    expect(await alloc.next('B')).toBe(2)
  })

  it('4: allocator は increment の返り値をそのまま使う（app 側で +1 しない・正しい interviewId を渡す）', async () => {
    const spy = vi.fn<AtomicSeqIncrement>(async () => ({ seq: 7, error: null }))
    const alloc = createTranscriptSeqAllocator(spy)
    expect(await alloc.next('iv-x')).toBe(7)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('iv-x')
  })

  it('5: missing interview（RETURNING 0行）→ INTERVIEW_NOT_FOUND', async () => {
    const { alloc } = fakeAlloc(['exists'])
    await expect(alloc.next('missing')).rejects.toMatchObject({ code: 'INTERVIEW_NOT_FOUND' })
  })

  it('6: DB error → SEQ_ALLOC_DB_ERROR（fail-closed）', async () => {
    const alloc = createTranscriptSeqAllocator(async () => ({ seq: null, error: { code: '08006' } }))
    await expect(alloc.next('iv-1')).rejects.toMatchObject({ code: 'SEQ_ALLOC_DB_ERROR' })
  })

  it('7: malformed returned seq（非整数 1.5）→ SEQ_ALLOC_MALFORMED', async () => {
    const alloc = createTranscriptSeqAllocator(async () => ({ seq: 1.5, error: null }))
    await expect(alloc.next('iv-1')).rejects.toMatchObject({ code: 'SEQ_ALLOC_MALFORMED' })
  })

  it('8: seq <= 0 → reject（SEQ_ALLOC_MALFORMED）', async () => {
    const zero = createTranscriptSeqAllocator(async () => ({ seq: 0, error: null }))
    await expect(zero.next('iv-1')).rejects.toMatchObject({ code: 'SEQ_ALLOC_MALFORMED' })
    const neg = createTranscriptSeqAllocator(async () => ({ seq: -3, error: null }))
    await expect(neg.next('iv-1')).rejects.toMatchObject({ code: 'SEQ_ALLOC_MALFORMED' })
  })

  it('9: non-integer（NaN / 文字列偽装）→ reject', async () => {
    const nan = createTranscriptSeqAllocator(async () => ({ seq: NaN, error: null }))
    await expect(nan.next('iv-1')).rejects.toMatchObject({ code: 'SEQ_ALLOC_MALFORMED' })
    const str = createTranscriptSeqAllocator(async () => ({ seq: '5' as unknown as number, error: null }))
    await expect(str.next('iv-1')).rejects.toMatchObject({ code: 'SEQ_ALLOC_MALFORMED' })
  })

  it('10: 空 interviewId → INVALID_INTERVIEW_ID（DB を呼ぶ前に弾く）', async () => {
    const spy = vi.fn<AtomicSeqIncrement>(async () => ({ seq: 1, error: null }))
    const alloc = createTranscriptSeqAllocator(spy)
    await expect(alloc.next('')).rejects.toMatchObject({ code: 'INVALID_INTERVIEW_ID' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('11: duplicate シナリオで seq gap を許容（allocator は gap を埋めない）', async () => {
    // 10,11 を採番 → dedup で 11 の行が insert されず gap になっても allocator は関与しない。次は 12。
    const { alloc } = fakeAlloc()
    const seqs: number[] = []
    for (let i = 0; i < 11; i++) seqs.push(await alloc.next('iv-1'))
    expect(seqs[9]).toBe(10)
    expect(seqs[10]).toBe(11)
    expect(await alloc.next('iv-1')).toBe(12) // 11 が捨てられても再利用/backfill しない
  })

  it('14: 並行 10 request → seq は 1..10（重複なし・app 層で連番）', async () => {
    const { alloc } = fakeAlloc()
    const results = await Promise.all(Array.from({ length: 10 }, () => alloc.next('iv-1')))
    expect([...results].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(new Set(results).size).toBe(10) // 重複ゼロ
  })

  it('16: 別 interview の並行 request → それぞれ独立に 1 から', async () => {
    const { alloc } = fakeAlloc()
    const [a, b] = await Promise.all([alloc.next('A'), alloc.next('B')])
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  it('17: error message は非 PII code のみ（interviewId/本文を含まない）', async () => {
    const alloc = createTranscriptSeqAllocator(async () => ({ seq: null, error: { code: 'x' } }))
    try {
      await alloc.next('interview-uuid-secret')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(SeqAllocError)
      expect((e as SeqAllocError).message).toBe('SEQ_ALLOC_DB_ERROR')
      expect((e as SeqAllocError).message).not.toContain('interview-uuid-secret')
    }
  })
})

describe('12: import/create で DB access 0', () => {
  it('createTranscriptSeqAllocator は create しただけでは increment を呼ばない', () => {
    const spy = vi.fn<AtomicSeqIncrement>(async () => ({ seq: 1, error: null }))
    createTranscriptSeqAllocator(spy)
    expect(spy).not.toHaveBeenCalled()
  })
  it('createRawSqlAtomicSeqIncrement は create しただけでは runner を呼ばない', () => {
    const run = vi.fn(async () => ({ rows: [] as Array<Record<string, unknown>> }))
    createRawSqlAtomicSeqIncrement({ run })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('createRawSqlAtomicSeqIncrement（単一文契約・executor 注入）', () => {
  it('固定 SQL + [interviewId] で実行し、RETURNING の値を返す', async () => {
    const run = vi.fn(async () => ({ rows: [{ next_transcript_seq: 1 }] }))
    const inc = createRawSqlAtomicSeqIncrement({ run })
    expect(await inc('iv-1')).toEqual({ seq: 1, error: null })
    expect(run).toHaveBeenCalledWith(ATOMIC_TRANSCRIPT_SEQ_SQL, ['iv-1'])
    // MAX(seq)+1 / SELECT→UPDATE ではなく単一 UPDATE 文であること（SQL 文字列で明示）。
    expect(ATOMIC_TRANSCRIPT_SEQ_SQL).toContain('SET next_transcript_seq = next_transcript_seq + 1')
    expect(ATOMIC_TRANSCRIPT_SEQ_SQL).not.toMatch(/MAX\(/i)
    expect(ATOMIC_TRANSCRIPT_SEQ_SQL).not.toMatch(/SELECT/i)
  })
  it('RETURNING 0 行 → missing', async () => {
    const inc = createRawSqlAtomicSeqIncrement({ run: async () => ({ rows: [] }) })
    expect(await inc('iv-1')).toMatchObject({ seq: null, missing: true })
  })
  it('runner が throw → 非 PII error（本文を漏らさない）', async () => {
    const inc = createRawSqlAtomicSeqIncrement({
      run: async () => {
        throw new Error('postgres://user:pw@host/db timeout')
      },
    })
    const r = await inc('iv-1')
    expect(r.seq).toBeNull()
    expect(r.error).toBe('SEQ_STMT_FAILED')
    expect(JSON.stringify(r)).not.toContain('pw@host')
  })
  it('runner が error 返却 → そのまま error（allocator が DB_ERROR 化）', async () => {
    const inc = createRawSqlAtomicSeqIncrement({ run: async () => ({ rows: [], error: { code: '55P03' } }) })
    const alloc = createTranscriptSeqAllocator(inc)
    await expect(alloc.next('iv-1')).rejects.toMatchObject({ code: 'SEQ_ALLOC_DB_ERROR' })
  })
})

describe('13: 責務分離（seq 採番 ≠ dedup / partial→final で再採番しない）', () => {
  it('saveUtterance は SeqAllocator を持たない（seq は入力・update/skip 経路で採番し直さない）', async () => {
    const repo = new InMemoryTranscriptRepository()
    const base = (over: Partial<TranscriptWriteInput> = {}): TranscriptWriteInput => ({
      interviewId: 'iv-1',
      speaker: 'applicant',
      text: 'ある発話',
      seq: 5,
      final: false,
      source: 'realtime',
      dedupKey: 'app:item_1:0',
      language: null,
      ...over,
    })
    // partial（seq=5）→ insert
    const r1 = await saveUtterance(repo, base())
    expect(r1.status).toBe('inserted')
    expect(r1.utterance.seq).toBe(5)
    // 同 dedupKey で final（呼び出し側は「同じ seq=5」を渡す＝再採番しない）→ update・行は増えない・seq 維持
    const r2 = await saveUtterance(repo, base({ final: true, text: 'ある発話（確定）' }))
    expect(r2.status).toBe('updated')
    expect(r2.utterance.seq).toBe(5)
    expect(repo.all()).toHaveLength(1)
  })
})

import { describe, it, expect, vi } from 'vitest'
import {
  ingestUtterance,
  TranscriptIngestLimitError,
  TRANSCRIPT_MAX_UTTERANCES_PER_INTERVIEW,
  type IngestBase,
} from './transcript-ingestion'
import { InMemoryTranscriptRepository, type SeqAllocator } from './transcript-write'

// PR-19C: ingestUtterance の責務境界（fake のみ・実 DB 非接続）。
const base = (over: Partial<IngestBase> = {}): IngestBase => ({
  interviewId: 'iv-1',
  speaker: 'applicant',
  text: 'ある発話',
  final: true,
  source: 'realtime',
  dedupKey: 'applicant:item_1:0',
  language: null,
  ...over,
})
const countingAllocator = () => {
  let n = 0
  const spy = vi.fn(async () => ++n)
  return { spy, alloc: { next: spy } as SeqAllocator }
}

describe('ingestUtterance', () => {
  it('新規発話: allocator を呼び seq を採番して insert', async () => {
    const repo = new InMemoryTranscriptRepository()
    const { spy, alloc } = countingAllocator()
    const r = await ingestUtterance(repo, alloc, base())
    expect(r.status).toBe('inserted')
    expect(r.utterance.seq).toBe(1)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('duplicate（同 dedupKey 既存）: allocator を呼ばず既存 seq を再利用して update', async () => {
    const repo = new InMemoryTranscriptRepository()
    const { spy, alloc } = countingAllocator()
    await ingestUtterance(repo, alloc, base({ text: 'partial', final: false }))
    spy.mockClear()
    const r = await ingestUtterance(repo, alloc, base({ text: '確定', final: true }))
    expect(r.status).toBe('updated')
    expect(r.utterance.seq).toBe(1) // 再採番しない
    expect(spy).not.toHaveBeenCalled() // duplicate では allocator 追加 call なし
    expect(repo.all()).toHaveLength(1)
  })

  it('cap: 採番結果が上限超なら TRANSCRIPT_LIMIT_REACHED（insert しない）', async () => {
    const repo = new InMemoryTranscriptRepository()
    const alloc: SeqAllocator = { next: async () => TRANSCRIPT_MAX_UTTERANCES_PER_INTERVIEW + 1 }
    await expect(ingestUtterance(repo, alloc, base({ dedupKey: 'applicant:zzz:0' }))).rejects.toBeInstanceOf(TranscriptIngestLimitError)
    expect(repo.all()).toHaveLength(0)
  })

  it('cap 境界: ちょうど上限は許可', async () => {
    const repo = new InMemoryTranscriptRepository()
    const alloc: SeqAllocator = { next: async () => TRANSCRIPT_MAX_UTTERANCES_PER_INTERVIEW }
    const r = await ingestUtterance(repo, alloc, base())
    expect(r.status).toBe('inserted')
    expect(r.utterance.seq).toBe(TRANSCRIPT_MAX_UTTERANCES_PER_INTERVIEW)
  })

  it('concurrent duplicate seam: 同 dedupKey 同時2件 → DEDUP_CONFLICT retry で 1 行に収束', async () => {
    const repo = new InMemoryTranscriptRepository()
    let n = 0
    const alloc: SeqAllocator = { next: async () => ++n } // 各自 seq を採番
    const [a, b] = await Promise.all([
      ingestUtterance(repo, alloc, base({ text: 'A' })),
      ingestUtterance(repo, alloc, base({ text: 'B' })),
    ])
    expect(repo.all()).toHaveLength(1) // 二重行にならない
    expect([a.status, b.status].sort()).toEqual(['inserted', 'updated']) // 片方 insert・片方 update
  })

  it('別 interview は独立（dedupKey 同名でも別行）', async () => {
    const repo = new InMemoryTranscriptRepository()
    const { alloc } = countingAllocator()
    await ingestUtterance(repo, alloc, base({ interviewId: 'iv-1' }))
    await ingestUtterance(repo, alloc, base({ interviewId: 'iv-2' }))
    expect(repo.all()).toHaveLength(2)
  })
})

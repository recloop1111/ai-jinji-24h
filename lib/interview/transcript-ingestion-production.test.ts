import { describe, it, expect, vi } from 'vitest'
import { createRpcAtomicSeqIncrement, createProductionIngestionContext, type RpcCapableClient } from './transcript-ingestion-production'

// PR-19C: Production 依存 factory（fake client のみ・実 DB / network 非接続）。
describe('createRpcAtomicSeqIncrement', () => {
  it('rpc(allocate_transcript_seq,{p_interview_id}) を呼び返り値を seq に', async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }))
    const inc = createRpcAtomicSeqIncrement({ rpc } as RpcCapableClient)
    expect(await inc('iv-1')).toEqual({ seq: 1, error: null })
    expect(rpc).toHaveBeenCalledWith('allocate_transcript_seq', { p_interview_id: 'iv-1' })
  })
  it('data=null → missing（対象 interview 不在）', async () => {
    const inc = createRpcAtomicSeqIncrement({ rpc: async () => ({ data: null, error: null }) })
    expect(await inc('iv-1')).toMatchObject({ seq: null, missing: true })
  })
  it('error → そのまま error（allocator が DB_ERROR 化）', async () => {
    const inc = createRpcAtomicSeqIncrement({ rpc: async () => ({ data: null, error: { code: '42883' } }) })
    const r = await inc('iv-1')
    expect(r.seq).toBeNull()
    expect(r.error).toEqual({ code: '42883' })
  })
  it('非 number data → seq null（allocator が malformed 判定）', async () => {
    const inc = createRpcAtomicSeqIncrement({ rpc: async () => ({ data: '5', error: null }) })
    expect(await inc('iv-1')).toEqual({ seq: null, error: null })
  })
})

describe('createProductionIngestionContext（AK: create で副作用0）', () => {
  it('create しただけでは from も rpc も呼ばない', () => {
    const from = vi.fn()
    const rpc = vi.fn()
    createProductionIngestionContext({ from, rpc })
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('loadEntities: slug→company / id→applicant / id→interview を取得しマッピング', async () => {
    const calls: string[] = []
    const client = {
      from(table: string) {
        calls.push(table)
        const rows: Record<string, unknown> =
          table === 'companies' ? { id: 'co-1' }
          : table === 'applicants' ? { id: 'app-1', company_id: 'co-1' }
          : { id: 'iv-1', applicant_id: 'app-1', status: 'in_progress' }
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: rows, error: null }) }
        return q
      },
      rpc: async () => ({ data: 1, error: null }),
    }
    const ctx = createProductionIngestionContext(client)
    const ent = await ctx.loadEntities({ slug: 'demo', applicantId: 'app-1', interviewId: 'iv-1' })
    expect(ent.company).toEqual({ id: 'co-1' })
    expect(ent.applicant).toEqual({ id: 'app-1', company_id: 'co-1' })
    expect(ent.interview).toEqual({ id: 'iv-1', applicant_id: 'app-1', status: 'in_progress' })
    expect(calls).toEqual(['companies', 'applicants', 'interviews'])
  })

  it('loadEntities: 空 applicantId/interviewId は DB を引かず null', async () => {
    const from = vi.fn((table: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: table === 'companies' ? { id: 'co-1' } : null, error: null }) }
      return q
    })
    const ctx = createProductionIngestionContext({ from, rpc: async () => ({ data: 1, error: null }) })
    const ent = await ctx.loadEntities({ slug: 'demo', applicantId: '', interviewId: '' })
    expect(ent.applicant).toBeNull()
    expect(ent.interview).toBeNull()
    expect(from).toHaveBeenCalledTimes(1) // companies のみ
  })

  it('allocator は rpc 経由で seq を返す', async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }))
    const ctx = createProductionIngestionContext({ from: () => ({}), rpc })
    expect(await ctx.allocator.next('iv-1')).toBe(1)
    expect(rpc).toHaveBeenCalledWith('allocate_transcript_seq', { p_interview_id: 'iv-1' })
  })
})

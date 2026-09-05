import { describe, it, expect, vi, beforeEach } from 'vitest'

// E-5-4-B: PUT /api/client/questions（closing=common_questions / job=job_questions）の
// RBAC / tenant（自社 job 検証）/ validation / 置換（delete+insert）/ audit。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))
const mockAudit = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: (i: unknown) => mockAudit(i) }))

type Cfg = { job?: { id: string } | null }
let cfg: Cfg = {}
const captured = { ops: [] as string[], inserts: [] as { table: string; rows: unknown }[], eqs: {} as Record<string, unknown> }
function svcFrom(table: string) {
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.delete = () => { captured.ops.push(`delete:${table}`); return b }
  b.insert = (rows: unknown) => { captured.ops.push(`insert:${table}`); captured.inserts.push({ table, rows }); return Promise.resolve({ error: null }) }
  b.eq = (c: string, v: unknown) => { captured.eqs[`${table}.${c}`] = v; return b }
  b.maybeSingle = async () => {
    if (table === 'jobs') return { data: cfg.job === undefined ? { id: 'job-1' } : cfg.job, error: null }
    return { data: null, error: null }
  }
  // delete().eq()... は then で解決（await される）
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res)
  return b
}
vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({ from: (t: string) => svcFrom(t) }) }))

import { PUT } from '@/app/api/client/questions/route'

const CID = 'c0000000-0000-0000-0000-00000000000c'
const JID = '11111111-1111-1111-1111-111111111111'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: CID, companyRole }, error: null }) }
const qreq = (body: unknown) => new Request('http://x/api', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never
async function put(body: unknown) { const r = await PUT(qreq(body)); return { status: r.status, json: await r.json().catch(() => null) } }

beforeEach(() => { mockGetClientUser.mockReset(); mockAudit.mockClear(); cfg = {}; captured.ops = []; captured.inserts = []; captured.eqs = {} })

describe('closing（common_questions）', () => {
  it('OWNER/ADMIN/RECRUITER 成功・company_id 固定・delete+insert・監査', async () => {
    for (const role of ['owner', 'admin', 'recruiter']) {
      asUser(role); captured.ops = []; captured.inserts = []; captured.eqs = {}; mockAudit.mockClear()
      const { status } = await put({ kind: 'closing', questions: [{ label: '締め', question: '最後に一言' }] })
      expect(status).toBe(200)
      expect(captured.eqs['common_questions.company_id']).toBe(CID)
      expect(captured.ops).toContain('delete:common_questions')
      expect(captured.ops).toContain('insert:common_questions')
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'question.updated', metadata: { kind: 'closing', count: 1 } }))
    }
  })
  it('VIEWER → 403・書き込みなし', async () => { asUser('viewer'); const r = await put({ kind: 'closing', questions: [] }); expect(r.status).toBe(403); expect(captured.ops).toHaveLength(0) })
  it('空配列 → delete のみ（insert なし）', async () => { asUser('owner'); await put({ kind: 'closing', questions: [] }); expect(captured.ops).toEqual(['delete:common_questions']) })
  it('上限超過 → 400', async () => { asUser('owner'); expect((await put({ kind: 'closing', questions: [{ question: 'a' }, { question: 'b' }] })).status).toBe(400) })
  it('空文字質問 → 400', async () => { asUser('owner'); expect((await put({ kind: 'closing', questions: [{ question: '  ' }] })).status).toBe(400) })
})

describe('job（job_questions）', () => {
  it('OWNER 成功・自社 job 検証・job/pattern/category スコープ delete+insert・監査', async () => {
    asUser('owner')
    const { status } = await put({ kind: 'job', jobId: JID, patternKey: 'fulltime-default', category: 'evaluation', questions: [{ question: '志望動機' }] })
    expect(status).toBe(200)
    expect(captured.eqs['jobs.id']).toBe(JID)
    expect(captured.eqs['jobs.company_id']).toBe(CID) // 自社 job のみ
    expect(captured.eqs['job_questions.job_id']).toBe(JID)
    expect(captured.eqs['job_questions.category']).toBe('evaluation')
    expect(captured.ops).toContain('insert:job_questions')
    expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'question.updated', resourceType: 'job', resourceId: JID }))
  })
  it('他社/不存在 job → 404・job_questions を触らない', async () => {
    asUser('owner'); cfg.job = null
    const r = await put({ kind: 'job', jobId: JID, patternKey: 'fulltime-default', category: 'evaluation', questions: [{ question: 'x' }] })
    expect(r.status).toBe(404)
    expect(captured.ops.some((o) => o.includes('job_questions'))).toBe(false)
  })
  it('VIEWER → 403', async () => { asUser('viewer'); expect((await put({ kind: 'job', jobId: JID, patternKey: 'p', category: 'evaluation', questions: [] })).status).toBe(403) })
  it('invalid jobId → 400', async () => { asUser('owner'); expect((await put({ kind: 'job', jobId: 'bad', patternKey: 'p', category: 'evaluation', questions: [] })).status).toBe(400) })
  it('category 不正 → 400', async () => { asUser('owner'); expect((await put({ kind: 'job', jobId: JID, patternKey: 'p', category: 'closing', questions: [] })).status).toBe(400) })
  it('evaluation 上限超過（14問）→ 400', async () => {
    asUser('owner')
    const many = Array.from({ length: 14 }, (_, i) => ({ question: `q${i}` }))
    expect((await put({ kind: 'job', jobId: JID, patternKey: 'p', category: 'evaluation', questions: many })).status).toBe(400)
  })
})

describe('kind 不正', () => {
  it('unknown kind → 400', async () => { asUser('owner'); expect((await put({ kind: 'bogus' })).status).toBe(400) })
})

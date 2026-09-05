import { describe, it, expect, vi, beforeEach } from 'vitest'

// resume-pdf export の fail-closed audit 挙動（E-5-4-1・ユーザー最重視）。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

const mockAudit = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/audit/company-audit', () => ({ writeCompanyAuditLog: (i: unknown) => mockAudit(i) }))

vi.mock('@/lib/resume/resume-pdf', () => ({ buildResumePdf: async () => Buffer.from('%PDF-1.4 test') }))

function tableBuilder(applicantRow: unknown) {
  const b: Record<string, unknown> = {}
  b.select = () => b; b.eq = () => b; b.order = () => b
  b.maybeSingle = async () => ({ data: applicantRow, error: null })
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
  return b
}
let applicantRow: unknown = { id: 'a1', last_name: '高橋', first_name: '美咲', jobs: null }
vi.mock('@/lib/supabase/server', () => ({ createClientServerClient: async () => ({ from: () => tableBuilder(applicantRow) }) }))

import { GET } from '@/app/api/client/applicants/[id]/resume-pdf/route'

const ID = '11111111-1111-1111-1111-111111111111'
function asUser(companyRole: string) { mockGetClientUser.mockResolvedValue({ data: { userId: 'u1', companyId: 'c1', companyRole }, error: null }) }
async function call() { return GET(new Request('http://x') as never, { params: Promise.resolve({ id: ID }) }) }

beforeEach(() => { mockGetClientUser.mockReset(); mockAudit.mockReset(); mockAudit.mockResolvedValue({ ok: true }); applicantRow = { id: 'a1', last_name: '高橋', first_name: '美咲', jobs: null } })

describe('resume-pdf export fail-closed audit', () => {
  it('audit 成功 → 200 PDF ＋ audit(resume) 呼び出し', async () => {
    asUser('owner')
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(mockAudit).toHaveBeenCalledTimes(1)
    expect(mockAudit.mock.calls[0][0]).toMatchObject({ action: 'applicant.resume_pdf_exported', resourceType: 'applicant', resourceId: ID })
  })
  it('audit 失敗 → 500・PDF を返さない', async () => {
    asUser('owner')
    mockAudit.mockResolvedValue({ ok: false })
    const res = await call()
    expect(res.status).toBe(500)
    expect(res.headers.get('Content-Type')).not.toBe('application/pdf')
  })
  it('VIEWER → 403・audit 呼ばれない（success export log を残さない）', async () => {
    asUser('viewer')
    const res = await call()
    expect(res.status).toBe(403)
    expect(mockAudit).not.toHaveBeenCalled()
  })
})

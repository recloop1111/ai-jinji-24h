import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// server-side RBAC の配線を source-level で守る（Phase E-5-2・project の route テスト規約に準拠）。
//   各 protected route が central can(user.companyRole, <permission>) で判定し FORBIDDEN を返すこと。
//   VIEWER read（memo GET）は guard しない＝閲覧を壊さないこと。
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const AUTH = read('lib/api/auth.ts')
const ME = read('app/api/client/me/route.ts')
const RESUME = read('app/api/client/applicants/[id]/resume-pdf/route.ts')
const REPORT = read('app/api/client/applicants/[id]/report-pdf/route.ts')
const APPREPORT = read('app/api/client/applicants/[id]/applicant-report-pdf/route.ts')
const EMAIL = read('app/api/client/applicants/[id]/share-report-email/route.ts')
const STATUS = read('app/api/client/applicants/[id]/status/route.ts')
const MEMOS = read('app/api/client/applicants/[id]/memos/route.ts')
const MEMO_ID = read('app/api/client/applicants/[id]/memos/[memo_id]/route.ts')

describe('getClientUser: company_members(active) fail-closed + companyRole', () => {
  it('company_members を service-role で参照し status=active のみ有効', () => {
    expect(AUTH).toContain("from('company_members')")
    expect(AUTH).toContain(".eq('status', 'active')")
    expect(AUTH).toContain('companyRole')
  })
  it('membership 無し/不一致/未知 role は 403（fail closed・fallback owner を作らない）', () => {
    expect(AUTH).toContain("apiError('FORBIDDEN'")
    expect(AUTH).toContain('isCompanyRole(membership.company_role)')
    expect(AUTH.toLowerCase()).not.toContain('暫定owner')
  })
})

describe('/api/client/me: companyRole のみ追加（内部情報は返さない）', () => {
  it('companyRole を返す', () => {
    expect(ME).toContain('companyRole: data.companyRole')
  })
  it('status / invited_by 等の membership 内部を返さない', () => {
    expect(ME).not.toContain('invited_by')
    expect(ME).not.toContain('status:')
  })
})

describe('protected routes: can(user.companyRole, permission) guard', () => {
  const cases: Array<[string, string, string]> = [
    ['resume-pdf', RESUME, 'resume.pdf.download'],
    ['report-pdf', REPORT, 'report.pdf.download'],
    ['applicant-report-pdf', APPREPORT, 'applicant_report.pdf.download'],
    ['share-report-email', EMAIL, 'applicant_report.email_share'],
    ['status', STATUS, 'selection.manage'],
  ]
  for (const [name, src, perm] of cases) {
    it(`${name} は can(user.companyRole, '${perm}') で判定し FORBIDDEN`, () => {
      expect(src).toContain(`can(user.companyRole, '${perm}')`)
      expect(src).toContain("apiError('FORBIDDEN')")
      expect(src).toContain("from '@/lib/rbac/permissions'")
    })
  }
})

describe('memo: write は guard・read は open', () => {
  it('memos POST は applicant_memo.manage を要求', () => {
    expect(MEMOS).toContain("can(user.companyRole, 'applicant_memo.manage')")
    expect(MEMOS).toContain("apiError('FORBIDDEN')")
  })
  it('memos GET（read）は can() guard を持たない（VIEWER 閲覧維持）', () => {
    // GET ハンドラ本体（POST より前）に can( が現れないこと
    const getBody = MEMOS.slice(0, MEMOS.indexOf('export async function POST'))
    expect(getBody).not.toContain('can(user.companyRole')
  })
  it('memos [memo_id] PATCH/DELETE は applicant_memo.manage を要求（2箇所）', () => {
    const occurrences = MEMO_ID.split("can(user.companyRole, 'applicant_memo.manage')").length - 1
    expect(occurrences).toBe(2)
  })
})

describe('tenant ownership は維持（company_id 条件を外していない）', () => {
  for (const [name, src] of [['resume', RESUME], ['report', REPORT], ['appreport', APPREPORT], ['email', EMAIL], ['status', STATUS], ['memos', MEMOS]] as const) {
    it(`${name}: company_id = user.companyId で絞り込む`, () => {
      expect(src).toContain("user.companyId")
    })
  }
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildResumePdf, type ResumePdfInput, type ResumePdfApplicant } from './resume-pdf'
import type { ResumeEducationView, ResumeWorkView, ResumeLicenseView } from './resume-view'

const emptyApplicant = (): ResumePdfApplicant => ({
  last_name: null, first_name: null, last_name_kana: null, first_name_kana: null,
  birth_date: null, age: null, gender: null,
  postal_code: null, prefecture: null, city: null, town: null, address_line: null, building: null,
  phone_number: null, email: null, job_title: null,
  education: null, work_history: null, qualifications: null,
  motivation: null, self_pr: null, personal_requests: null,
})
const baseInput = (over: Partial<ResumePdfInput> = {}): ResumePdfInput => ({
  applicant: emptyApplicant(),
  educations: [], workExperiences: [], licenses: [], childStatus: 'ready',
  ...over,
})
const isPdf = (buf: Buffer) => buf.length > 100 && buf.subarray(0, 5).toString('latin1') === '%PDF-'

describe('buildResumePdf（Buffer 生成・PDF header）', () => {
  it('Buffer を返し %PDF- で始まる', async () => {
    const buf = await buildResumePdf(baseInput())
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(isPdf(buf)).toBe(true)
  })

  it('空/null 項目だけの applicant でも生成できる（500 にしない）', async () => {
    const buf = await buildResumePdf(baseInput())
    expect(isPdf(buf)).toBe(true)
  })

  it('structured な学歴/職歴/資格を含めて生成できる', async () => {
    const educations: ResumeEducationView[] = [{
      school_type: 'university', school_name: '○○大学', faculty_department: '工学部',
      entered_year_month: '2017-04', graduated_year_month: '2021-03', graduation_status: 'graduated', sort_order: 0,
    }, {
      school_type: 'junior_high', school_name: '△△中学校', faculty_department: null,
      entered_year_month: null, graduated_year_month: '2014-03', graduation_status: 'graduated', sort_order: 1,
    }]
    const workExperiences: ResumeWorkView[] = [{
      company_name: '株式会社ABC', department: '営業部', position: '主任', employment_type: '正社員',
      joined_year_month: '2021-04', left_year_month: null, is_current: true, description: '法人営業を担当', sort_order: 0,
    }]
    const licenses: ResumeLicenseView[] = [
      { name: '普通自動車第一種運転免許', acquired_year_month: '2019-06', sort_order: 0 },
      { name: 'TOEIC', acquired_year_month: null, sort_order: 1 },
    ]
    const buf = await buildResumePdf(baseInput({
      applicant: { ...emptyApplicant(), last_name: '山田', first_name: '太郎', birth_date: '2000-06-15', gender: 'male', job_title: 'エンジニア' },
      educations, workExperiences, licenses,
    }))
    expect(isPdf(buf)).toBe(true)
  })

  it('legacy fallback（子行なし＋legacy TEXT）でも生成できる', async () => {
    const buf = await buildResumePdf(baseInput({
      applicant: { ...emptyApplicant(), education: 'university', work_history: '株式会社X 2018-2022', qualifications: '簿記2級' },
      childStatus: 'ready', // 子行 0 → legacy 表示
    }))
    expect(isPdf(buf)).toBe(true)
  })

  it('子テーブル取得エラー（error）でも生成でき、空と偽装しない', async () => {
    const buf = await buildResumePdf(baseInput({ childStatus: 'error' }))
    expect(isPdf(buf)).toBe(true)
  })

  it('長文 motivation/self_pr でも生成に失敗しない（自動改ページ）', async () => {
    const long = 'あ'.repeat(12000)
    const buf = await buildResumePdf(baseInput({
      applicant: { ...emptyApplicant(), motivation: long, self_pr: long, personal_requests: long },
    }))
    expect(isPdf(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
  })
})

// ── source-level guard: 禁止データを混入しない構造 ──
const PDF_SRC = readFileSync(join(process.cwd(), 'lib/resume/resume-pdf.ts'), 'utf8')
const ROUTE_SRC = readFileSync(join(process.cwd(), 'app/api/client/applicants/[id]/resume-pdf/route.ts'), 'utf8')
const NEXT_SRC = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

describe('resume PDF は AI/面接/課金/内部情報・証明写真を扱わない', () => {
  it('PDF builder は禁止データ・証明写真を参照しない', () => {
    for (const forbidden of ['resume_photo_path', 'interview_results', 'reports', 'transcript', 'recording', 'duplicate_flag', 'inappropriate_flag', 'industry_experience', '証明写真']) {
      expect(PDF_SRC).not.toContain(forbidden)
    }
  })
  it('ResumePdfApplicant 型に内部/写真フィールドが無い', () => {
    const start = PDF_SRC.indexOf('export interface ResumePdfApplicant {')
    const block = PDF_SRC.slice(start, PDF_SRC.indexOf('}', start))
    expect(start).toBeGreaterThan(0)
    for (const key of ['employment_type', 'industry_experience', 'resume_photo_path', 'duplicate_flag', 'inappropriate_flag']) {
      expect(block).not.toContain(key)
    }
  })
})

describe('resume-pdf route: runtime / tenant / 取得元の限定', () => {
  it("runtime = 'nodejs' を明示", () => {
    expect(ROUTE_SRC).toContain("export const runtime = 'nodejs'")
  })
  it('tenant ownership（company_id = user.companyId）で取得', () => {
    expect(ROUTE_SRC).toContain(".eq('company_id', user.companyId)")
    expect(ROUTE_SRC).toContain('getClientUser()')
  })
  it('子3テーブルを sort_order ASC で取得', () => {
    expect(ROUTE_SRC).toContain("from('applicant_educations')")
    expect(ROUTE_SRC).toContain("from('applicant_work_experiences')")
    expect(ROUTE_SRC).toContain("from('applicant_licenses')")
    expect((ROUTE_SRC.match(/order\('sort_order', \{ ascending: true \}\)/g) ?? []).length).toBe(3)
  })
  it('AI/面接/課金/写真テーブル・列を取得しない', () => {
    for (const forbidden of ['interview_results', 'reports', 'transcript', 'recording', 'billing', 'resume_photo_path', 'industry_experience', 'duplicate_flag', 'inappropriate_flag']) {
      expect(ROUTE_SRC).not.toContain(forbidden)
    }
  })
  it('service-role へ不要に昇格しない（createClientServerClient を使用）', () => {
    expect(ROUTE_SRC).toContain('createClientServerClient')
    expect(ROUTE_SRC).not.toContain('createServiceRoleClient')
  })
  it('filename は PII を含まない ASCII（applicant id 先頭8文字）', () => {
    expect(ROUTE_SRC).toContain('`resume_${id.slice(0, 8)}.pdf`')
    expect(ROUTE_SRC).toContain("'Content-Type': 'application/pdf'")
    expect(ROUTE_SRC).toContain("'Cache-Control': 'no-store'")
  })
})

describe('next.config: 履歴書PDF ルートへ font 同梱', () => {
  it('outputFileTracingIncludes に resume-pdf ルート＋IPAexGothic', () => {
    expect(NEXT_SRC).toContain("'/api/client/applicants/[id]/resume-pdf': ['./assets/fonts/IPAexGothic.ttf']")
    // 既存 invoice 設定を壊していない
    expect(NEXT_SRC).toContain("'/api/client/billing/[billing_record_id]/invoice': ['./assets/fonts/IPAexGothic.ttf']")
  })
})

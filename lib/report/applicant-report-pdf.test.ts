import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { buildApplicantReportPdf, type ApplicantReportPdfInput } from './applicant-report-pdf'
import type { ResumeEducationView, ResumeWorkView, ResumeLicenseView } from '@/lib/resume/resume-view'

const emptyApplicant = () => ({
  last_name: null, first_name: null, last_name_kana: null, first_name_kana: null,
  birth_date: null, age: null, gender: null,
  postal_code: null, prefecture: null, city: null, town: null, address_line: null, building: null,
  phone_number: null, email: null, job_title: null,
  education: null, work_history: null, qualifications: null,
  motivation: null, self_pr: null, personal_requests: null,
})
const emptyEval = () => ({
  total_score: null, recommendation_rank: null, summary_text: null, feedback_text: null,
  personality_type: null, personality_description: null,
  profile_persona: null, profile_career: null, profile_interviewer_notes: null,
  strengths: null, improvement_points: null, evaluation_axes: null,
})
const base = (over: Partial<ApplicantReportPdfInput> = {}): ApplicantReportPdfInput => ({
  applicant: emptyApplicant(), educations: [], workExperiences: [], licenses: [], childStatus: 'ready',
  interviewDate: '2026年8月1日', statusLabel: '完了', evaluation: emptyEval(), ...over,
})
const isPdf = (b: Buffer) => b.length > 100 && b.subarray(0, 5).toString('latin1') === '%PDF-'

describe('buildApplicantReportPdf（履歴書＋AI評価 統合PDF）', () => {
  it('Buffer を返し %PDF- で始まる', async () => {
    const buf = await buildApplicantReportPdf(base())
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(isPdf(buf)).toBe(true)
  })

  it('structured resume ＋ AI評価 で生成成功', async () => {
    const educations: ResumeEducationView[] = [{ school_type: 'university', school_name: '○○大学', faculty_department: '工学部', entered_year_month: '2017-04', graduated_year_month: '2021-03', graduation_status: 'graduated', sort_order: 0 }]
    const workExperiences: ResumeWorkView[] = [{ company_name: '株式会社ABC', department: '営業部', position: '主任', employment_type: '正社員', joined_year_month: '2021-04', left_year_month: null, is_current: true, description: '法人営業を担当', sort_order: 0 }]
    const licenses: ResumeLicenseView[] = [{ name: '普通自動車第一種運転免許', acquired_year_month: '2019-06', sort_order: 0 }]
    const axis = (a: string, l: string, s: number | null) => ({ axis: a, label: l, score: s, rank: s == null ? null : 'B', confidence: 'high', evidence: [{ seq: 1, quote: '根拠発言' }], insufficient_reason: s == null ? '不足' : null })
    const buf = await buildApplicantReportPdf(base({
      applicant: { ...emptyApplicant(), last_name: '高橋', first_name: '美咲', birth_date: '1996-06-15', gender: 'female', job_title: 'エンジニア', motivation: '志望します', self_pr: '強みは論理性', personal_requests: '在宅希望' },
      educations, workExperiences, licenses,
      evaluation: { ...emptyEval(), total_score: 88, recommendation_rank: 'A', summary_text: 'リーダー型', profile_career: 'BE 7年', profile_interviewer_notes: '即戦力', strengths: ['論理的思考', '主体性'], improvement_points: ['細部への注意力'],
        evaluation_axes: [axis('communication', 'コミュニケーション力', 18), axis('logical_thinking', '論理的思考力', 16), axis('initiative', '主体性・行動力', 18), axis('desire', '志望度・意欲', 17), axis('stress_tolerance', 'ストレス耐性', 16), axis('integrity', '誠実性', null)] },
    }))
    expect(isPdf(buf)).toBe(true)
  })

  it('legacy resume（子行なし＋legacy TEXT）＋ AI評価 で生成成功', async () => {
    const buf = await buildApplicantReportPdf(base({
      applicant: { ...emptyApplicant(), education: 'university', work_history: '株式会社X 2018-2022', qualifications: '簿記2級' },
      evaluation: { ...emptyEval(), total_score: 70, recommendation_rank: 'C', evaluation_axes: [] },
    }))
    expect(isPdf(buf)).toBe(true)
  })

  it('null / 空でも crash しない', async () => {
    expect(isPdf(await buildApplicantReportPdf(base({ childStatus: 'error' })))).toBe(true)
  })

  it('長い履歴書（自由記述）で複数ページへ拡張', async () => {
    const long = 'あ'.repeat(9000)
    const buf = await buildApplicantReportPdf(base({ applicant: { ...emptyApplicant(), motivation: long, self_pr: long, personal_requests: long }, evaluation: { ...emptyEval(), total_score: 80 } }))
    expect(isPdf(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
  })

  it('長い AI evidence でも複数ページへ拡張', async () => {
    const long = 'い'.repeat(9000)
    const buf = await buildApplicantReportPdf(base({ evaluation: { ...emptyEval(), total_score: 80, evaluation_axes: [{ axis: 'communication', label: 'コミュ', score: 15, rank: 'B', confidence: 'medium', evidence: [{ seq: 1, quote: long }] }] } }))
    expect(isPdf(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
  })
})

// ── source-level guard ──
const PDF_SRC = readFileSync(join(process.cwd(), 'lib/report/applicant-report-pdf.ts'), 'utf8')
const ROUTE_SRC = readFileSync(join(process.cwd(), 'app/api/client/applicants/[id]/applicant-report-pdf/route.ts'), 'utf8')
const NEXT_SRC = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
const PAGE_SRC = readFileSync(join(process.cwd(), 'app/client/(dashboard)/applicants/[id]/page.tsx'), 'utf8')

describe('統合PDF: 意味境界改ページ・null score・evaluation-view 再利用・強制分割なし', () => {
  it('履歴書終了後 AI評価を新ページから開始（doc.addPage ＋「AI面接評価」）', () => {
    expect(PDF_SRC).toContain('doc.addPage()')
    expect(PDF_SRC).toContain('AI面接評価')
    // 応募者総合レポート大タイトルは1ページ目
    expect(PDF_SRC).toContain('応募者総合レポート')
  })
  it('null score を 0 化しない・evaluation-view helper 再利用', () => {
    expect(PDF_SRC).toContain("ax.score == null ? '判断材料不足'")
    expect(PDF_SRC).not.toContain('ax.score || 0')
    expect(PDF_SRC).toContain('resolveEvaluationDisplayState')
    expect(PDF_SRC).toContain('sortAxesForDisplay')
    expect(PDF_SRC).toContain('resumeSectionMode')
  })
  it('評価軸の強制分割（splitEvaluationAxesForPdf）を使わない', () => {
    expect(PDF_SRC).not.toContain('splitEvaluationAxesForPdf')
  })
})

describe('統合PDF: 禁止データを含めない', () => {
  it('builder に禁止データが無い', () => {
    for (const f of ['selection_status', 'internal_memos', 'transcript', 'recording', 'billing', 'duplicate_flag', 'inappropriate_flag', 'reports', 'report_axis_scores', 'report_scores', 'report_qa_summaries']) {
      expect(PDF_SRC).not.toContain(f)
    }
  })
  it('route が禁止テーブル/列を取得しない', () => {
    for (const f of ["from('internal_memos')", "from('interview_transcripts')", "from('reports')", "from('report_axis_scores')", "from('report_scores')", "from('report_qa_summaries')", 'selection_status', 'recording_url', 'duplicate_flag', 'inappropriate_flag', 'billing']) {
      expect(ROUTE_SRC).not.toContain(f)
    }
  })
})

describe('applicant-report-pdf route: runtime / tenant / SoT / font / filename', () => {
  it("runtime='nodejs'", () => { expect(ROUTE_SRC).toContain("export const runtime = 'nodejs'") })
  it('tenant ownership（company_id = user.companyId）', () => {
    expect(ROUTE_SRC).toContain('getClientUser()')
    expect(ROUTE_SRC).toContain(".eq('company_id', user.companyId)")
  })
  it('SoT interview_results（applicant_id）・無ければ NOT_FOUND（総合PDF不可）', () => {
    expect(ROUTE_SRC).toContain("from('interview_results')")
    expect(ROUTE_SRC).toContain(".eq('applicant_id', id)")
    expect(ROUTE_SRC).toContain("apiError('NOT_FOUND'")
  })
  it('子3テーブルを sort_order ASC で取得', () => {
    expect(ROUTE_SRC).toContain("from('applicant_educations')")
    expect(ROUTE_SRC).toContain("from('applicant_work_experiences')")
    expect(ROUTE_SRC).toContain("from('applicant_licenses')")
    expect((ROUTE_SRC.match(/order\('sort_order', \{ ascending: true \}\)/g) ?? []).length).toBe(3)
  })
  it('service-role 不使用', () => {
    expect(ROUTE_SRC).toContain('createClientServerClient')
    expect(ROUTE_SRC).not.toContain('createServiceRoleClient')
  })
  it('filename PII無 ASCII・application/pdf・no-store', () => {
    expect(ROUTE_SRC).toContain('`applicant-report_${id.slice(0, 8)}.pdf`')
    expect(ROUTE_SRC).toContain("'Content-Type': 'application/pdf'")
    expect(ROUTE_SRC).toContain("'Cache-Control': 'no-store'")
  })
  it('font tracing 追加（既存 invoice/resume/report は不変）', () => {
    expect(NEXT_SRC).toContain("'/api/client/applicants/[id]/applicant-report-pdf': ['./assets/fonts/IPAexGothic.ttf']")
    expect(NEXT_SRC).toContain("'/api/client/applicants/[id]/resume-pdf': ['./assets/fonts/IPAexGothic.ttf']")
    expect(NEXT_SRC).toContain("'/api/client/applicants/[id]/report-pdf': ['./assets/fonts/IPAexGothic.ttf']")
  })
})

describe('共有タブ UI ＋ 履歴書PDF 非破壊', () => {
  it('共有タブ fetch 先が applicant-report-pdf・文言/ボタン更新・ゲート維持', () => {
    expect(PAGE_SRC).toContain('/api/client/applicants/${id}/applicant-report-pdf')
    expect(PAGE_SRC).toContain('応募者総合レポート')
    expect(PAGE_SRC).toContain('総合レポートをダウンロード')
    expect(PAGE_SRC).toContain('disabled={!interviewResult || reportPdfLoading}')
    expect(PAGE_SRC).not.toContain("setToast('PDF生成機能は今後実装予定です')")
  })
  it('履歴書PDF（resume）builder/route は引き続き存在（非破壊）', () => {
    expect(existsSync(join(process.cwd(), 'lib/resume/resume-pdf.ts'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'app/api/client/applicants/[id]/resume-pdf/route.ts'))).toBe(true)
    expect(readFileSync(join(process.cwd(), 'lib/resume/resume-pdf.ts'), 'utf8')).toContain('export function buildResumePdf')
    expect(PAGE_SRC).toContain('/api/client/applicants/${id}/resume-pdf') // 履歴書タブの導線維持
  })
})

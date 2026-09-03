import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReportPdf, type ReportPdfInput, type ReportPdfEvaluation } from './report-pdf'

const emptyEval = (): ReportPdfEvaluation => ({
  total_score: null, recommendation_rank: null, summary_text: null, feedback_text: null,
  personality_type: null, personality_description: null,
  profile_persona: null, profile_career: null, profile_interviewer_notes: null,
  strengths: null, improvement_points: null, evaluation_axes: null,
})
const baseInput = (over: Partial<ReportPdfInput> = {}): ReportPdfInput => ({
  applicantName: '山田 太郎', jobTitle: 'エンジニア', interviewDate: '2026年8月1日', statusLabel: '完了',
  evaluation: emptyEval(), ...over,
})
const isPdf = (b: Buffer) => b.length > 100 && b.subarray(0, 5).toString('latin1') === '%PDF-'

describe('buildReportPdf（Buffer 生成・PDF header）', () => {
  it('Buffer を返し %PDF- で始まる', async () => {
    const buf = await buildReportPdf(baseInput())
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(isPdf(buf)).toBe(true)
  })

  it('評価 fixture（スコア/ランク/総評/軸/強み/改善）で生成成功', async () => {
    const buf = await buildReportPdf(baseInput({
      evaluation: {
        ...emptyEval(),
        total_score: 82, recommendation_rank: 'A',
        summary_text: '論理的で主体性が高い。', feedback_text: '深掘りに強い。',
        profile_persona: '課題解決型', profile_career: 'BtoB SaaS 5年', profile_interviewer_notes: '前向き',
        personality_type: '分析家', personality_description: '慎重かつ論理的',
        strengths: ['論理的思考', '主体性'],
        improvement_points: ['結論を先に述べる'],
        evaluation_axes: [
          { axis: 'logical_thinking', label: '論理的思考', score: 18, rank: 'A', confidence: 'high', evidence: [{ seq: 3, quote: '根拠を順序立てて説明できた' }] },
          { axis: 'initiative', label: '主体性', score: null, rank: null, confidence: 'low', insufficient_reason: '該当する発言が少ない', evidence: [] },
        ],
      },
    }))
    expect(isPdf(buf)).toBe(true)
  })

  it('長い summary/evidence でも生成成功（自動改ページ）', async () => {
    const long = 'あ'.repeat(9000)
    const buf = await buildReportPdf(baseInput({
      evaluation: {
        ...emptyEval(), summary_text: long,
        evaluation_axes: [{ axis: 'communication', label: 'コミュニケーション', score: 15, rank: 'B', confidence: 'medium', evidence: [{ seq: 1, quote: long }] }],
      },
    }))
    expect(isPdf(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(2000)
  })

  it('null / 空の optional でも crash しない', async () => {
    const buf = await buildReportPdf(baseInput({
      applicantName: '', jobTitle: null, interviewDate: null, statusLabel: '完了',
      evaluation: { ...emptyEval(), strengths: [], improvement_points: [], evaluation_axes: [] },
    }))
    expect(isPdf(buf)).toBe(true)
  })

  it('strengths / improvement_points を表示入力として処理できる', async () => {
    const buf = await buildReportPdf(baseInput({ evaluation: { ...emptyEval(), strengths: ['A', 'B'], improvement_points: ['C'] } }))
    expect(isPdf(buf)).toBe(true)
  })

  it('null score 軸を 0 に変換する独自ロジックが無い（判断材料不足を保持）', () => {
    // builder は score を数値変換せず evaluation-view の DisplayAxis.score を使う。
    const SRC = readFileSync(join(process.cwd(), 'lib/report/report-pdf.ts'), 'utf8')
    expect(SRC).toContain("ax.score == null ? '判断材料不足'")
    expect(SRC).not.toContain('ax.score || 0')
    expect(SRC).not.toContain('score ?? 0')
    // evaluation-view の helper を再利用
    expect(SRC).toContain('resolveEvaluationDisplayState')
    expect(SRC).toContain('sortAxesForDisplay')
    expect(SRC).toContain('confidenceText')
  })
})

// ── source-level guard ──
const PDF_SRC = readFileSync(join(process.cwd(), 'lib/report/report-pdf.ts'), 'utf8')
const ROUTE_SRC = readFileSync(join(process.cwd(), 'app/api/client/applicants/[id]/report-pdf/route.ts'), 'utf8')
const NEXT_SRC = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
const PAGE_SRC = readFileSync(join(process.cwd(), 'app/client/(dashboard)/applicants/[id]/page.tsx'), 'utf8')

describe('report PDF は選考/会話/録画/課金/内部情報を含めない', () => {
  it('builder 入力型に禁止データが無い', () => {
    for (const f of ['selection_status', 'internal_memos', 'transcript', 'recording', 'billing', 'duplicate_flag', 'inappropriate_flag', 'reports', 'report_axis_scores', 'report_scores', 'report_qa_summaries']) {
      expect(PDF_SRC).not.toContain(f)
    }
  })
  it('route は禁止テーブル/列を取得しない', () => {
    for (const f of ["from('internal_memos')", "from('interview_transcripts')", "from('reports')", "from('report_axis_scores')", "from('report_scores')", "from('report_qa_summaries')", 'selection_status', 'recording_url', 'duplicate_flag', 'inappropriate_flag', 'billing']) {
      expect(ROUTE_SRC).not.toContain(f)
    }
  })
})

describe('report-pdf route: runtime / tenant / SoT / font', () => {
  it("runtime = 'nodejs'", () => { expect(ROUTE_SRC).toContain("export const runtime = 'nodejs'") })
  it('tenant ownership（company_id = user.companyId）', () => {
    expect(ROUTE_SRC).toContain('getClientUser()')
    expect(ROUTE_SRC).toContain(".eq('company_id', user.companyId)")
  })
  it('SoT = interview_results（applicant_id）。無ければ NOT_FOUND（中身の無いPDFを作らない）', () => {
    expect(ROUTE_SRC).toContain("from('interview_results')")
    expect(ROUTE_SRC).toContain(".eq('applicant_id', id)")
    expect(ROUTE_SRC).toContain("apiError('NOT_FOUND'")
  })
  it('service-role へ昇格しない', () => {
    expect(ROUTE_SRC).toContain('createClientServerClient')
    expect(ROUTE_SRC).not.toContain('createServiceRoleClient')
  })
  it('filename は PII 無し ASCII・application/pdf・no-store', () => {
    expect(ROUTE_SRC).toContain('`report_${id.slice(0, 8)}.pdf`')
    expect(ROUTE_SRC).toContain("'Content-Type': 'application/pdf'")
    expect(ROUTE_SRC).toContain("'Cache-Control': 'no-store'")
  })
  it('next.config に report-pdf の font tracing（既存は不変）', () => {
    expect(NEXT_SRC).toContain("'/api/client/applicants/[id]/report-pdf': ['./assets/fonts/IPAexGothic.ttf']")
    expect(NEXT_SRC).toContain("'/api/client/applicants/[id]/resume-pdf': ['./assets/fonts/IPAexGothic.ttf']")
    expect(NEXT_SRC).toContain("'/api/client/billing/[billing_record_id]/invoice': ['./assets/fonts/IPAexGothic.ttf']")
  })
})

describe('共有タブ UI: 状態ゲート', () => {
  it('interviewResult 無しでは PDF ボタン disabled・TODO toast は撤去', () => {
    expect(PAGE_SRC).toContain('disabled={!interviewResult || reportPdfLoading}')
    expect(PAGE_SRC).not.toContain("setToast('PDF生成機能は今後実装予定です')")
    expect(PAGE_SRC).toContain('/api/client/applicants/${id}/report-pdf')
  })
  it('未評価時の補足文（既存空状態コピーと整合）', () => {
    expect(PAGE_SRC).toContain('AI評価レポートはまだ生成されていません')
    expect(PAGE_SRC).toContain('面接完了後にレポートをダウンロードできます')
  })
})

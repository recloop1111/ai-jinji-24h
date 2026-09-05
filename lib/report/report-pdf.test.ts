import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReportPdf, splitEvaluationAxesForPdf, type ReportPdfInput, type ReportPdfEvaluation } from './report-pdf'

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

describe('splitEvaluationAxesForPdf（意図的2ページ分割・軸数非依存）', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => i)
  it('6軸 → 前半3 / 後半3', () => {
    expect(splitEvaluationAxesForPdf(ids(6))).toEqual({ first: [0, 1, 2], second: [3, 4, 5] })
  })
  it('4軸 → 前半2 / 後半2、5軸 → 前半3 / 後半2', () => {
    expect(splitEvaluationAxesForPdf(ids(4))).toEqual({ first: [0, 1], second: [2, 3] })
    expect(splitEvaluationAxesForPdf(ids(5))).toEqual({ first: [0, 1, 2], second: [3, 4] })
  })
  it('3軸以下は分割せず全て前半（強制改ページしない）', () => {
    expect(splitEvaluationAxesForPdf(ids(3))).toEqual({ first: [0, 1, 2], second: [] })
    expect(splitEvaluationAxesForPdf(ids(1))).toEqual({ first: [0], second: [] })
    expect(splitEvaluationAxesForPdf(ids(0))).toEqual({ first: [], second: [] })
  })
  it('順序を保持（first + second が入力順と一致）', () => {
    const src = ids(6)
    const { first, second } = splitEvaluationAxesForPdf(src)
    expect([...first, ...second]).toEqual(src)
  })
  it('index を hard-code せず ceil(n/2)（7軸→4/3・8軸→4/4）', () => {
    expect(splitEvaluationAxesForPdf(ids(7))).toEqual({ first: [0, 1, 2, 3], second: [4, 5, 6] })
    expect(splitEvaluationAxesForPdf(ids(8))).toEqual({ first: [0, 1, 2, 3], second: [4, 5, 6, 7] })
  })
})

describe('buildReportPdf: 6軸標準は2ページ以上（意図的改ページ）', () => {
  it('6軸フル評価で生成成功（内容は不変）', async () => {
    const axis = (a: string, label: string, score: number | null) => ({ axis: a, label, score, rank: score == null ? null : 'B', confidence: 'medium', evidence: [{ seq: 1, quote: '根拠発言' }], insufficient_reason: score == null ? '不足' : null })
    const buf = await buildReportPdf({
      applicantName: '高橋 美咲', jobTitle: 'エンジニア', interviewDate: '2026年8月1日', statusLabel: '完了',
      evaluation: {
        total_score: 88, recommendation_rank: 'A', summary_text: 'リーダー型', feedback_text: '推奨',
        personality_type: null, personality_description: null,
        profile_persona: '課題解決型', profile_career: 'BE 7年', profile_interviewer_notes: '即戦力',
        strengths: ['リーダーシップ', 'コミュニケーション', '挑戦意欲'],
        improvement_points: ['細部への注意力'],
        evaluation_axes: [
          axis('communication', 'コミュニケーション力', 18), axis('logical_thinking', '論理的思考力', 16),
          axis('initiative', '主体性・行動力', 18), axis('desire', '志望度・意欲', 17),
          axis('stress_tolerance', 'ストレス耐性・柔軟性', 16), axis('integrity', '誠実性・一貫性', 17),
        ],
      },
    })
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
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

// ※ Phase E-3-1 で共有タブは「応募者総合レポート」(/applicant-report-pdf) へ移行。
//   共有タブ UI の状態ゲート検証は lib/report/applicant-report-pdf.test.ts へ移設。
//   report-pdf（AI単体PDF）は非破壊で保持（route/builder は存続・UI 配線のみ移行）。
describe('report-pdf（AI単体PDF）は非破壊で保持', () => {
  it('report-pdf route/builder は存続', () => {
    expect(ROUTE_SRC).toContain("export const runtime = 'nodejs'")
    expect(PDF_SRC).toContain('export function buildReportPdf')
  })
  it('共有タブは report-pdf ではなく総合レポートを参照（配線移行済み）', () => {
    expect(PAGE_SRC).not.toContain('/api/client/applicants/${id}/report-pdf')
    expect(PAGE_SRC).toContain('/api/client/applicants/${id}/applicant-report-pdf')
  })
})

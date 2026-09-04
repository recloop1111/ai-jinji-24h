import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createClientServerClient } from '@/lib/supabase/server'
import { deriveCurrentStatus, CURRENT_STATUS_LABEL } from '@/lib/applicants/displayStatus'
import { buildReportPdf, type ReportPdfInput } from '@/lib/report/report-pdf'

// AI面接結果レポートPDF（client・自社 applicant のみ）。SoT=interview_results。都度生成し Storage 保存しない。
// pdfkit が Node の fs/streams に依存するため Node runtime を明示。
export const runtime = 'nodejs'

// 生成条件: 表示可能な interview_results が存在すること（中身の無いレポートは生成しない）。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    // VIEWER は AI評価レポート export 不可。
    if (!can(user.companyRole, 'report.pdf.download')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const supabase = await createClientServerClient()

    // 所有権確認: 自社 applicant のみ。他社 id は行が返らず NOT_FOUND。履歴書/連絡先の機微列は取得しない。
    type ApplicantRow = { last_name: string | null; first_name: string | null; status: string | null; jobs: { title?: string | null } | { title?: string | null }[] | null }
    const { data: appData, error: appError } = await supabase
      .from('applicants')
      .select('id, last_name, first_name, status, jobs(title)')
      .eq('id', id)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (appError) return apiError('INTERNAL_ERROR', 'データの取得に失敗しました')
    if (!appData) return apiError('NOT_FOUND', '応募者が見つかりません')
    const applicant = appData as unknown as ApplicantRow

    // 評価データ（SoT）。存在しなければ NOT_FOUND（既存 error contract）＝中身の無い PDF を作らない。
    type IrRow = {
      total_score: number | null; feedback_text: string | null
      personality_type: string | null; personality_description: string | null
      summary_text: string | null; strengths: string[] | null; improvement_points: string[] | null
      evaluation_axes: unknown
      detail_json: { recommendation_rank?: string | null; profile_summary?: { persona?: string | null; career?: string | null; interviewer_notes?: string | null } | null } | null
    }
    const { data: irData, error: irError } = await supabase
      .from('interview_results')
      .select('total_score, feedback_text, personality_type, personality_description, summary_text, strengths, improvement_points, evaluation_axes, detail_json')
      .eq('applicant_id', id)
      .maybeSingle()
    if (irError) return apiError('INTERNAL_ERROR', '評価データの取得に失敗しました')
    if (!irData) return apiError('NOT_FOUND', 'AI評価レポートがまだ生成されていません')
    const ir = irData as unknown as IrRow

    // 面接（日時・ステータス）。評価が存在する前提で最新1件。
    const { data: interview } = await supabase
      .from('interviews')
      .select('status, started_at, ended_at')
      .eq('applicant_id', id)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const startedAt = (interview as { started_at?: string | null } | null)?.started_at ?? null
    const interviewDate = startedAt
      ? (() => { const d = new Date(startedAt); return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` })()
      : null
    const statusLabel = CURRENT_STATUS_LABEL[deriveCurrentStatus(applicant.status, (interview as { status?: string | null } | null)?.status ?? null)]

    const jobTitle = Array.isArray(applicant.jobs)
      ? (applicant.jobs[0]?.title ?? null)
      : (applicant.jobs?.title ?? null)

    const input: ReportPdfInput = {
      applicantName: `${applicant.last_name ?? ''} ${applicant.first_name ?? ''}`.trim(),
      jobTitle,
      interviewDate,
      statusLabel,
      evaluation: {
        total_score: ir.total_score ?? null,
        recommendation_rank: ir.detail_json?.recommendation_rank ?? null,
        summary_text: ir.summary_text ?? null,
        feedback_text: ir.feedback_text ?? null,
        personality_type: ir.personality_type ?? null,
        personality_description: ir.personality_description ?? null,
        profile_persona: ir.detail_json?.profile_summary?.persona ?? null,
        profile_career: ir.detail_json?.profile_summary?.career ?? null,
        profile_interviewer_notes: ir.detail_json?.profile_summary?.interviewer_notes ?? null,
        strengths: Array.isArray(ir.strengths) ? ir.strengths : null,
        improvement_points: Array.isArray(ir.improvement_points) ? ir.improvement_points : null,
        evaluation_axes: ir.evaluation_axes ?? null,
      },
    }

    const pdf = await buildReportPdf(input)

    const filename = `report_${id.slice(0, 8)}.pdf`
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

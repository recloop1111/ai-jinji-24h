import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createClientServerClient } from '@/lib/supabase/server'
import { deriveCurrentStatus, CURRENT_STATUS_LABEL } from '@/lib/applicants/displayStatus'
import { buildApplicantReportPdf, type ApplicantReportPdfInput } from '@/lib/report/applicant-report-pdf'
import type { ResumeEducationView, ResumeWorkView, ResumeLicenseView, ResumeChildStatus } from '@/lib/resume/resume-view'

// 応募者総合レポートPDF（client・自社 applicant のみ）＝履歴書情報＋AI面接評価を1ファイルに統合。
//   都度 DB 最新から生成し Storage 保存しない。pdfkit が Node の fs/streams に依存するため Node runtime を明示。
export const runtime = 'nodejs'

// 生成条件（Option C）: interview_results（AI評価）が存在すること。無ければ NOT_FOUND（履歴書のみは履歴書PDFを利用）。
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    // VIEWER は総合レポート export 不可。
    if (!can(user.companyRole, 'applicant_report.pdf.download')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const supabase = await createClientServerClient()

    // 所有権確認: 自社 applicant のみ（他社 id は行が返らず NOT_FOUND）。許可された履歴書列のみ明示 SELECT。
    //   面接評価・選考・課金・内部フラグ・写真・内部応募区分は取得しない。
    type ApplicantRow = {
      last_name: string | null; first_name: string | null; last_name_kana: string | null; first_name_kana: string | null
      birth_date: string | null; age: number | null; gender: string | null; status: string | null
      phone_number: string | null; email: string | null
      postal_code: string | null; prefecture: string | null; city: string | null; town: string | null
      address_line: string | null; building: string | null
      motivation: string | null; self_pr: string | null; personal_requests: string | null
      education: string | null; work_history: string | null; qualifications: string | null
      jobs: { title?: string | null } | { title?: string | null }[] | null
    }
    const { data: appData, error: appError } = await supabase
      .from('applicants')
      .select(
        'id, last_name, first_name, last_name_kana, first_name_kana, birth_date, age, gender, status, ' +
        'phone_number, email, postal_code, prefecture, city, town, address_line, building, ' +
        'motivation, self_pr, personal_requests, education, work_history, qualifications, jobs(title)',
      )
      .eq('id', id)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (appError) return apiError('INTERNAL_ERROR', 'データの取得に失敗しました')
    if (!appData) return apiError('NOT_FOUND', '応募者が見つかりません')
    const applicant = appData as unknown as ApplicantRow

    // 評価データ（SoT）。無ければ総合レポートは生成しない（履歴書のみは履歴書PDFを利用）。
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
    if (!irData) return apiError('NOT_FOUND', 'AI評価がまだ生成されていません')
    const ir = irData as unknown as IrRow

    // 履歴書子3テーブル（自社は RLS 保証）＋ 最新 interview を並列取得。
    const [eduRes, workRes, licRes, interviewRes] = await Promise.all([
      supabase.from('applicant_educations')
        .select('school_type, school_name, faculty_department, entered_year_month, graduated_year_month, graduation_status, sort_order')
        .eq('applicant_id', id).order('sort_order', { ascending: true }),
      supabase.from('applicant_work_experiences')
        .select('company_name, department, position, employment_type, joined_year_month, left_year_month, is_current, description, sort_order')
        .eq('applicant_id', id).order('sort_order', { ascending: true }),
      supabase.from('applicant_licenses')
        .select('name, acquired_year_month, sort_order')
        .eq('applicant_id', id).order('sort_order', { ascending: true }),
      supabase.from('interviews')
        .select('status, started_at, ended_at')
        .eq('applicant_id', id).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const childStatus: ResumeChildStatus = (eduRes.error || workRes.error || licRes.error) ? 'error' : 'ready'

    const interview = interviewRes.data as { status?: string | null; started_at?: string | null } | null
    const startedAt = interview?.started_at ?? null
    const interviewDate = startedAt
      ? (() => { const d = new Date(startedAt); return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` })()
      : null
    const statusLabel = CURRENT_STATUS_LABEL[deriveCurrentStatus(applicant.status, interview?.status ?? null)]

    const jobTitle = Array.isArray(applicant.jobs) ? (applicant.jobs[0]?.title ?? null) : (applicant.jobs?.title ?? null)

    const input: ApplicantReportPdfInput = {
      applicant: {
        last_name: applicant.last_name ?? null, first_name: applicant.first_name ?? null,
        last_name_kana: applicant.last_name_kana ?? null, first_name_kana: applicant.first_name_kana ?? null,
        birth_date: applicant.birth_date ?? null, age: applicant.age ?? null, gender: applicant.gender ?? null,
        postal_code: applicant.postal_code ?? null, prefecture: applicant.prefecture ?? null,
        city: applicant.city ?? null, town: applicant.town ?? null,
        address_line: applicant.address_line ?? null, building: applicant.building ?? null,
        phone_number: applicant.phone_number ?? null, email: applicant.email ?? null,
        job_title: jobTitle,
        education: applicant.education ?? null, work_history: applicant.work_history ?? null, qualifications: applicant.qualifications ?? null,
        motivation: applicant.motivation ?? null, self_pr: applicant.self_pr ?? null, personal_requests: applicant.personal_requests ?? null,
      },
      educations: (childStatus === 'error' ? [] : (eduRes.data ?? [])) as ResumeEducationView[],
      workExperiences: (childStatus === 'error' ? [] : (workRes.data ?? [])) as ResumeWorkView[],
      licenses: (childStatus === 'error' ? [] : (licRes.data ?? [])) as ResumeLicenseView[],
      childStatus,
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

    const pdf = await buildApplicantReportPdf(input)

    const filename = `applicant-report_${id.slice(0, 8)}.pdf`
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

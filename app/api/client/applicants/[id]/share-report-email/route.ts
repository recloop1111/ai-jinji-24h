import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { can } from '@/lib/rbac/permissions'
import { isValidUUID } from '@/lib/api/validation'
import { createClientServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { deriveCurrentStatus, CURRENT_STATUS_LABEL } from '@/lib/applicants/displayStatus'
import { buildApplicantReportPdf, type ApplicantReportPdfInput } from '@/lib/report/applicant-report-pdf'
import type { ResumeEducationView, ResumeWorkView, ResumeLicenseView, ResumeChildStatus } from '@/lib/resume/resume-view'
import { sendEmail, isEmailConfigured } from '@/lib/email/send-email'
import {
  validateRecipientEmail, validateShareMessage, parseAllowlist, evaluateSendPolicy, buildShareEmailBody,
  SHARE_EMAIL_SUBJECT, SHARE_EMAIL_AUDIT_BODY,
} from '@/lib/email/share-report'

// 応募者総合レポートPDF をメール添付で共有（client・自社 applicant のみ）。都度 DB 最新から PDF 生成。
// pdfkit / Resend が Node の fs/streams に依存するため Node runtime を明示。
export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError
    // VIEWER はメール共有不可（PDF 生成・送信の前に遮断）。
    if (!can(user.companyRole, 'applicant_report.email_share')) return apiError('FORBIDDEN')

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const body = await request.json().catch(() => null)
    const recip = validateRecipientEmail(body?.email)
    if (!recip.ok) return apiError('VALIDATION_ERROR', recip.error)
    const msg = validateShareMessage(body?.message)
    if (!msg.ok) return apiError('VALIDATION_ERROR', msg.error)

    const supabase = await createClientServerClient()

    // 所有権確認（自社のみ）。他社 id は行が返らず NOT_FOUND。以降のデータ取得/PDF生成/送信はこの後のみ。
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

    // AI評価ゲート（総合PDFと同条件）。無ければ共有不可。
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

    // メール未設定なら実送信しない（honest）。PDF 生成前に判定。
    if (!isEmailConfigured()) {
      return errorJson('EMAIL_UNAVAILABLE', 'メール送信は現在利用できません。', 503)
    }

    // Demo/Preview 誤送信防止: is_demo は phase2h 列ホワイトリスト外のため service-role で単一フラグのみ読む
    //   （所有権は上で確認済み・company_id は自社に固定＝tenant bypass ではない）。
    let isDemo = true // 判定不能時は安全側（allowlist 制限）
    try {
      const svc = createServiceRoleClient()
      const { data: demoRow, error: demoErr } = await svc.from('companies').select('is_demo').eq('id', user.companyId).maybeSingle()
      isDemo = demoErr ? true : (demoRow?.is_demo === true)
    } catch { isDemo = true }
    const isProduction = process.env.VERCEL_ENV === 'production'
    const allowlist = parseAllowlist(process.env.MAIL_TEST_RECIPIENT_ALLOWLIST)
    const policy = evaluateSendPolicy({ isDemo, isProduction, recipient: recip.email, allowlist })
    if (!policy.allowed) {
      if (policy.reason === 'allowlist_only') {
        return errorJson('FORBIDDEN', '現在の環境では、許可されたテスト用アドレスにのみ送信できます。', 403)
      }
      // allowlist_unset（demo/preview で許可リスト未設定）
      return errorJson('EMAIL_UNAVAILABLE', 'メール送信は現在利用できません。', 503)
    }

    // 履歴書子3テーブル＋最新 interview を並列取得（RLS 自社スコープ）。
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
    const applicantName = `${applicant.last_name ?? ''} ${applicant.first_name ?? ''}`.trim()

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
      childStatus, interviewDate, statusLabel,
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

    // sent_emails への監査記録（service-role・server 確定値のみ・PII本文は保存しない）。
    const auditInsert = async (status: 'sent' | 'failed', messageId: string | null) => {
      try {
        const svc = createServiceRoleClient()
        const { error } = await svc.from('sent_emails').insert({
          applicant_id: id,
          company_id: user.companyId,
          email_template_id: null,
          template_type: 'applicant_report',
          to_email: recip.email,
          subject: SHARE_EMAIL_SUBJECT,
          body: SHARE_EMAIL_AUDIT_BODY,
          status,
          resend_message_id: messageId,
        })
        return !error
      } catch {
        return false
      }
    }

    const result = await sendEmail({
      to: recip.email,
      subject: SHARE_EMAIL_SUBJECT,
      text: buildShareEmailBody(applicantName, msg.message),
      attachments: [{ filename, content: pdf }],
    })

    if (!result.ok) {
      // provider 失敗 → failed を best-effort 記録（記録失敗でも provider error を隠さない）。成功トーストは出させない。
      await auditInsert('failed', null)
      return apiError('INTERNAL_ERROR', 'メールを送信できませんでした。もう一度お試しください。')
    }

    // provider 成功 → 監査 INSERT。INSERT 失敗でも「送信失敗」にしない（実送信済み＝再送で二重送信を誘発しない）。
    const auditRecorded = await auditInsert('sent', result.messageId)
    return successJson({ sent: true, auditRecorded })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

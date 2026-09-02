import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClientServerClient } from '@/lib/supabase/server'
import { buildResumePdf, type ResumePdfInput } from '@/lib/resume/resume-pdf'
import type { ResumeEducationView, ResumeWorkView, ResumeLicenseView, ResumeChildStatus } from '@/lib/resume/resume-view'

// 履歴書PDFダウンロード（client・自社 applicant のみ）。都度 DB 最新から生成し Storage には保存しない。
// pdfkit が Node の fs/streams に依存するため Node runtime を明示。
export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) return apiError('VALIDATION_ERROR', 'IDの形式が不正です')

    const supabase = await createClientServerClient()

    // 所有権確認: 自社 applicant のみ（company_id を必ず条件に含める）。他社 id は行が返らず NOT_FOUND。
    //   ※ 履歴書に必要な許可列のみ明示 SELECT。面接評価・選考・課金・内部フラグ・写真・内部応募区分は取得しない。
    // 生成 DB 型が無いため明示 row 型で受ける（embedded join の union 化を避ける）。
    type ApplicantPdfRow = {
      last_name: string | null; first_name: string | null
      last_name_kana: string | null; first_name_kana: string | null
      birth_date: string | null; age: number | null; gender: string | null
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
        'id, last_name, first_name, last_name_kana, first_name_kana, birth_date, age, gender, ' +
        'phone_number, email, postal_code, prefecture, city, town, address_line, building, ' +
        'motivation, self_pr, personal_requests, education, work_history, qualifications, jobs(title)',
      )
      .eq('id', id)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (appError) return apiError('INTERNAL_ERROR', '履歴書情報の取得に失敗しました')
    if (!appData) return apiError('NOT_FOUND', '応募者が見つかりません')
    const applicant = appData as unknown as ApplicantPdfRow

    // 子3テーブル（自社は RLS で保証）。明示列・sort_order ASC。取得エラーは 0件と区別。
    const [eduRes, workRes, licRes] = await Promise.all([
      supabase.from('applicant_educations')
        .select('school_type, school_name, faculty_department, entered_year_month, graduated_year_month, graduation_status, sort_order')
        .eq('applicant_id', id).order('sort_order', { ascending: true }),
      supabase.from('applicant_work_experiences')
        .select('company_name, department, position, employment_type, joined_year_month, left_year_month, is_current, description, sort_order')
        .eq('applicant_id', id).order('sort_order', { ascending: true }),
      supabase.from('applicant_licenses')
        .select('name, acquired_year_month, sort_order')
        .eq('applicant_id', id).order('sort_order', { ascending: true }),
    ])
    const childStatus: ResumeChildStatus = (eduRes.error || workRes.error || licRes.error) ? 'error' : 'ready'

    const jobTitle = Array.isArray(applicant.jobs)
      ? (applicant.jobs[0]?.title ?? null)
      : ((applicant.jobs as { title?: string } | null)?.title ?? null)

    const input: ResumePdfInput = {
      applicant: {
        last_name: applicant.last_name ?? null,
        first_name: applicant.first_name ?? null,
        last_name_kana: applicant.last_name_kana ?? null,
        first_name_kana: applicant.first_name_kana ?? null,
        birth_date: applicant.birth_date ?? null,
        age: applicant.age ?? null,
        gender: applicant.gender ?? null,
        postal_code: applicant.postal_code ?? null,
        prefecture: applicant.prefecture ?? null,
        city: applicant.city ?? null,
        town: applicant.town ?? null,
        address_line: applicant.address_line ?? null,
        building: applicant.building ?? null,
        phone_number: applicant.phone_number ?? null,
        email: applicant.email ?? null,
        job_title: jobTitle,
        education: applicant.education ?? null,
        work_history: applicant.work_history ?? null,
        qualifications: applicant.qualifications ?? null,
        motivation: applicant.motivation ?? null,
        self_pr: applicant.self_pr ?? null,
        personal_requests: applicant.personal_requests ?? null,
      },
      educations: (childStatus === 'error' ? [] : (eduRes.data ?? [])) as ResumeEducationView[],
      workExperiences: (childStatus === 'error' ? [] : (workRes.data ?? [])) as ResumeWorkView[],
      licenses: (childStatus === 'error' ? [] : (licRes.data ?? [])) as ResumeLicenseView[],
      childStatus,
    }

    const pdf = await buildResumePdf(input)

    // filename は PII を含めない ASCII（applicant UUID 先頭8文字）。
    const filename = `resume_${id.slice(0, 8)}.pdf`
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

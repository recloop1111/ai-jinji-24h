import { type NextRequest } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const { id } = await params
    const supabase = await createClient()

    // 応募者情報 + 職種名
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select(`
        id, last_name, first_name, last_name_kana, first_name_kana,
        birth_date, gender, phone_number, email, prefecture,
        education, employment_type, industry_experience,
        work_history, qualifications,
        selection_status, duplicate_flag, inappropriate_flag, created_at,
        job_types ( name )
      `)
      .eq('id', id)
      .eq('company_id', user.companyId)
      .single()

    if (appError || !applicant) {
      return apiError('NOT_FOUND', '応募者が見つかりません')
    }

    // 面接情報（applicant所有権確認済みだが、防御的にcompany_idでもスコープ）
    const { data: interview } = await supabase
      .from('interviews')
      .select('id, duration_seconds, question_count, recording_status, started_at, ended_at')
      .eq('applicant_id', id)
      .eq('company_id', user.companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return successJson({
      applicant: {
        id: applicant.id,
        last_name: applicant.last_name,
        first_name: applicant.first_name,
        last_name_kana: applicant.last_name_kana,
        first_name_kana: applicant.first_name_kana,
        birth_date: applicant.birth_date,
        gender: applicant.gender,
        phone_number: applicant.phone_number,
        email: applicant.email,
        prefecture: applicant.prefecture,
        education: applicant.education,
        employment_type: applicant.employment_type,
        industry_experience: applicant.industry_experience,
        job_type_name: (applicant.job_types as unknown as { name: string } | null)?.name ?? null,
        work_history: applicant.work_history,
        qualifications: applicant.qualifications,
        selection_status: applicant.selection_status,
        duplicate_flag: applicant.duplicate_flag,
        inappropriate_flag: applicant.inappropriate_flag,
        created_at: applicant.created_at,
      },
      interview: interview
        ? {
            id: interview.id,
            duration_seconds: interview.duration_seconds,
            question_count: interview.question_count,
            recording_status: interview.recording_status,
            started_at: interview.started_at,
            ended_at: interview.ended_at,
          }
        : null,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { signInterviewToken } from '@/lib/interview/capability-token'

// node:crypto を使うため Node runtime を明示（Edge にしない）
export const runtime = 'nodejs'

// 公開面接フロー: 応募者作成（service-role）＋ ケイパビリティ・トークン発行。
// company_id / status / selection_status / result / flags はサーバが確定する（クライアント値は信用しない）。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    if (!slug) return apiError('VALIDATION_ERROR', 'slug は必須です')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    const supabase = createServiceRoleClient()

    // slug → 企業特定（停止中は受付不可）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')
    if (company.is_suspended) return apiError('FORBIDDEN', '現在、面接の受付を停止しています')

    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v.trim() : null

    // 必須最低限（詳細バリデーションはフォーム側。ここは保存可能性の担保）
    const lastName = str(body.last_name)
    const firstName = str(body.first_name)
    const phone = str(body.phone_number)
    const email = str(body.email)
    if (!lastName || !firstName || !phone || !email) {
      return apiError('VALIDATION_ERROR', '必須項目が不足しています')
    }

    // job_id（任意）は当該企業の求人か検証
    let jobId: string | null = null
    if (body.job_id != null && body.job_id !== '') {
      if (!isValidUUID(body.job_id)) return apiError('VALIDATION_ERROR', 'job_id の形式が不正です')
      const { data: job } = await supabase
        .from('jobs')
        .select('id')
        .eq('id', body.job_id)
        .eq('company_id', company.id)
        .maybeSingle()
      if (!job) return apiError('VALIDATION_ERROR', '指定された求人が見つかりません')
      jobId = body.job_id
    }

    const ageNum =
      typeof body.age === 'number' ? body.age : Number.parseInt(String(body.age ?? ''), 10)

    const insertData = {
      // サーバ確定（クライアント値は使わない）
      company_id: company.id,
      selection_status: 'pending',
      status: '準備中',
      result: '未対応',
      duplicate_flag: false,
      inappropriate_flag: false,
      // 応募者入力
      last_name: lastName,
      first_name: firstName,
      last_name_kana: str(body.last_name_kana) ?? '',
      first_name_kana: str(body.first_name_kana) ?? '',
      birth_date: str(body.birth_date),
      gender: str(body.gender),
      phone_number: phone,
      email,
      age: Number.isFinite(ageNum) ? ageNum : null,
      prefecture: str(body.prefecture),
      education: str(body.education),
      employment_type: str(body.employment_type),
      industry_experience: str(body.industry_experience),
      job_id: jobId,
      work_history: str(body.work_history),
      qualifications: str(body.qualifications),
    }

    const { data: applicant, error: insError } = await supabase
      .from('applicants')
      .insert(insertData)
      .select('id')
      .single()
    if (insError || !applicant) return apiError('INTERNAL_ERROR', '情報の保存に失敗しました')

    const token = signInterviewToken({ slug, applicant_id: applicant.id })
    return successJson({ applicant_id: applicant.id, company_id: company.id, token })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

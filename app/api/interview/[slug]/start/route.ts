import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'

// node:crypto（token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 公開面接フロー: 面接開始（service-role）。ケイパビリティ・トークンで本人のフローだけ許可する。
// 再入場/リロードで in_progress 孤児が増えないよう、開始前に既存 in_progress を cancelled 化する。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    // token 検証（署名・exp）＋ slug / applicant_id の一致
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return apiError('UNAUTHORIZED', 'トークンが無効です')
    if (payload.slug !== slug) return apiError('UNAUTHORIZED', 'トークンが一致しません')
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return apiError('UNAUTHORIZED', 'applicant_id が一致しません')
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

    // applicant 実在＆当該企業所属を検証
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id, job_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // job_id（任意）は当該企業の求人か検証。不正なら null 扱い。
    let jobId: string | null = applicant.job_id ?? null
    if (jobId) {
      const { data: job } = await supabase
        .from('jobs')
        .select('id')
        .eq('id', jobId)
        .eq('company_id', company.id)
        .maybeSingle()
      if (!job) jobId = null
    }

    // 再入場/リロードの in_progress 孤児を cancelled 化（最新の1件だけ in_progress に保つ）
    await supabase
      .from('interviews')
      .update({ status: 'cancelled', ended_at: new Date().toISOString() })
      .eq('applicant_id', applicantId)
      .eq('status', 'in_progress')

    // 新しい面接を開始
    const { data: interview, error: insError } = await supabase
      .from('interviews')
      .insert({
        applicant_id: applicantId,
        company_id: company.id,
        job_id: jobId,
        started_at: new Date().toISOString(),
        status: 'in_progress',
      })
      .select('id')
      .single()
    if (insError || !interview) return apiError('INTERNAL_ERROR', '面接の開始に失敗しました')

    return successJson({ interview_id: interview.id, job_id: jobId, company_id: company.id })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

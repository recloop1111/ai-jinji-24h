import { type NextRequest } from 'next/server'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken, verifySmsVerifiedToken } from '@/lib/interview/capability-token'
import { applyNextMonthLimit, jstCurrentMonthStartIso } from '@/lib/companies/applyNextMonthLimit'

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

    // SMS認証完了トークンを必須化（テスト企業含め素通しさせない）。
    // purpose='sms_verified' / 署名 / exp / slug / applicant_id（applicant token と一致）を検証。company_id は company 取得後に照合。
    // SMS系の 403 は専用コード SMS_VERIFICATION_REQUIRED を返す（クライアントは verify へ戻す判定に使う）。
    // 企業停止/月間上限などのポリシー 403（FORBIDDEN）と区別し、verify↔start の無限ループを防ぐ。
    const smsPayload = verifySmsVerifiedToken(typeof body.sms_token === 'string' ? body.sms_token : null)
    if (!smsPayload) return errorJson('SMS_VERIFICATION_REQUIRED', 'SMS認証が完了していません', 403)
    if (smsPayload.slug !== slug || smsPayload.applicant_id !== applicantId) {
      return errorJson('SMS_VERIFICATION_REQUIRED', 'SMS認証情報が一致しません', 403)
    }

    const supabase = createServiceRoleClient()

    // slug → 企業特定（停止中は受付不可）。月間上限判定用に limit 列も取得。
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended, monthly_interview_limit, next_month_interview_limit, next_month_limit_effective_month')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')
    if (company.is_suspended) return apiError('FORBIDDEN', '現在、面接の受付を停止しています')
    // SMS認証トークンの company_id が当該企業と一致すること（別企業のトークン流用を防止）
    if (smsPayload.company_id !== company.id) return errorJson('SMS_VERIFICATION_REQUIRED', 'SMS認証情報が一致しません', 403)

    // applicant 実在＆当該企業所属を検証。終了状態判定用に status / selection_status も取得。
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id, job_id, status, selection_status')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // 修正1: 終了済みは新規 interview を作らない（古いtoken/戻る/再読み込みでの再作成を防止）。
    //  - applicants.status: 完了 / 途中離脱（abandoned）
    //  - applicants.selection_status: hired / rejected（最終選考確定）
    //  - 既に completed の interview が存在
    const terminalApplicant =
      applicant.status === '完了' ||
      applicant.status === '途中離脱' ||
      applicant.selection_status === 'hired' ||
      applicant.selection_status === 'rejected'
    let hasCompletedInterview = false
    if (!terminalApplicant) {
      const { data: doneInterview } = await supabase
        .from('interviews')
        .select('id')
        .eq('applicant_id', applicantId)
        .eq('status', 'completed')
        .limit(1)
        .maybeSingle()
      hasCompletedInterview = !!doneInterview
    }
    if (terminalApplicant || hasCompletedInterview) {
      return apiError('CONFLICT', 'この面接は既に終了しているため、開始できません')
    }

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

    // 修正2: 月間面接上限の確認（既存ヘルパーで実効上限を取得し、当月の課金対象件数と比較）。
    //  当月件数の定義は admin 企業一覧と同一（is_billable=true ＆ created_at >= 当月初日）。
    const applied = await applyNextMonthLimit({
      id: company.id,
      monthly_interview_limit: company.monthly_interview_limit ?? null,
      next_month_interview_limit: company.next_month_interview_limit ?? null,
      next_month_limit_effective_month: company.next_month_limit_effective_month ?? null,
    })
    const effectiveLimit = applied.monthly_interview_limit
    if (typeof effectiveLimit === 'number' && effectiveLimit > 0) {
      // 月初は JST 基準（applyNextMonthLimit の昇格と同一基準）。サーバTZ(UTC)依存にしない。
      const monthStart = jstCurrentMonthStartIso()
      const { count: monthlyCount, error: countError } = await supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company.id)
        .eq('is_billable', true)
        .gte('created_at', monthStart)
      // 上限カウントの失敗は fail-closed（0件扱いで素通りさせない）。
      // ※ 集計失敗を「使用0」とみなすと上限超過でも開始できてしまうため、非OKで止める。
      if (countError) return apiError('INTERNAL_ERROR', '面接実施数の確認に失敗しました')
      if ((monthlyCount ?? 0) >= effectiveLimit) {
        return apiError('FORBIDDEN', '今月の面接実施数が上限に達しているため、開始できません')
      }
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

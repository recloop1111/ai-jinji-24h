import { type NextRequest, NextResponse } from 'next/server'
import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isEvaluationEnabled, resolveEvaluationModel } from '@/lib/config/evaluation'
import { createProductionEvaluationDependencies } from '@/lib/evaluation/production-dependencies'
import { runInterviewEvaluation, type EvaluationRunResult } from '@/lib/evaluation/orchestration'

// 企業ユーザーが自社応募者の（最新）面接の EBCA 評価を実行する Production route（薄い・gate 最上流）。
// node:crypto 等を使う下位に合わせ Node runtime。応募者本人は起動不可（client 認証 = 企業ユーザー）。
export const runtime = 'nodejs'

// 評価結果 → 安全な HTTP（PII / 内部 error / raw を返さない・code のみ）。
function mapRunResult(r: EvaluationRunResult) {
  switch (r.status) {
    case 'success':
      return successJson({ status: 'success' })
    case 'already_evaluated':
      return successJson({ status: 'already_evaluated' })
    case 'insufficient_data':
      return successJson({ status: 'insufficient_data' })
    case 'conflict':
      return r.reason === 'evaluation_in_progress'
        ? errorJson('EVALUATION_IN_PROGRESS', '評価を実行中です。しばらくしてからお試しください', 409)
        : errorJson('NOT_COMPLETED', '面接が完了していないため評価できません', 409)
    case 'cooldown': {
      // PR-19I: temporary 失敗後の連打抑制。内部 provider error(429/5xx 等) を露出せず非 PII code のみ。
      const retryAfterSeconds = Math.max(1, Math.ceil((r.retryAfterMs ?? 0) / 1000))
      return NextResponse.json(
        { error: { code: 'EVALUATION_COOLDOWN', message: '現在評価処理を再試行できません。少し時間をおいて再度お試しください' }, retry_after_seconds: retryAfterSeconds },
        { status: 429 },
      )
    }
    case 'unauthorized':
      return apiError('FORBIDDEN', 'アクセス権限がありません')
    case 'not_found':
      return apiError('NOT_FOUND', '対象が見つかりません')
    case 'failed':
    default:
      return r.reason === 'lock_error'
        ? errorJson('EVALUATION_FAILED', '評価を開始できませんでした。時間をおいてお試しください', 503)
        : errorJson('EVALUATION_FAILED', '評価に失敗しました。時間をおいてお試しください', 502)
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 1) 最上流ゲート。無効なら auth / service-role / DB read/write / OpenAI いずれにも到達しない。
    if (!isEvaluationEnabled()) {
      return errorJson('EVALUATION_DISABLED', 'AI評価は現在無効です', 503)
    }

    const { id: applicantId } = await params

    // 2) 認証（企業ユーザー）。応募者・未ログインは不可。
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    // 3) tenant 解決: 自社の応募者か（company scope）＋最新面接を service-role で確定（client 入力を信用しない）。
    const supabase = createServiceRoleClient()
    const { data: applicant, error: appErr } = await supabase
      .from('applicants')
      .select('id, company_id')
      .eq('id', applicantId)
      .eq('company_id', user.companyId)
      .maybeSingle()
    if (appErr || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')

    const { data: interview, error: ivErr } = await supabase
      .from('interviews')
      .select('id')
      .eq('applicant_id', applicantId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ivErr || !interview) return apiError('NOT_FOUND', '面接が見つかりません')

    // 4) 本番依存を組み立て（gate ON のときのみ到達）→ orchestration（gate/eligibility/lock/idempotency/provider/save）。
    const deps = createProductionEvaluationDependencies({
      client: supabase,
      fetchImpl: fetch,
      apiKey: process.env.OPENAI_API_KEY ?? null, // server-only。log/response に出さない。
      model: resolveEvaluationModel(),
    })
    const result = await runInterviewEvaluation({
      interviewId: String(interview.id),
      auth: { kind: 'company', companyId: user.companyId }, // tenant は orchestration eligibility でも再確認（二重防御）
      deps,
    })

    return mapRunResult(result)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

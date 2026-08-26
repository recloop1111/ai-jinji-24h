import { type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isEvaluationEnabled } from '@/lib/config/evaluation'
import { resolveEvaluationProvider } from '@/lib/evaluation/provider-resolver'
import { buildProductionEvaluationDeps, runProductionEvaluation } from '@/lib/evaluation/runtime'

// node:crypto（timing-safe比較）を使うため Node runtime
export const runtime = 'nodejs'

// 【R1-A / OpenAI actual = 0（本 PR）】
//   評価パイプラインの本番トリガー route。面接完了後に interview_id を渡して EBCA 評価を実行する。
//   fire-and-forget にしない（Vercel serverless は request 終了後の継続を保証しない）＝明示 route 境界で同期実行。
//   認証: INTERNAL_BATCH_SECRET の Bearer（service-role 実行・secret はログ/レスポンスへ出さない）。
//   fail-closed の多層ガード（この順に確認・いずれか欠ければ provider を構築せず OpenAI を呼ばない）:
//     1) INTERNAL_BATCH_SECRET 認証
//     2) OPENAI_EVALUATION_ENABLED === 'true'（gate。未設定＝OFF＝ここで 503・provider 未構築）
//     3) resolveEvaluationProvider（API Key / model 欠如で provider を返さない）
//   → 本 PR では gate OFF・key 無しのため (2)/(3) で必ず止まり、OpenAI へ到達しない。
//   評価の二重実行防止・lock・cooldown・premature 判定・evidence 検証は orchestration/service（P4/P5）が担う。

function bearerOk(authHeader: string, secret: string | undefined): boolean {
  if (!secret) return false
  const expected = `Bearer ${secret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!bearerOk(authHeader, process.env.INTERNAL_BATCH_SECRET)) {
      return apiError('UNAUTHORIZED', '認証に失敗しました')
    }

    // gate（未設定＝OFF）: provider を構築せず即 503（OpenAI 未到達・DB write なし）。
    if (!isEvaluationEnabled()) {
      return errorJson('EVALUATION_DISABLED', '評価は現在無効です', 503)
    }

    // provider 解決（fail-closed）。gate ON でも API Key/model 欠如なら呼ばない。
    const resolution = resolveEvaluationProvider()
    if (!resolution.ok) {
      return errorJson('EVALUATION_PROVIDER_UNAVAILABLE', '評価プロバイダを利用できません', 503)
    }

    const body = await request.json().catch(() => null)
    const interviewId = body && typeof body === 'object' && typeof (body as Record<string, unknown>).interview_id === 'string'
      ? (body as Record<string, unknown>).interview_id as string
      : ''
    if (!interviewId) return apiError('VALIDATION_ERROR', 'interview_id は必須です')

    const supabase = createServiceRoleClient()
    const deps = buildProductionEvaluationDeps({
      client: supabase as unknown,
      provider: resolution.provider,
      gate: isEvaluationEnabled,
    })
    const result = await runProductionEvaluation({ interviewId, deps })

    // 応募者向けではなく運用向け。非 PII のステータス/理由のみ返す（本文/評価詳細は返さない）。
    return successJson({
      interview_id: interviewId,
      status: result.status,
      reason: result.reason ?? null,
      transcript_hash: result.transcriptHash ?? null,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

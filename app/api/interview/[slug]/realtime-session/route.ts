import { type NextRequest } from 'next/server'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { OPENAI_REALTIME_CLIENT_SECRETS_URL, OPENAI_FETCH_TIMEOUT_MS } from '@/lib/config/openai'
import {
  isRealtimeEnabled,
  resolveRealtimeModel,
  isCompanyAllowed,
  buildRealtimeInstructions,
  buildClientSecretPayload,
} from '@/lib/openai/realtime'

// 公開面接フロー: AI音声面接（OpenAI Realtime GA）のエフェメラル client_secret 発行（service-role）。
// - OPENAI_API_KEY はサーバ専用。ブラウザには短命の client_secret（ek_…）のみ返す。
// - 既定は無効（OPENAI_REALTIME_ENABLED!=='true' or OPENAI_API_KEY 未設定 → 503・OpenAI 未呼び出し）。
// - demo/test 企業・allowlist 外は 403。in_progress かつ本人・当該企業・snapshot 確定済みのみ発行。
// node:crypto（token検証）＋サーバ fetch のため Node runtime。
export const runtime = 'nodejs'

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

    // 1) フィーチャーフラグ（既定 OFF）。無効なら OpenAI を一切呼ばず 503。
    if (!isRealtimeEnabled()) {
      return errorJson('REALTIME_DISABLED', 'AI音声面接は現在無効です', 503)
    }
    // 2) APIキー未設定は fail-closed（呼び出さない）。キーはレスポンス/ログに出さない。
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return errorJson('REALTIME_DISABLED', 'AI音声面接は現在利用できません', 503)
    }

    // 3) capability token（署名/exp）＋ slug / applicant_id の一致
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return apiError('UNAUTHORIZED', 'トークンが無効です')
    if (payload.slug !== slug) return apiError('UNAUTHORIZED', 'トークンが一致しません')
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return apiError('UNAUTHORIZED', 'applicant_id が一致しません')
    }
    const interviewId = typeof body.interview_id === 'string' ? body.interview_id : ''
    if (!interviewId) return apiError('VALIDATION_ERROR', 'interview_id は必須です')

    const supabase = createServiceRoleClient()

    // 4) slug → 企業特定（停止中は不可）。is_demo も取得（ガード用）。
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended, is_demo')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return apiError('NOT_FOUND', '無効な面接URLです')
    if (company.is_suspended) return apiError('FORBIDDEN', '現在、面接の受付を停止しています')

    // 5) demo/test 禁止 ＋ allowlist（設定時のみ限定）。誤って有料APIを呼ばないための多層ガード。
    if (!isCompanyAllowed(company)) {
      return errorJson('REALTIME_DISABLED_FOR_DEMO', 'この企業ではAI音声面接を利用できません', 403)
    }

    // 6) applicant 実在＆当該企業所属
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return apiError('NOT_FOUND', '応募者が見つかりません')
    if (applicant.company_id !== company.id) return apiError('FORBIDDEN', '不正なリクエストです')

    // 7) interview 実在＆applicant 一致＆in_progress のみ（snapshot も取得）
    const { data: interview, error: ivError } = await supabase
      .from('interviews')
      .select('id, applicant_id, status, questions_snapshot')
      .eq('id', interviewId)
      .single()
    if (ivError || !interview) return apiError('NOT_FOUND', '面接が見つかりません')
    if (interview.applicant_id !== applicantId) return apiError('FORBIDDEN', '不正なリクエストです')
    if (interview.status !== 'in_progress') return apiError('CONFLICT', 'この面接は進行中ではありません')

    // 8) 質問 snapshot（凍結）→ instructions。未確定なら OpenAI を呼ばず 409。
    const instructions = buildRealtimeInstructions(interview.questions_snapshot)
    if (!instructions) {
      return errorJson('SNAPSHOT_NOT_READY', '面接質問がまだ準備できていません', 409)
    }

    // 9) OpenAI（GA client_secrets）へエフェメラル発行。beta header は付けない。timeout・no-store。
    const model = resolveRealtimeModel()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OPENAI_FETCH_TIMEOUT_MS)
    let oaRes: Response
    try {
      oaRes = await fetch(OPENAI_REALTIME_CLIENT_SECRETS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildClientSecretPayload({ model, instructions })),
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch {
      // timeout/通信障害。OpenAI の詳細・キーは出さない。
      return errorJson('REALTIME_UPSTREAM_ERROR', 'AI音声面接の初期化に失敗しました', 502)
    } finally {
      clearTimeout(timer)
    }
    if (!oaRes.ok) {
      return errorJson('REALTIME_UPSTREAM_ERROR', 'AI音声面接の初期化に失敗しました', 502)
    }
    const oaJson = (await oaRes.json().catch(() => null)) as
      | { value?: string; expires_at?: number }
      | null
    const clientSecret = oaJson?.value
    if (!clientSecret) {
      return errorJson('REALTIME_UPSTREAM_ERROR', 'AI音声面接の初期化に失敗しました', 502)
    }

    // ブラウザには短命の client_secret（ek_…）＋最小メタのみ返す。APIキー・instructions は返さない。
    return successJson({
      client_secret: clientSecret,
      expires_at: oaJson?.expires_at ?? null,
      model,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

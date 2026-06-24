import { type NextRequest, type NextResponse } from 'next/server'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken, signSmsVerifiedToken } from '@/lib/interview/capability-token'
import { DEMO_COMPANY_ID } from '@/lib/config/demo'

// node:crypto（token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 固定コード '1234' を許可するのは「テスト株式会社の company_id」のときだけ（サーバー側判定）。
// 名前一致や is_demo 全体では判定しない。通常企業は本番 SMS（Twilio Verify）未接続のため一切通さない。
const FIXED_CODE = '1234'

// 固定コードを許可する company_id を環境別に決定する。
// - production: SMS_FIXED_CODE_COMPANY_ID が明示設定されている時のみ許可。未設定なら誰にも許可しない（DEMO へ自動フォールバックしない）。
// - development/test: 既定で DEMO_COMPANY_ID を使ってよい（SMS_FIXED_CODE_COMPANY_ID で上書き可）。
function getFixedCodeCompanyId(): string | null {
  const explicit = process.env.SMS_FIXED_CODE_COMPANY_ID
  if (explicit) return explicit
  if (process.env.NODE_ENV === 'production') return null
  return DEMO_COMPANY_ID
}

function noStore<T extends NextResponse>(res: T): T {
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return noStore(apiError('VALIDATION_ERROR', 'リクエストボディが不正です'))
    }

    // token 検証（署名・exp）＋ slug / applicant_id の一致（body の applicant_id は token と必ず突合）
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return noStore(apiError('UNAUTHORIZED', 'トークンが無効です'))
    if (payload.slug !== slug) return noStore(apiError('UNAUTHORIZED', 'トークンが一致しません'))
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return noStore(apiError('UNAUTHORIZED', 'applicant_id が一致しません'))
    }
    const code = typeof body.code === 'string' ? body.code : ''

    const supabase = createServiceRoleClient()

    // slug → 企業特定（停止中は受付不可）
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return noStore(apiError('NOT_FOUND', '無効な面接URLです'))
    if (company.is_suspended) return noStore(apiError('FORBIDDEN', '現在、面接の受付を停止しています'))

    // applicant 実在＆当該企業所属を再検証（クライアント値は信用しない）
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return noStore(apiError('NOT_FOUND', '応募者が見つかりません'))
    if (applicant.company_id !== company.id) return noStore(apiError('FORBIDDEN', '不正なリクエストです'))

    // 固定コードの許可は「許可された company_id」のときだけ（本番は明示設定が無ければ誰にも許可しない）
    const allowedCompanyId = getFixedCodeCompanyId()
    if (!allowedCompanyId || company.id !== allowedCompanyId) {
      // 通常企業 or 本番未設定: 本番 SMS 未接続。固定コードは絶対に通さない（誤コードと区別できるよう専用コード/503）。
      return noStore(errorJson('SMS_NOT_AVAILABLE', 'SMS認証は現在準備中です', 503))
    }

    if (code === FIXED_CODE) {
      // SMS認証完了の短命トークンを発行（start 側で必須検証する）
      const smsToken = signSmsVerifiedToken({
        slug,
        applicant_id: applicantId,
        company_id: company.id,
      })
      return noStore(successJson({ verified: true, sms_token: smsToken }))
    }
    return noStore(apiError('UNAUTHORIZED', '認証コードが正しくありません'))
  } catch {
    return noStore(apiError('INTERNAL_ERROR'))
  }
}

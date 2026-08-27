import { type NextRequest, type NextResponse } from 'next/server'
import { successJson, apiError, errorJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { verifyInterviewToken } from '@/lib/interview/capability-token'
import { isFixedSmsCodeAllowed } from '@/lib/interview/sms-demo-policy'
import { resolveSmsProvider } from '@/lib/interview/sms/provider'
import { maskPhone } from '@/lib/interview/sms/mask-phone'

// node:crypto（token検証）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 応募者フローの SMS 認証コード「送信」。form の「次へ進む」→ 応募者作成の直後に呼ばれる seam。
//   trust boundary は sms/verify と同一: client の is_demo/company_id を信用せず、server が slug→company を
//   service-role 解決して判定する。
//
// 今回（実 provider 未接続・gate OFF・SMS actual 0）:
//   - demo 企業（is_demo=true）: 実 SMS を送らず、固定コード 1234 を案内する前提で「送信済み」相当の成功
//     （channel:'demo'）を返す。verify 画面で demo 専用 UI を出す。
//   - 通常企業（is_demo=false）: provider 未接続（resolveSmsProvider=null）＝実送信不能なので、
//     honest に 503 SMS_NOT_AVAILABLE を返す（form は /verify へ進めない）。「送信しました」の虚偽を作らない。
//   将来 provider を差し込んだら、通常企業はここで OTP 送信し、成功時に masked_phone を返す（seam は同形）。

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

    // token 検証（署名・exp）＋ slug / applicant_id の一致（body の applicant_id は token と必ず突合）。
    const payload = verifyInterviewToken(typeof body.token === 'string' ? body.token : null)
    if (!payload) return noStore(apiError('UNAUTHORIZED', 'トークンが無効です'))
    if (payload.slug !== slug) return noStore(apiError('UNAUTHORIZED', 'トークンが一致しません'))
    const applicantId = typeof body.applicant_id === 'string' ? body.applicant_id : ''
    if (!applicantId || applicantId !== payload.applicant_id) {
      return noStore(apiError('UNAUTHORIZED', 'applicant_id が一致しません'))
    }

    const supabase = createServiceRoleClient()

    // slug → 企業特定（停止中は受付不可）。is_demo は送信チャネル判定の SoT（server 解決・client 非信用）。
    const { data: company, error: compError } = await supabase
      .from('companies')
      .select('id, is_suspended, is_demo')
      .eq('interview_slug', slug)
      .single()
    if (compError || !company) return noStore(apiError('NOT_FOUND', '無効な面接URLです'))
    if (company.is_suspended) return noStore(apiError('FORBIDDEN', '現在、面接の受付を停止しています'))

    // applicant 実在＆当該企業所属を再検証（クライアント値は信用しない）。送信先 phone も server から取得する。
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('id, company_id, phone_number')
      .eq('id', applicantId)
      .single()
    if (appError || !applicant) return noStore(apiError('NOT_FOUND', '応募者が見つかりません'))
    if (applicant.company_id !== company.id) return noStore(apiError('FORBIDDEN', '不正なリクエストです'))

    // demo 企業: 実 SMS を送らない。固定コード 1234 案内前提の成功を返す（actual SMS 0）。
    if (isFixedSmsCodeAllowed(company)) {
      return noStore(successJson({ sent: true, channel: 'demo' }))
    }

    // 通常企業: 実 provider 解決（gate OFF/未接続なら null＝実送信不能）。
    const provider = resolveSmsProvider()
    if (!provider) {
      // honest: 送っていないのに「送信しました」を作らない。form は /verify へ進めない。
      return noStore(errorJson('SMS_NOT_AVAILABLE', 'SMS認証は現在準備中です', 503))
    }

    // 将来 provider 接続時のみ到達（現在は上の null で必ず 503）。実 OTP 送信＋成功時に masked_phone を返す。
    const result = await provider.sendVerificationCode({ e164: applicant.phone_number ?? '' })
    if (result === 'sent') {
      return noStore(successJson({ sent: true, channel: 'provider', masked_phone: maskPhone(applicant.phone_number ?? '') }))
    }
    if (result === 'invalid_phone') return noStore(apiError('VALIDATION_ERROR', '電話番号の形式が正しくありません'))
    if (result === 'rate_limited') return noStore(errorJson('SMS_RATE_LIMITED', '送信回数の上限に達しました。しばらくしてからお試しください', 429))
    return noStore(errorJson('SMS_NOT_AVAILABLE', 'SMS認証は現在準備中です', 503))
  } catch {
    return noStore(apiError('INTERNAL_ERROR'))
  }
}

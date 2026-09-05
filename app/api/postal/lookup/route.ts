import { type NextRequest, NextResponse } from 'next/server'
import { lookupPostal } from '@/lib/postal/client'

// 外部 HTTP（日本郵便 API）＋ server env の認証情報を扱うため Node runtime を明示。
export const runtime = 'nodejs'
// 郵便番号→住所は都度問い合わせ（キャッシュはトークン側）。静的化しない。
export const dynamic = 'force-dynamic'

// GET /api/postal/lookup?zip=2200012
//   応答は honest: 認証情報未設定/見つからない/上流エラーでも 200 + { available:false, reason } を返し、
//   フロントは手動入力にフォールバックできる（応募をブロックしない）。zip 形式不正のみ 400。
//   client は日本郵便 API を直接叩かない（本 route 経由のみ）。認証情報/トークンは応答にもログにも出さない。
export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get('zip')
  const result = await lookupPostal(zip)
  if (!result.available && result.reason === 'invalid_zip') {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result, { status: 200 })
}

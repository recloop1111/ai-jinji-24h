import { getClientUser } from '@/lib/api/auth'
import { successJson } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// 企業向けの安全なフラグのみを返す（自社のみ）。DB 権威 companies.is_demo を service-role で読み取り、
//   応募者詳細の「利用計上」表示（demo は請求集計除外＝「1件」と誤解させない）に使う。
//   ※ service-role はサーバ側のみ（client へ鍵を出さない）。対象企業は getClientUser の companyId のみ
//     （body/query の company_id は信用しない・tenant scope）。安全な boolean フラグのみ返す。
export async function GET() {
  try {
    const { data: user, error: authError } = await getClientUser()
    if (authError) return authError

    const supabase = createServiceRoleClient()
    const { data: company } = await supabase
      .from('companies')
      .select('is_demo')
      .eq('id', user.companyId)
      .maybeSingle()

    return successJson({ is_demo: company?.is_demo === true })
  } catch {
    // フラグ取得失敗は致命ではない（呼び出し側は demo 不明として安全側に倒す）。
    return successJson({ is_demo: false })
  }
}

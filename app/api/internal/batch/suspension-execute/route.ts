import { type NextRequest } from 'next/server'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // 内部バッチ認証: Authorization ヘッダーでシークレットキーを検証
    const authHeader = request.headers.get('authorization') ?? ''
    const expectedKey = process.env.INTERNAL_BATCH_SECRET
    if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return apiError('UNAUTHORIZED', '認証に失敗しました')
    }

    const supabase = await createClient()
    const now = new Date().toISOString()

    // scheduled_stop_at <= now() かつ status = 'approved' の停止申請を取得
    const { data: requests, error: fetchError } = await supabase
      .from('suspension_requests')
      .select('id, company_id')
      .eq('status', 'approved')
      .lte('scheduled_stop_at', now)

    if (fetchError) {
      return apiError('INTERNAL_ERROR', '停止申請の取得に失敗しました')
    }

    const targets = requests ?? []
    const suspendedCompanies: string[] = []

    for (const req of targets) {
      // 企業を停止状態に変更
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          is_suspended: true,
          updated_at: now,
        })
        .eq('id', req.company_id)

      if (updateError) continue

      // 停止申請ステータスを executed に更新
      await supabase
        .from('suspension_requests')
        .update({ status: 'executed', executed_at: now })
        .eq('id', req.id)

      suspendedCompanies.push(req.company_id)
    }

    return successJson({ suspended_companies: suspendedCompanies })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

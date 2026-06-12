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

    // 予定停止日カラムが無いため、申請日（created_at）の1ヶ月後に達した通常停止を対象とする
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 1)
    const cutoffIso = cutoff.toISOString()

    // request_type='temporary' かつ status='pending' かつ created_at <= (現在 - 1ヶ月) の停止申請を取得
    const { data: requests, error: fetchError } = await supabase
      .from('suspension_requests')
      .select('id, company_id')
      .eq('request_type', 'temporary')
      .eq('status', 'pending')
      .lte('created_at', cutoffIso)

    if (fetchError) {
      return apiError('INTERNAL_ERROR', '停止申請の取得に失敗しました')
    }

    const targets = requests ?? []
    const suspendedCompanies: string[] = []

    for (const req of targets) {
      // 企業を停止状態に変更（停止状態の正は companies.is_suspended に統一）
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          is_suspended: true,
          updated_at: now,
        })
        .eq('id', req.company_id)

      if (updateError) continue

      // 停止処理済みとして status='approved' に更新（CHECK 制約上 'executed' は使用不可。再実行対象から外れる）
      await supabase
        .from('suspension_requests')
        .update({ status: 'approved' })
        .eq('id', req.id)

      suspendedCompanies.push(req.company_id)
    }

    return successJson({ suspended_companies: suspendedCompanies })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/

export async function POST(request: NextRequest) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const body = await request.json().catch(() => null)
    if (!body) {
      return apiError('VALIDATION_ERROR', 'リクエストボディが不正です')
    }

    if (typeof body.ip_address !== 'string' || !IP_REGEX.test(body.ip_address)) {
      return apiError('VALIDATION_ERROR', 'ip_address の形式が不正です（例: 192.168.1.1）')
    }
    if (typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      return apiError('VALIDATION_ERROR', 'reason は必須です')
    }
    if (body.reason.trim().length > 500) {
      return apiError('VALIDATION_ERROR', 'reason は500文字以内で入力してください')
    }

    const supabase = await createClient()

    // 重複チェック
    const { data: existing } = await supabase
      .from('ip_blocks')
      .select('id')
      .eq('ip_address', body.ip_address)
      .limit(1)
      .single()

    if (existing) {
      return apiError('CONFLICT', 'このIPアドレスは既にブロックされています')
    }

    const { data: blocked, error: insertError } = await supabase
      .from('ip_blocks')
      .insert({
        ip_address: body.ip_address,
        reason: body.reason.trim(),
      })
      .select('id, ip_address, reason, created_at')
      .single()

    if (insertError || !blocked) {
      return apiError('INTERNAL_ERROR', 'IPブロックの追加に失敗しました')
    }

    return successJson({
      id: blocked.id,
      ip_address: blocked.ip_address,
      reason: blocked.reason,
      blocked_at: blocked.created_at,
    }, 201)
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

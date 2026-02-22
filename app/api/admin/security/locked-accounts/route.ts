import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const supabase = await createClient()

    const { data: accounts, error } = await supabase
      .from('locked_accounts')
      .select('id, lock_type, identifier, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      return apiError('INTERNAL_ERROR', 'ロック済みアカウントの取得に失敗しました')
    }

    const items = (accounts ?? []).map((a) => ({
      id: a.id,
      lock_type: a.lock_type,
      identifier: a.identifier,
      locked_at: a.created_at,
    }))

    return successJson({ locked_accounts: items })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

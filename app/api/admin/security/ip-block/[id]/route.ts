import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'
import { isValidUUID } from '@/lib/api/validation'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { data: _admin, error: authError } = await getAdminUser()
    if (authError) return authError

    const { id } = await params
    if (!isValidUUID(id)) {
      return apiError('VALIDATION_ERROR', 'IDの形式が不正です')
    }

    const supabase = await createClient()

    const { error: deleteError } = await supabase
      .from('ip_blocks')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return apiError('INTERNAL_ERROR', 'IPブロックの解除に失敗しました')
    }

    return successJson({ deleted: true })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

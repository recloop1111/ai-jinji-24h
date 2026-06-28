import { getAdminUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'

// admin 画面の共通 role ガード用。admin / super_admin なら 200 + { role }、それ以外は 401/403。
// 判定は getAdminUser()（cookie認証 + service-role で profiles.role 確認）を正として流用。
export async function GET() {
  const { data, error } = await getAdminUser()
  if (error || !data) return error ?? apiError('UNAUTHORIZED')
  return successJson({ userId: data.userId, role: data.role })
}

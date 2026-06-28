import { getClientUser } from '@/lib/api/auth'
import { successJson, apiError } from '@/lib/api/response'

// client 画面の共通 所属ガード用。企業に紐づくユーザーなら 200 + { companyId }、
// 未ログインは 401、ログイン済みだが企業所属でない（＝運営など）は 403。
// 判定は getClientUser()（cookie認証 + service-role で profiles.company_id 確認）を正として流用。
export async function GET() {
  const { data, error } = await getClientUser()
  if (error || !data) return error ?? apiError('UNAUTHORIZED')
  return successJson({ userId: data.userId, companyId: data.companyId })
}

import { redirect } from 'next/navigation'
import { getClientUser } from '@/lib/api/auth'
import { can } from '@/lib/rbac/permissions'
import BillingClient from './BillingClient'

// 請求履歴（Server Component ガード）。billing.read（OWNER/ADMIN）のみ到達可。
//   URL 直打ちでも、請求データを取得する前にサーバーで権限判定し、権限不足は /client/dashboard へ返す。
//   認証失敗（未ログイン/企業未所属）と権限不足を区別する（前者は login、後者は dashboard）。
//   ※ UI 非表示だけに依存しない多層防御: この page guard ＋ API guard ＋ RLS。
export default async function BillingPage() {
  const { data: user, error } = await getClientUser()
  if (error || !user) redirect('/client/login')
  if (!can(user.companyRole, 'billing.read')) redirect('/client/dashboard')
  return <BillingClient />
}

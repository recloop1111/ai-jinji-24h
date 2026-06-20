import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/api/auth'
import AdminDashboardShell from './AdminDashboardShell'

// 運営管理画面（/admin/(dashboard)/**）のサーバー側到達ガード（Server Component）。
// children を生成する前にサーバーで getAdminUser()（cookie認証 + service-role で profiles.role 確認）を実行し、
// 未ログイン・運営権限なし（企業アカウント等）は redirect() で /admin/login へ返す。
// → 企業アカウントは運営画面に到達できない。自動 signOut() はしない（共有 cookie を破棄しないため。
//    明示ログアウトは Shell の handleLogout で行う）。/admin/login は (dashboard) グループ外でガード対象外＝ループしない。
// API 側（getAdminUser）の認可も従来どおり残し二重防御。service-role は本サーバーコンポーネント内のみ（Edge/ブラウザ非経由）。
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const { error } = await getAdminUser()
  if (error) {
    redirect('/admin/login')
  }

  return <AdminDashboardShell>{children}</AdminDashboardShell>
}

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getClientUser } from '@/lib/api/auth'
import ClientDashboardShell from './ClientDashboardShell'
import { DEMO_COOKIE_NAME } from '@/lib/config/demo'

// 企業管理画面（/client/(dashboard)/**）のサーバー側到達ガード（Server Component）。
// children を生成する前にサーバーで getClientUser()（cookie認証 + service-role で profiles.company_id 確認）を実行し、
// 未ログイン・企業未所属（運営アカウント等）は redirect() で /client/login へ返す。
// → 運営アカウントは企業画面に到達できない。自動 signOut() はしない。
// /client/login は (dashboard) グループ外でガード対象外＝ループしない。
// API 側（getClientUser）の認可も従来どおり残し二重防御。service-role は本サーバーコンポーネント内のみ。
//
// 開発用デモ: 通常の開発ログインも getClientUser でサーバー検証する（無条件バイパスしない）。
// デモは「dev かつ サーバ判別可能な明示 cookie（middleware が ?demo=true 時に dev限定で発行）」のときだけ例外許可。
// 本番（NODE_ENV==='production'）では cookie を見ても必ず無効。sessionStorage は認証根拠にしない。
// デモは実セッションを持たないため保護API（getClientUser）と RLS により実企業データへは到達できない。
export default async function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  const { error } = await getClientUser()
  if (error) {
    const demoAllowed =
      process.env.NODE_ENV !== 'production' &&
      (await cookies()).get(DEMO_COOKIE_NAME)?.value === '1'
    if (!demoAllowed) {
      redirect('/client/login')
    }
  }

  return <ClientDashboardShell>{children}</ClientDashboardShell>
}

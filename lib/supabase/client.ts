import { createBrowserClient } from '@supabase/ssr'
import { ADMIN_AUTH_STORAGE_KEY, CLIENT_AUTH_STORAGE_KEY } from '@/lib/config/auth-cookies'

// 運営(admin)/企業(client) のブラウザ用 Supabase クライアントを **完全分離** する。
// それぞれ別の cookie（cookieOptions.name）を使うため、同一ブラウザで同時ログインできる。
//
// 重要: @supabase/ssr の createBrowserClient は既定でグローバル singleton を返す。
//   cookie 名だけ変えても同じ cached インスタンスが返る事故を防ぐため、両方に必ず
//   `isSingleton: false` を指定する。
function makePortalBrowserClient(storageKey: string) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      // sameSite=lax / secure（本番=https のみ。dev は http のため無効）を明示。
      // httpOnly は付けない: ブラウザ側 Supabase クライアントが document.cookie からセッションを読むため
      //   HttpOnly にすると client/admin のブラウザ直クエリが anon 化して壊れる（受容リスク・docs記録）。
      cookieOptions: {
        name: storageKey,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  )
}

// 運営管理画面（/admin/**）専用。admin cookie だけを読み書きする。
export function createAdminBrowserClient() {
  return makePortalBrowserClient(ADMIN_AUTH_STORAGE_KEY)
}

// 企業管理画面（/client/**）専用。client cookie だけを読み書きする。
export function createClientBrowserClient() {
  return makePortalBrowserClient(CLIENT_AUTH_STORAGE_KEY)
}

// 旧 default cookie を使う汎用ブラウザクライアント（公開フロー等の互換用）。
// ポータル領域（admin/client）では使わない。新しい認証 cookie とは別物。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

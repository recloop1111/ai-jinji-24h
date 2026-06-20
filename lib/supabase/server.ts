import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { ADMIN_AUTH_STORAGE_KEY, CLIENT_AUTH_STORAGE_KEY } from '@/lib/config/auth-cookies'

/**
 * Service Role Key を使用するサーバー専用クライアント。
 * RLS をバイパスし、auth.admin API が利用可能。
 * API Route の管理者操作でのみ使用すること。
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ポータル別のサーバー用 cookie バウンド クライアントを生成する。
// storageKey（cookieOptions.name）で読み書きする cookie を限定するため、
// admin server client は admin cookie だけ、client server client は client cookie だけを扱う。
async function createPortalServerClient(storageKey: string | undefined) {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(storageKey ? { cookieOptions: { name: storageKey } } : {}),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component からの呼び出し時は無視
          }
        },
      },
    }
  )
}

// 運営管理画面/API（/admin/**）専用。admin cookie セッションのみを読む。
export async function createAdminServerClient() {
  return createPortalServerClient(ADMIN_AUTH_STORAGE_KEY)
}

// 企業管理画面/API（/client/**）専用。client cookie セッションのみを読む。
export async function createClientServerClient() {
  return createPortalServerClient(CLIENT_AUTH_STORAGE_KEY)
}

// 旧 default cookie を使う汎用サーバークライアント（内部バッチ等の互換用）。
// ポータル領域（admin/client）では使わない。
export async function createClient() {
  return createPortalServerClient(undefined)
}

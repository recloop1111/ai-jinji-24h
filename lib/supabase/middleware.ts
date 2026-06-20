import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

// ポータル別にセッションを refresh/取得する。storageKey（cookieOptions.name）を指定すると、
// その cookie だけを読み書きする（admin は admin cookie、client は client cookie）。
// storageKey 未指定（公開フロー等）は旧 default cookie を扱う。
// 別ポータルの cookie やデモ cookie はこのクライアントの対象外なので削除・上書きしない。
export async function updateSession(
  request: NextRequest,
  storageKey?: string,
): Promise<{
  response: NextResponse
  user: User | null
}> {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(storageKey ? { cookieOptions: { name: storageKey } } : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response: supabaseResponse, user }
}

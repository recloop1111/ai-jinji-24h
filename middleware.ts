import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { ADMIN_AUTH_STORAGE_KEY, CLIENT_AUTH_STORAGE_KEY } from '@/lib/config/auth-cookies'
import { DEMO_COOKIE_NAME, DEMO_COOKIE_VALUE } from '@/lib/config/demo'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // 公開フロー（応募者）: 旧 default cookie のまま維持。admin/client セッションには触れない。
  if (path.startsWith('/interview/')) {
    const { response } = await updateSession(request)
    return response
  }

  // 運営管理（/admin/**）: admin cookie だけを refresh/検証。client/デモ cookie は触らない。
  if (path.startsWith('/admin/')) {
    const { response, user } = await updateSession(request, ADMIN_AUTH_STORAGE_KEY)
    if (path === '/admin/login') return response
    if (!user) {
      const redirectUrl = new URL('/admin/login', request.url)
      const redir = NextResponse.redirect(redirectUrl)
      response.cookies.getAll().forEach(({ name, value }) => redir.cookies.set(name, value))
      return redir
    }
    return response
  }

  // 企業管理（/client/**）: client cookie だけを refresh/検証。admin cookie は触らない。
  if (path.startsWith('/client/')) {
    const { response, user } = await updateSession(request, CLIENT_AUTH_STORAGE_KEY)
    if (path === '/client/login') return response

    const demoAllowed = process.env.NODE_ENV !== 'production'
    // dev のみ: ?demo=true を「サーバ判別可能な cookie」に変換しクリーンURLへ（初回ブートストラップ）。
    if (demoAllowed && request.nextUrl.searchParams.get('demo') === 'true') {
      const cleanUrl = request.nextUrl.clone()
      cleanUrl.searchParams.delete('demo')
      const redir = NextResponse.redirect(cleanUrl)
      response.cookies.getAll().forEach(({ name, value }) => redir.cookies.set(name, value))
      redir.cookies.set(DEMO_COOKIE_NAME, DEMO_COOKIE_VALUE, { sameSite: 'lax', path: '/' })
      return redir
    }
    const hasDemoCookie = demoAllowed && request.cookies.get(DEMO_COOKIE_NAME)?.value === DEMO_COOKIE_VALUE
    if (hasDemoCookie || user) {
      return response
    }
    const redirectUrl = new URL('/client/login', request.url)
    const redir = NextResponse.redirect(redirectUrl)
    response.cookies.getAll().forEach(({ name, value }) => redir.cookies.set(name, value))
    return redir
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/client/:path*',
    '/admin/:path*',
    '/interview/:path*',
  ],
}

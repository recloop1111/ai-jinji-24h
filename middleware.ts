import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { DEMO_COOKIE_NAME, DEMO_COOKIE_VALUE } from '@/lib/config/demo'

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const path = request.nextUrl.pathname

  // ログイン不要
  if (path === '/client/login' || path === '/admin/login') {
    return response
  }
  if (path.startsWith('/interview/')) {
    return response
  }

  const demoAllowed = process.env.NODE_ENV !== 'production'

  // /client/* : 開発デモ（dev限定・サーバ判別可能な cookie）またはセッションありならそのまま。
  // 本番（NODE_ENV==='production'）では cookie も ?demo=true も無視し、必ずセッションを要求する。
  if (path.startsWith('/client/')) {
    // dev のみ: ?demo=true を「サーバ判別可能な cookie」に変換し、クリーンURLへ。
    // 以後 cookie が真の判定根拠（sessionStorage に依存しない）。初回ブートストラップ。
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
    const redirectResponse = NextResponse.redirect(redirectUrl)
    response.cookies.getAll().forEach(({ name, value }) => redirectResponse.cookies.set(name, value))
    return redirectResponse
  }

  // /admin/* : セッションがなければログインへ
  if (path.startsWith('/admin/')) {
    if (!user) {
      const redirectUrl = new URL('/admin/login', request.url)
      const redirectResponse = NextResponse.redirect(redirectUrl)
      response.cookies.getAll().forEach(({ name, value }) => redirectResponse.cookies.set(name, value))
      return redirectResponse
    }
    return response
  }

  return response
}

export const config = {
  matcher: [
    '/client/:path*',
    '/admin/:path*',
    '/interview/:path*',
  ],
}

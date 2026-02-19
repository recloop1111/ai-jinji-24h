import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

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

  // /client/* : デモモードまたはセッションありならそのまま
  if (path.startsWith('/client/')) {
    const isDemo = request.nextUrl.searchParams.get('demo') === 'true'
    if (isDemo || user) {
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

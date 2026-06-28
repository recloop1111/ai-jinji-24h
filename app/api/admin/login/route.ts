import { type NextRequest } from 'next/server'
import { processLogin } from '@/lib/auth/login-handler'

// node:crypto（HMAC）を使うため Node runtime
export const runtime = 'nodejs'

// 運営（admin）サーバー側ログイン。ブラウザ直 signInWithPassword は廃止し本APIへ。
export async function POST(request: NextRequest) {
  return processLogin(request, 'admin')
}

import { NextResponse } from 'next/server'

// --- 統一エラーコード ---
export const ERROR_CODES = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401, message: '認証が必要です' },
  FORBIDDEN: { code: 'FORBIDDEN', status: 403, message: 'アクセス権限がありません' },
  NOT_FOUND: { code: 'NOT_FOUND', status: 404, message: 'リソースが見つかりません' },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400, message: '入力値が不正です' },
  RATE_LIMITED: { code: 'RATE_LIMITED', status: 429, message: 'リクエスト制限を超えました。しばらく経ってから再試行してください' },
  INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: 'サーバー内部エラーが発生しました' },
  CONFLICT: { code: 'CONFLICT', status: 409, message: 'リソースが競合しています' },
} as const

type ErrorCodeKey = keyof typeof ERROR_CODES

// --- 成功レスポンス ---
export function successJson<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

// --- エラーレスポンス（カスタムメッセージ） ---
export function errorJson(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  )
}

// --- 定義済みエラーレスポンス（メッセージ上書き可） ---
export function apiError(key: ErrorCodeKey, message?: string) {
  const def = ERROR_CODES[key]
  return errorJson(def.code, message ?? def.message, def.status)
}

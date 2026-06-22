import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

// クライアントIP抽出（サーバ専用 / ホスティング = Vercel 前提）。
// 信頼できるのは「プラットフォームが付与するヘッダ」のみ:
//   1. x-vercel-forwarded-for … Vercel のみが設定（最も信頼できる）
//   2. x-real-ip               … Vercel が設定するクライアントIP
// クライアントが任意設定できる x-forwarded-for は無条件に信用せず、上記が無い場合の
// フォールバックとして「先頭値」だけを参考にする（Vercel は受信XFFを上書きするため通常は安全）。
//
// いずれも得られない場合は per-request の一意値を返し、IP不明な全利用者が同一 scope に
// 集約されて巻き添えブロックされるのを防ぐ（IP単位スロットルは補助・account単位が主）。
export function getClientIp(request: NextRequest): string {
  const vercel = request.headers.get('x-vercel-forwarded-for')
  if (vercel && vercel.trim()) return vercel.split(',')[0]!.trim()

  const realIp = request.headers.get('x-real-ip')
  if (realIp && realIp.trim()) return realIp.trim()

  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }

  // IP 不明: 集約を避けるため per-request 一意（IP単位スロットルは実質無効・account単位で保護）
  return `unknown-${randomUUID()}`
}

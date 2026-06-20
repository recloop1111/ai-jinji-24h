'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CLIENT_DEMO_ENABLED, DEMO_COMPANY_ID, hasDemoCookie } from '@/lib/config/demo'

// 後方互換のための再エクスポート（既存 import 元向け）。デモ判定の正は lib/config/demo。
export { CLIENT_DEMO_ENABLED } from '@/lib/config/demo'

/**
 * 企業側ページ共通の companyId 取得フック。
 * - デモモード（開発専用）: middleware が dev・?demo=true 時に発行する cookie（hasDemoCookie）で判定し、
 *   DEMO_COMPANY_ID を返す。sessionStorage は使わない。本番（CLIENT_DEMO_ENABLED=false）では常に無効。
 *   デモは実セッションを持たないため /api/client/company は呼ばず、保護API・実企業データへは到達しない。
 * - 実ログイン: /api/client/company（service role 経由）から companyId を取得する。
 */
export function useCompanyId(): {
  companyId: string | null
  loading: boolean
  error: string | null
} {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function resolveCompanyId() {
      // デモモード判定: サーバ判別可能な cookie（dev のみ・本番無効）
      if (CLIENT_DEMO_ENABLED && hasDemoCookie()) {
        if (!cancelled) {
          setCompanyId(DEMO_COMPANY_ID)
          setError(null)
          setLoading(false)
        }
        return
      }

      // 実ログイン: /api/client/company から取得（service role 経由で RLS をバイパス）
      try {
        const res = await fetch('/api/client/company')
        if (cancelled) return
        if (res.status === 401) {
          // 未ログイン かつ demo なし: ログイン画面へ誘導（loading のまま遷移）
          router.replace('/client/login')
          return
        }
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          setError(json?.error?.message ?? '企業情報を取得できませんでした')
          setCompanyId(null)
          setLoading(false)
          return
        }
        const json = await res.json()
        if (cancelled) return
        if (json?.id) {
          setCompanyId(json.id)
          setError(null)
        } else {
          setCompanyId(null)
          setError('企業情報を取得できませんでした')
        }
        setLoading(false)
      } catch {
        if (cancelled) return
        setCompanyId(null)
        setError('企業情報を取得できませんでした')
        setLoading(false)
      }
    }

    resolveCompanyId()
    return () => {
      cancelled = true
    }
  }, [router])

  return { companyId, loading, error }
}

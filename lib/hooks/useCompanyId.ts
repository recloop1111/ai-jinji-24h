'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

const DEMO_COMPANY_ID = '7a58cc1b-9f81-4da5-ae2c-fd3abea05c33'
export const DEMO_STORAGE_KEY = 'client_demo_mode'

/**
 * 企業側ページ共通の companyId 取得フック。
 * - デモモード: URL の ?demo=true もしくは sessionStorage 保存済みフラグで判定し、DEMO_COMPANY_ID を返す。
 *   一度デモモードに入るとサイドバー遷移で ?demo=true が落ちても sessionStorage で維持される。
 * - 実ログイン: /api/client/company（service role 経由）から companyId を取得する。
 *   anon クライアントの profiles 直クエリは RLS でブロックされ得るため使用しない。
 */
export function useCompanyId(): {
  companyId: string | null
  loading: boolean
  error: string | null
} {
  const searchParams = useSearchParams()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    // デモモード判定: URL ?demo=true もしくは sessionStorage に保存済み
    const urlDemo = searchParams.get('demo') === 'true'
    const storedDemo =
      typeof window !== 'undefined' && sessionStorage.getItem(DEMO_STORAGE_KEY) === 'true'
    if (urlDemo && typeof window !== 'undefined') {
      sessionStorage.setItem(DEMO_STORAGE_KEY, 'true')
    }
    if (urlDemo || storedDemo) {
      setCompanyId(DEMO_COMPANY_ID)
      setError(null)
      setLoading(false)
      return
    }

    // 実ログイン: /api/client/company から取得（service role 経由で RLS をバイパス）
    async function fetchCompanyId() {
      try {
        const res = await fetch('/api/client/company')
        if (cancelled) return
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

    fetchCompanyId()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  return { companyId, loading, error }
}

'use client'

// 企業ユーザーの companyRole を /api/client/me から取得し、can(permission) を提供する最小フック（Phase E-5-2）。
//   ※ security の正はサーバ route / RLS。これは「VIEWER に押せないボタンを見せ続けない」ための UI 補助。
//   ※ role 解決前（loading）は write/export を出さない（false 側）＝ちらつきで一瞬でも操作させない。
import { useEffect, useState } from 'react'
import { can as canFor, type Permission } from './permissions'
import type { CompanyRole } from './roles'

export function useCompanyPermissions() {
  const [role, setRole] = useState<CompanyRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/client/me', { cache: 'no-store' })
        if (!res.ok) { if (alive) { setRole(null); setLoading(false) } return }
        const data = await res.json()
        if (alive) { setRole((data?.companyRole ?? null) as CompanyRole | null); setLoading(false) }
      } catch {
        if (alive) { setRole(null); setLoading(false) }
      }
    })()
    return () => { alive = false }
  }, [])

  // loading 中や role 不明は false（default deny）。
  const can = (permission: Permission) => (loading ? false : canFor(role, permission))
  return { role, loading, can }
}

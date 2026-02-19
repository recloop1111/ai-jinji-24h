'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DEMO_COMPANY_ID = '7a58cc1b-9f81-4da5-ae2c-fd3abea05c33'

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
    const isDemo = typeof window !== 'undefined' && searchParams.get('demo') === 'true'
    if (isDemo) {
      setCompanyId(DEMO_COMPANY_ID)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function fetchCompanyId() {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      console.log('Auth user:', user, 'Error:', userError)

      if (cancelled) return
      if (userError) {
        setError(userError.message)
        setCompanyId(null)
        setLoading(false)
        return
      }
      if (!user) {
        setCompanyId(null)
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()
      console.log('Profile:', profile, 'Error:', profileError)
      console.log('Company ID:', profile?.company_id)

      if (cancelled) return
      if (profileError || !profile?.company_id) {
        setError(profileError?.message ?? '企業情報を取得できませんでした')
        setCompanyId(null)
        setLoading(false)
        return
      }

      setCompanyId(profile.company_id)
      setError(null)
      setLoading(false)
    }

    fetchCompanyId()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  return { companyId, loading, error }
}

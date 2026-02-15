'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ClientLayout from '../components/ClientLayout'
import { TemplatesProvider } from '../contexts/TemplatesContext'

// TODO: Supabase認証実装後に false に変更
const SKIP_AUTH_CHECK = true

export default function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      if (SKIP_AUTH_CHECK) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/client/login')
        return
      }
    }
    checkAuth()
  }, [router])

  return (
    <ClientLayout>
      <TemplatesProvider>{children}</TemplatesProvider>
    </ClientLayout>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Users, FileText, AlertTriangle } from 'lucide-react'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ companies: 0, active: 0, suspended: 0, totalJobs: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient()
      const { data: companies } = await supabase.from('companies').select('id, is_suspended, is_active')
      const { data: jobs } = await supabase.from('jobs').select('id')

      if (companies) {
        const active = companies.filter((c: any) => !c.is_suspended && c.is_active !== false).length
        const suspended = companies.filter((c: any) => c.is_suspended).length
        setStats({
          companies: companies.length,
          active,
          suspended,
          totalJobs: jobs?.length || 0,
        })
      }
      setLoading(false)
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
        <p className="text-sm text-gray-400 mt-1">システム全体の概要</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <Building2 className="absolute top-4 right-4 w-8 h-8 text-blue-400/50" />
          <p className="text-3xl font-bold text-white">{stats.companies}</p>
          <p className="text-sm text-gray-400 mt-0.5">契約企業数</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <Users className="absolute top-4 right-4 w-8 h-8 text-emerald-400/50" />
          <p className="text-3xl font-bold text-white">{stats.active}</p>
          <p className="text-sm text-gray-400 mt-0.5">アクティブ企業</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <AlertTriangle className="absolute top-4 right-4 w-8 h-8 text-red-400/50" />
          <p className="text-3xl font-bold text-white">{stats.suspended}</p>
          <p className="text-sm text-gray-400 mt-0.5">停止中企業</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <FileText className="absolute top-4 right-4 w-8 h-8 text-purple-400/50" />
          <p className="text-3xl font-bold text-white">{stats.totalJobs}</p>
          <p className="text-sm text-gray-400 mt-0.5">登録求人数</p>
        </div>
      </div>

      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-2">お知らせ</h2>
        <p className="text-sm text-gray-400">応募者管理、課金管理、詳細な統計情報は今後のアップデートで追加されます。</p>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Building2, Users, FileText, AlertTriangle, CheckCircle, Clock, BarChart3, Phone, Mail } from 'lucide-react'

type RecentApplicant = {
  id: string
  name: string
  email: string
  phone: string
  company_name: string
  status: string
  total_score: number | null
  created_at: string
}

function getStatusConfig(status: string): { dotClass: string; textClass: string; label: string } {
  const map: Record<string, { dotClass: string; textClass: string; label: string }> = {
    '完了': { dotClass: 'bg-emerald-400', textClass: 'text-emerald-400', label: '完了' },
    '準備中': { dotClass: 'bg-amber-400', textClass: 'text-amber-400', label: '準備中' },
    '途中離脱': { dotClass: 'bg-red-400', textClass: 'text-red-400', label: '途中離脱' },
  }
  return map[status] ?? { dotClass: 'bg-gray-500', textClass: 'text-gray-500', label: status }
}

function getScoreBadgeClass(score: number | null): string {
  if (score === null) return ''
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
  if (score >= 60) return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
  if (score >= 40) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
  return 'bg-red-500/10 text-red-400 border border-red-500/20'
}

export default function AdminDashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    companies: 0,
    active: 0,
    suspended: 0,
    totalJobs: 0,
    totalApplicants: 0,
    completedInterviews: 0,
    waitingInterviews: 0,
    avgScore: '—',
    withdrawnCount: 0,
    withdrawnPercent: '0',
  })
  const [recentApplicants, setRecentApplicants] = useState<RecentApplicant[]>([])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const { data: companies } = await supabase.from('companies').select('id, name, is_suspended, is_active')
        const { data: jobs } = await supabase.from('jobs').select('id')
        const { data: applicantsData } = await supabase
          .from('applicants')
          .select('*')
          .order('created_at', { ascending: false })

        const { data: resultsData } = await supabase
          .from('interview_results')
          .select('applicant_id, total_score')

        const resultsMap: Record<string, any> = {}
        if (resultsData) {
          resultsData.forEach((r: any) => {
            resultsMap[r.applicant_id] = r
          })
        }

        const companiesMap: Record<string, string> = {}
        if (companies) {
          companies.forEach((c: any) => {
            companiesMap[c.id] = c.name
          })
        }

        const applicants = applicantsData || []
        const totalApplicants = applicants.length
        const completedInterviews = applicants.filter((a: any) => a.status === '完了').length
        const waitingInterviews = applicants.filter((a: any) => a.status === '準備中').length
        const withdrawnCount = applicants.filter((a: any) => a.status === '途中離脱').length
        const withdrawnPercent = totalApplicants > 0 ? ((withdrawnCount / totalApplicants) * 100).toFixed(1) : '0'

        const completedWithScore = applicants
          .filter((a: any) => a.status === '完了' && resultsMap[a.id]?.total_score != null)
          .map((a: any) => resultsMap[a.id].total_score)
        const avgScore = completedWithScore.length > 0
          ? (completedWithScore.reduce((sum: number, s: number) => sum + s, 0) / completedWithScore.length).toFixed(1)
          : '—'

        const active = companies ? companies.filter((c: any) => !c.is_suspended && c.is_active !== false).length : 0
        const suspended = companies ? companies.filter((c: any) => c.is_suspended).length : 0

        setStats({
          companies: companies?.length || 0,
          active,
          suspended,
          totalJobs: jobs?.length || 0,
          totalApplicants,
          completedInterviews,
          waitingInterviews,
          avgScore,
          withdrawnCount,
          withdrawnPercent,
        })

        const recent: RecentApplicant[] = applicants.slice(0, 10).map((a: any) => ({
          id: a.id,
          name: `${a.last_name || ''} ${a.first_name || ''}`.trim() || a.name || '名前不明',
          email: a.email || '',
          phone: a.phone || '',
          company_name: companiesMap[a.company_id] || '不明',
          status: a.status || '準備中',
          total_score: resultsMap[a.id]?.total_score ?? null,
          created_at: a.created_at,
        }))
        setRecentApplicants(recent)
      } catch (err: any) {
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [supabase])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

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

      {/* 企業統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <Building2 className="absolute top-4 right-4 w-8 h-8 text-blue-400/50" />
          <p className="text-3xl font-bold text-white">{stats.companies}</p>
          <p className="text-sm text-gray-400 mt-0.5">契約企業数</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <CheckCircle className="absolute top-4 right-4 w-8 h-8 text-emerald-400/50" />
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

      {/* 応募者統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <Users className="absolute top-4 right-4 w-8 h-8 text-blue-400/50" />
          <p className="text-3xl font-bold text-white">{stats.totalApplicants}</p>
          <p className="text-sm text-gray-400 mt-0.5">全応募者数</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <CheckCircle className="absolute top-4 right-4 w-8 h-8 text-emerald-400/50" />
          <p className="text-3xl font-bold text-white">{stats.completedInterviews}</p>
          <p className="text-sm text-gray-400 mt-0.5">面接完了</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <Clock className="absolute top-4 right-4 w-8 h-8 text-amber-400/50" />
          <p className="text-3xl font-bold text-white">{stats.waitingInterviews}</p>
          <p className="text-sm text-gray-400 mt-0.5">面接待ち</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <BarChart3 className="absolute top-4 right-4 w-8 h-8 text-purple-400/50" />
          <p className="text-3xl font-bold text-white">{stats.avgScore}</p>
          <p className="text-sm text-gray-400 mt-0.5">平均スコア</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden">
          <AlertTriangle className="absolute top-4 right-4 w-8 h-8 text-red-400/50" />
          <p className="text-3xl font-bold text-white">{stats.withdrawnCount}</p>
          <p className="text-sm text-gray-400 mt-0.5">途中離脱</p>
          <p className="text-xs text-red-400 mt-1">全体の{stats.withdrawnPercent}%</p>
        </div>
      </div>

      {/* 直近の応募者一覧 */}
      <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">直近の応募者</h2>
          <Link href="/admin/applicants" className="text-sm text-blue-400 hover:text-blue-300">
            すべて表示 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-5 text-left">応募者名</th>
                <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-5 text-left">企業名</th>
                <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-5 text-left">ステータス</th>
                <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-5 text-left">スコア</th>
                <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-5 text-left">登録日時</th>
                <th className="text-xs font-medium text-gray-500 uppercase tracking-wider py-3 px-5 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {recentApplicants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-sm text-gray-500 py-12 text-center">
                    応募者がありません
                  </td>
                </tr>
              ) : (
                recentApplicants.map((a) => {
                  const statusConfig = getStatusConfig(a.status)
                  const scoreBadgeClass = getScoreBadgeClass(a.total_score)
                  return (
                    <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-all duration-150">
                      <td className="py-3 px-5">
                        <div>
                          <p className="text-sm font-medium text-white">{a.name}</p>
                          <p className="text-xs text-gray-500">{a.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-5 text-sm text-gray-300">{a.company_name}</td>
                      <td className="py-3 px-5">
                        <div className={`inline-flex items-center gap-2 ${statusConfig.textClass}`}>
                          <span className={`w-2 h-2 rounded-full ${statusConfig.dotClass}`} />
                          <span className="text-sm">{statusConfig.label}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        {a.total_score !== null ? (
                          <span className={`inline-flex text-sm font-semibold rounded-lg px-2.5 py-1 ${scoreBadgeClass}`}>
                            {a.total_score}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-sm text-gray-400">{formatDate(a.created_at)}</td>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          {a.phone && (
                            <a href={`tel:${a.phone}`} className="text-gray-400 hover:text-emerald-400 transition-colors" title="電話">
                              <Phone className="w-4 h-4" />
                            </a>
                          )}
                          {a.email && (
                            <a href={`mailto:${a.email}`} className="text-gray-400 hover:text-blue-400 transition-colors" title="メール">
                              <Mail className="w-4 h-4" />
                            </a>
                          )}
                          <Link href={`/admin/applicants/${a.id}`} className="text-xs text-blue-400 hover:text-blue-300">
                            詳細
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

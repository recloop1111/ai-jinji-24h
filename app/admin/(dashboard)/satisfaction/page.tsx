'use client'

import { useState, useEffect } from 'react'

type CompanyStat = {
  company_id: string
  company_name: string
  average: number
  count: number
  distribution: Record<string, number>
}

type MonthStat = {
  month: string
  average: number
  count: number
}

type SatisfactionData = {
  overall_average: number
  total_responses: number
  by_company: CompanyStat[]
  by_month: MonthStat[]
}

const EMPTY: SatisfactionData = {
  overall_average: 0,
  total_responses: 0,
  by_company: [],
  by_month: [],
}

export default function SatisfactionPage() {
  const [data, setData] = useState<SatisfactionData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/admin/satisfaction')
        if (!res.ok) {
          if (!cancelled) setError('満足度データの取得に失敗しました')
          return
        }
        const json = await res.json()
        if (cancelled) return
        setData({
          overall_average: typeof json?.overall_average === 'number' ? json.overall_average : 0,
          total_responses: typeof json?.total_responses === 'number' ? json.total_responses : 0,
          by_company: Array.isArray(json?.by_company) ? (json.by_company as CompanyStat[]) : [],
          by_month: Array.isArray(json?.by_month) ? (json.by_month as MonthStat[]) : [],
        })
      } catch {
        if (!cancelled) setError('満足度データの取得に失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-white">応募者満足度データ</h1>
        <p className="text-sm text-gray-400 mt-1">面接体験の満足度評価（1〜5段階）の集計</p>
      </div>

      {error ? (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : loading ? (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">読み込み中...</p>
        </div>
      ) : data.total_responses === 0 ? (
        <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">満足度データはまだありません</p>
        </div>
      ) : (
        <>
          {/* サマリーカード */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
              <p className="text-3xl font-bold text-white">{data.overall_average.toFixed(1)}</p>
              <p className="text-sm text-gray-400 mt-0.5">平均満足度（5段階）</p>
            </div>
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
              <p className="text-3xl font-bold text-white">{data.total_responses}</p>
              <p className="text-sm text-gray-400 mt-0.5">総回答件数</p>
            </div>
          </div>

          {/* 企業別 */}
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-lg font-semibold text-white">企業別</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                    <th className="text-left text-xs text-gray-500 py-3 px-5">企業名</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">平均</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">件数</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">分布（1〜5）</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_company.map((c) => (
                    <tr key={c.company_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="py-4 px-5 text-sm font-medium text-white">{c.company_name || '—'}</td>
                      <td className="py-4 px-5 text-sm text-gray-300">{c.average.toFixed(1)}</td>
                      <td className="py-4 px-5 text-sm text-gray-400">{c.count}</td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          {['1', '2', '3', '4', '5'].map((star) => (
                            <span key={star} className="inline-flex items-center gap-1">
                              <span className="text-gray-500">{star}★</span>
                              <span className="text-gray-300">{c.distribution?.[star] ?? 0}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 月別 */}
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-lg font-semibold text-white">月別</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                    <th className="text-left text-xs text-gray-500 py-3 px-5">月</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">平均</th>
                    <th className="text-left text-xs text-gray-500 py-3 px-5">件数</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_month.map((m) => (
                    <tr key={m.month} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="py-4 px-5 text-sm text-white">{m.month}</td>
                      <td className="py-4 px-5 text-sm text-gray-300">{m.average.toFixed(1)}</td>
                      <td className="py-4 px-5 text-sm text-gray-400">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

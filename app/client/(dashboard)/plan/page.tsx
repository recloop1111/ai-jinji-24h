'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'
import { PRICE_PER_INTERVIEW } from '@/types/database'

function getProgressBarColor(percent: number) {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 80) return 'bg-yellow-500'
  return 'bg-blue-500'
}

function getProgressTextColor(percent: number) {
  if (percent >= 90) return 'text-red-600'
  if (percent >= 80) return 'text-yellow-600'
  return 'text-blue-600'
}

export default function PlanPage() {
  const { companyId, loading: companyIdLoading } = useCompanyId()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [monthlyInterviewLimit, setMonthlyInterviewLimit] = useState(0)
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [nextResetDate, setNextResetDate] = useState('')

  useEffect(() => {
    if (!companyId) {
      if (!companyIdLoading) setLoading(false)
      return
    }

    async function fetchPlanData() {
      setLoading(true)
      try {
        // 企業情報取得
        const { data: company } = await supabase
          .from('companies')
          .select('monthly_interview_limit')
          .eq('id', companyId)
          .single()

        const limit = company?.monthly_interview_limit ?? 10
        setMonthlyInterviewLimit(limit)

        // 当月の面接件数（billable のみ）
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        const { count } = await supabase
          .from('interviews')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('billable', true)
          .gte('created_at', monthStart)

        setMonthlyCount(count ?? 0)

        // 次月1日をリセット日として算出
        const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        setNextResetDate(`${nextReset.getFullYear()}-${String(nextReset.getMonth() + 1).padStart(2, '0')}-${String(nextReset.getDate()).padStart(2, '0')}`)
      } catch {
        // エラー時はデフォルト値のまま
      } finally {
        setLoading(false)
      }
    }

    fetchPlanData()
  }, [companyId, companyIdLoading, supabase])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">料金・利用状況</h1>
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center">
          <p className="text-slate-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  const remaining = Math.max(0, monthlyInterviewLimit - monthlyCount)
  const usagePercent = monthlyInterviewLimit > 0
    ? Math.min(100, Math.round((monthlyCount / monthlyInterviewLimit) * 100))
    : 0
  const isAtLimit = remaining === 0
  const currentCharge = monthlyCount * PRICE_PER_INTERVIEW
  const maxCharge = monthlyInterviewLimit * PRICE_PER_INTERVIEW

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">料金・利用状況</h1>

      {/* 料金体系 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-baseline gap-3 mb-4">
          <span className="text-3xl font-bold text-slate-900">¥{PRICE_PER_INTERVIEW.toLocaleString()}</span>
          <span className="text-sm text-slate-500">/ 1面接・1人あたり（税別）</span>
        </div>
        <div className="space-y-1.5 text-sm text-slate-600">
          <p>面接時間が10分未満の場合は課金対象外です</p>
          <p>請求は月末締めとなります</p>
        </div>
      </div>

      {/* 今月の利用状況 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">今月の利用状況</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-6">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">利用人数</p>
            <p className="text-2xl font-bold text-slate-900">{monthlyCount}<span className="text-sm font-normal text-slate-500 ml-1">/ {monthlyInterviewLimit}人</span></p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">残り面接可能人数</p>
            <p className={`text-2xl font-bold ${isAtLimit ? 'text-red-600' : 'text-slate-900'}`}>{remaining}<span className="text-sm font-normal text-slate-500 ml-1">人</span></p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">次回リセット日</p>
            <p className="text-lg font-bold text-slate-900">{nextResetDate}</p>
          </div>
        </div>

        {/* プログレスバー */}
        <div className="mb-2">
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${getProgressBarColor(usagePercent)}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
        <p className={`text-xs font-medium ${getProgressTextColor(usagePercent)}`}>
          {usagePercent}% 使用中
        </p>

        {isAtLimit && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-800">
              月間上限に達しました。現在、新規面接の受付を自動停止しています。
            </p>
            <p className="text-xs text-red-600 mt-1">
              追加で面接を実施するには、上限人数を変更してください。
            </p>
          </div>
        )}
      </div>

      {/* 請求見込み */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">今月の請求見込み</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">現在の請求見込み</p>
            <p className="text-2xl font-bold text-slate-900">¥{currentCharge.toLocaleString()}<span className="text-sm font-normal text-slate-500 ml-1">（税別）</span></p>
            <p className="text-xs text-slate-400 mt-1">{monthlyCount}人 × ¥{PRICE_PER_INTERVIEW.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">最大請求額（上限到達時）</p>
            <p className="text-2xl font-bold text-slate-900">¥{maxCharge.toLocaleString()}<span className="text-sm font-normal text-slate-500 ml-1">（税別）</span></p>
            <p className="text-xs text-slate-400 mt-1">{monthlyInterviewLimit}人 × ¥{PRICE_PER_INTERVIEW.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* 上限人数設定 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">月間上限人数の設定</h2>
        <p className="text-sm text-slate-600 mb-2">
          現在の上限: <span className="font-bold text-slate-900">{monthlyInterviewLimit}人 / 月</span>
        </p>
        <p className="text-xs text-slate-500 mb-4">
          上限に達すると新規面接の受付が自動停止されます。上限は最低5人から、1人単位で設定できます。
        </p>
        <button
          type="button"
          disabled
          className="px-5 py-2.5 text-sm font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed"
        >
          上限人数を変更する（次フェーズで実装予定）
        </button>
      </div>

      {/* 注意事項 */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">ご利用にあたって</h2>
        <ul className="space-y-1.5 text-xs text-slate-500">
          <li>・ 課金対象は10分以上実施された有効な面接のみです</li>
          <li>・ 利用人数は毎月1日にリセットされます</li>
          <li>・ 上限人数の設定値は翌月もそのまま引き継がれます</li>
          <li>・ 上限到達時は新規面接の受付が自動停止されます</li>
          <li>・ 請求は月末締めとなります</li>
        </ul>
      </div>
    </div>
  )
}

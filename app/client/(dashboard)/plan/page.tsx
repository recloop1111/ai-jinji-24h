'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DEMO_STORAGE_KEY } from '@/lib/hooks/useCompanyId'
import PasswordInput from '@/components/shared/PasswordInput'

type PlanData = {
  contract_type_label: string
  price_per_interview: number
  monthly_interview_limit: number
  monthly_count: number
  remaining: number
  current_charge: number
  max_charge: number
  next_month_interview_limit: number | null
  next_month_limit_effective_month: string | null
  next_month_max_charge: number
  next_reset_date: string
  min_interview_limit: number
}

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

const yen = (n: number) => `¥${n.toLocaleString()}`

// 翌月1日（YYYY-MM-01）
function firstOfNextMonth(): string {
  const d = new Date()
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`
}

export default function PlanPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(false)
  const [plan, setPlan] = useState<PlanData | null>(null)
  const [settingPwConfigured, setSettingPwConfigured] = useState<boolean | null>(null)

  // 翌月上限予約フォーム
  const [newLimit, setNewLimit] = useState('')
  const [settingPassword, setSettingPassword] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      const demo =
        (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'true') ||
        (typeof window !== 'undefined' && sessionStorage.getItem(DEMO_STORAGE_KEY) === 'true')

      if (demo) {
        if (cancelled) return
        setIsDemo(true)
        setPlan({
          contract_type_label: '従量課金',
          price_per_interview: 4000,
          monthly_interview_limit: 10,
          monthly_count: 3,
          remaining: 7,
          current_charge: 12000,
          max_charge: 40000,
          next_month_interview_limit: null,
          next_month_limit_effective_month: null,
          next_month_max_charge: 40000,
          next_reset_date: firstOfNextMonth(),
          min_interview_limit: 5,
        })
        setSettingPwConfigured(true)
        setLoading(false)
        return
      }

      try {
        const res = await fetch('/api/client/plan')
        if (cancelled) return
        if (res.status === 401) {
          router.replace('/client/login')
          return
        }
        if (!res.ok) {
          setLoading(false)
          return
        }
        const json = (await res.json()) as PlanData
        if (cancelled) return
        setPlan(json)

        // 管理者設定用パスワードの設定状況
        const pwRes = await fetch('/api/client/security/setting-password')
        const pwJson = await pwRes.json().catch(() => ({}))
        if (cancelled) return
        setSettingPwConfigured(pwRes.ok ? !!pwJson.configured : false)
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  if (loading || !plan) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">料金・利用状況</h1>
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center">
          <p className="text-slate-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  const price = plan.price_per_interview
  const limit = plan.monthly_interview_limit
  const used = plan.monthly_count
  const remaining = plan.remaining
  const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const isAtLimit = remaining === 0
  const minLimit = plan.min_interview_limit

  const parsedNewLimit = parseInt(newLimit, 10)
  const isValidNewLimit = !isNaN(parsedNewLimit) && Number.isInteger(parsedNewLimit) && parsedNewLimit >= minLimit
  const previewMaxCharge = isValidNewLimit ? parsedNewLimit * price : 0

  const handleOpenConfirm = () => {
    setFormError('')
    if (!isValidNewLimit) {
      setFormError(`翌月の上限人数は最低${minLimit}人以上の整数で入力してください`)
      return
    }
    if (!settingPassword) {
      setFormError('管理者設定用パスワードを入力してください')
      return
    }
    setShowConfirm(true)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setFormError('')
    try {
      const res = await fetch('/api/client/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          next_month_interview_limit: parsedNewLimit,
          settingPassword,
          ...(isDemo ? { demo: true } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShowConfirm(false)
        setFormError(json?.error?.message ?? '予約の保存に失敗しました')
        return
      }
      // 反映
      setPlan((prev) => prev ? {
        ...prev,
        next_month_interview_limit: parsedNewLimit,
        next_month_limit_effective_month: json?.next_month_limit_effective_month ?? firstOfNextMonth(),
        next_month_max_charge: parsedNewLimit * prev.price_per_interview,
      } : prev)
      setShowConfirm(false)
      setNewLimit('')
      setSettingPassword('')
      showToast(`翌月の月間上限を${parsedNewLimit}人に予約しました`)
    } catch {
      setShowConfirm(false)
      setFormError('予約の保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">料金・利用状況</h1>

      {/* ご契約内容 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">ご契約形態</p>
            <p className="text-lg font-bold text-slate-900">{plan.contract_type_label}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">ご契約単価</p>
            <p className="text-lg font-bold text-slate-900">{yen(price)} <span className="text-sm font-normal text-slate-500">/ 人（税別）</span></p>
          </div>
        </div>
        <div className="space-y-1.5 text-sm text-slate-600 mt-4 pt-4 border-t border-slate-100">
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
            <p className="text-2xl font-bold text-slate-900">{used}<span className="text-sm font-normal text-slate-500 ml-1">/ {limit}人</span></p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">残り面接可能人数</p>
            <p className={`text-2xl font-bold ${isAtLimit ? 'text-red-600' : 'text-slate-900'}`}>{remaining}<span className="text-sm font-normal text-slate-500 ml-1">人</span></p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">次回リセット日</p>
            <p className="text-lg font-bold text-slate-900">{plan.next_reset_date}</p>
          </div>
        </div>
        <div className="mb-2">
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all ${getProgressBarColor(usagePercent)}`} style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
        <p className={`text-xs font-medium ${getProgressTextColor(usagePercent)}`}>{usagePercent}% 使用中</p>

        {isAtLimit && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-800">月間上限に達しました。現在、新規面接の受付を自動停止しています。</p>
            <p className="text-xs text-red-600 mt-1">今月の上限の変更をご希望の場合は、運営担当者へお問い合わせください。</p>
          </div>
        )}
      </div>

      {/* 今月の請求見込み */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">今月の請求見込み</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">現在の請求見込み</p>
            <p className="text-2xl font-bold text-slate-900">{yen(plan.current_charge)}<span className="text-sm font-normal text-slate-500 ml-1">（税別）</span></p>
            <p className="text-xs text-slate-400 mt-1">{used}人 × {yen(price)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">今月の最大請求目安（上限到達時）</p>
            <p className="text-2xl font-bold text-slate-900">{yen(plan.max_charge)}<span className="text-sm font-normal text-slate-500 ml-1">（税別）</span></p>
            <p className="text-xs text-slate-400 mt-1">{limit}人 × {yen(price)}</p>
          </div>
        </div>
      </div>

      {/* 翌月の上限予約 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-5">翌月の上限予約</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">翌月の月間上限</p>
            {plan.next_month_interview_limit != null ? (
              <>
                <p className="text-2xl font-bold text-slate-900">{plan.next_month_interview_limit}<span className="text-sm font-normal text-slate-500 ml-1">人</span></p>
                {plan.next_month_limit_effective_month && (
                  <p className="text-xs text-slate-400 mt-1">{plan.next_month_limit_effective_month} から適用</p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600">現在の上限（{limit}人）が翌月も継続されます</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">翌月の最大請求目安</p>
            <p className="text-2xl font-bold text-slate-900">{yen(plan.next_month_max_charge)}<span className="text-sm font-normal text-slate-500 ml-1">（税別）</span></p>
            <p className="text-xs text-slate-400 mt-1">{plan.next_month_interview_limit ?? limit}人 × {yen(price)}</p>
          </div>
        </div>

        {settingPwConfigured === false ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-medium text-amber-800">管理者設定用パスワードが未設定です。</p>
            <p className="text-xs text-amber-700 mt-1">
              翌月上限の変更には管理者設定用パスワードが必要です。
              <Link href="/client/settings" className="font-medium text-blue-600 hover:text-blue-700 underline ml-1">設定画面から先に設定してください。</Link>
            </p>
          </div>
        ) : (
          <div className="border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-700 mb-1">翌月上限を変更する</p>
            <p className="text-xs text-slate-500 mb-4">
              変更は即時反映されず、翌月1日から適用されます。今月の上限には影響しません。上限は最低{minLimit}人から設定できます。
            </p>
            <div className="space-y-4 max-w-md">
              <div>
                <label htmlFor="next-limit" className="block text-xs font-medium text-slate-600 mb-1">新しい翌月上限人数</label>
                <div className="flex items-center gap-2">
                  <input
                    id="next-limit"
                    type="number"
                    min={minLimit}
                    step={1}
                    value={newLimit}
                    onChange={(e) => setNewLimit(e.target.value)}
                    placeholder={String(plan.next_month_interview_limit ?? limit)}
                    className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <span className="text-sm text-slate-500">人 / 月</span>
                </div>
                {isValidNewLimit && (
                  <p className="text-xs text-slate-500 mt-1">翌月の最大請求目安: {yen(previewMaxCharge)}（税別）/ 月</p>
                )}
              </div>
              <div>
                <label htmlFor="setting-pw" className="block text-xs font-medium text-slate-600 mb-1">管理者設定用パスワード</label>
                <PasswordInput
                  id="setting-pw"
                  value={settingPassword}
                  onChange={setSettingPassword}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  placeholder="管理者設定用パスワードを入力"
                />
                <p className="text-xs text-slate-400 mt-1">ログインパスワードとは別のパスワードです</p>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <button
                type="button"
                onClick={handleOpenConfirm}
                disabled={submitting || settingPwConfigured === null}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-60"
              >
                翌月上限を予約する
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 注意事項 */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">ご利用にあたって</h2>
        <ul className="space-y-1.5 text-xs text-slate-500">
          <li>・ 課金対象は10分以上実施された有効な面接のみです</li>
          <li>・ 利用人数は毎月1日にリセットされます</li>
          <li>・ 翌月上限の変更は翌月1日から適用され、今月の上限には影響しません</li>
          <li>・ 上限到達時は新規面接の受付が自動停止されます</li>
          <li>・ 請求は月末締めとなります</li>
        </ul>
      </div>

      {/* 確認モーダル */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && setShowConfirm(false)} aria-hidden />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-3">翌月上限の予約確認</h3>
            <p className="text-sm text-slate-700 leading-relaxed mb-6">
              翌月の月間上限を <span className="font-bold">{parsedNewLimit}人</span> に変更します。翌月の最大請求目安は <span className="font-bold">{yen(previewMaxCharge)}（税別）</span> です。今月の上限には影響しません。よろしいですか？
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? '予約中...' : '予約する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

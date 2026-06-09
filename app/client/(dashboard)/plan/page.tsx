'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompanyId } from '@/lib/hooks/useCompanyId'
import { PRICE_PER_INTERVIEW, MIN_INTERVIEW_LIMIT } from '@/types/database'
import { Eye as EyeIcon, EyeOff as EyeOffIcon } from 'lucide-react'

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

  // 上限変更UI
  const [newLimit, setNewLimit] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) {
      if (!companyIdLoading) setLoading(false)
      return
    }

    async function fetchPlanData() {
      setLoading(true)
      try {
        const { data: company } = await supabase
          .from('companies')
          .select('monthly_interview_limit')
          .eq('id', companyId)
          .single()

        const limit = company?.monthly_interview_limit ?? 10
        setMonthlyInterviewLimit(limit)

        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        const { count } = await supabase
          .from('interviews')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('billable', true)
          .gte('created_at', monthStart)

        setMonthlyCount(count ?? 0)

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

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  // 入力値のバリデーション
  const parsedNewLimit = parseInt(newLimit, 10)
  const minAllowed = Math.max(MIN_INTERVIEW_LIMIT, monthlyCount)
  const isValidNewLimit = !isNaN(parsedNewLimit) && parsedNewLimit >= minAllowed && parsedNewLimit !== monthlyInterviewLimit

  const handleChangeLimitClick = () => {
    if (!isValidNewLimit) return
    setPassword('')
    setShowPassword(false)
    setAuthError('')
    setShowPasswordModal(true)
  }

  const handlePasswordConfirm = async () => {
    if (!password.trim()) {
      setAuthError('パスワードを入力してください')
      return
    }

    setUpdating(true)
    setAuthError('')

    try {
      // パスワード再確認: 現在のユーザーのメールアドレスを取得してsignInWithPasswordで検証
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        setAuthError('ユーザー情報の取得に失敗しました')
        setUpdating(false)
        return
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      })

      if (signInError) {
        setAuthError('パスワードが正しくありません')
        setUpdating(false)
        return
      }

      // パスワード確認OK → monthly_interview_limit を更新
      const { error: updateError } = await supabase
        .from('companies')
        .update({ monthly_interview_limit: parsedNewLimit })
        .eq('id', companyId)

      if (updateError) {
        setAuthError('上限人数の更新に失敗しました')
        setUpdating(false)
        return
      }

      // 成功
      setMonthlyInterviewLimit(parsedNewLimit)
      setNewLimit('')
      setShowPasswordModal(false)
      setPassword('')
      showToast(`月間上限人数を${parsedNewLimit}人に変更しました`)
    } catch {
      setAuthError('エラーが発生しました。もう一度お試しください')
    } finally {
      setUpdating(false)
    }
  }

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
              追加で面接を実施するには、下の「月間上限人数の設定」から上限を変更してください。
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
          上限に達すると新規面接の受付が自動停止されます。上限は最低{MIN_INTERVIEW_LIMIT}人から、1人単位で設定できます。
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 max-w-md">
          <div className="flex-1 w-full sm:w-auto">
            <label htmlFor="new-limit" className="block text-xs font-medium text-slate-600 mb-1">
              新しい上限人数
            </label>
            <div className="flex items-center gap-2">
              <input
                id="new-limit"
                type="number"
                min={minAllowed}
                step={1}
                value={newLimit}
                onChange={(e) => setNewLimit(e.target.value)}
                placeholder={String(monthlyInterviewLimit)}
                className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
              <span className="text-sm text-slate-500">人 / 月</span>
            </div>
            {newLimit && !isNaN(parsedNewLimit) && parsedNewLimit < minAllowed && (
              <p className="text-xs text-red-600 mt-1">
                {monthlyCount > MIN_INTERVIEW_LIMIT
                  ? `今月${monthlyCount}人利用済みのため、${minAllowed}人以上に設定してください`
                  : `最低${MIN_INTERVIEW_LIMIT}人以上に設定してください`}
              </p>
            )}
            {newLimit && parsedNewLimit === monthlyInterviewLimit && (
              <p className="text-xs text-slate-400 mt-1">現在の上限と同じです</p>
            )}
            {isValidNewLimit && (
              <p className="text-xs text-slate-500 mt-1">
                変更後の最大請求額: ¥{(parsedNewLimit * PRICE_PER_INTERVIEW).toLocaleString()}（税別）/ 月
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={!isValidNewLimit}
            onClick={handleChangeLimitClick}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition-colors ${
              isValidNewLimit
                ? 'text-white bg-blue-600 hover:bg-blue-700'
                : 'text-slate-400 bg-slate-100 border border-slate-200 cursor-not-allowed'
            }`}
          >
            上限を変更する
          </button>
        </div>
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

      {/* パスワード確認モーダル */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !updating && setShowPasswordModal(false)} aria-hidden />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">パスワードの確認</h3>
            <p className="text-sm text-slate-600 mb-1">
              月間上限人数を <span className="font-bold">{parsedNewLimit}人</span> に変更します。
            </p>
            <p className="text-sm text-slate-600 mb-4">
              最大請求額: <span className="font-bold">¥{(parsedNewLimit * PRICE_PER_INTERVIEW).toLocaleString()}（税別）/ 月</span>
            </p>
            <p className="text-sm text-slate-500 mb-4">
              請求額に関わる変更のため、ログインパスワードを再入力してください。
            </p>
            <div className="mb-4">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                パスワード
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setAuthError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !updating) handlePasswordConfirm()
                  }}
                  className="w-full px-4 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  placeholder="ログインパスワードを入力"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
              {authError && <p className="mt-1.5 text-sm text-red-600">{authError}</p>}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={updating}
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={updating || !password.trim()}
                onClick={handlePasswordConfirm}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {updating ? '確認中...' : '確認して変更する'}
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

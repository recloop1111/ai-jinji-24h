'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Company = {
  id: string
  name: string
  plan: string
  auto_upgrade_enabled: boolean
  monthly_interview_count: number
  monthly_interview_limit: number
}

const PLANS = [
  { key: 'A', name: 'プランA', price: 60000, limit: 10, description: '月1〜10件' },
  { key: 'B', name: 'プランB', price: 120000, limit: 20, description: '月11〜20件' },
  { key: 'C', name: 'プランC', price: 180000, limit: 30, description: '月21〜30件' },
]

const PLAN_ORDER = ['A', 'B', 'C']

export default function PlanPage() {
  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoUpgrade, setAutoUpgrade] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    body: string
    onConfirm: () => void
  }>({ open: false, title: '', body: '', onConfirm: () => {} })
  const supabase = createClient()

  useEffect(function () {
    fetchCompany()
  }, [])

  async function fetchCompany() {
    setLoading(true)
    var res = await supabase.auth.getUser()
    if (!res.data.user) { setLoading(false); return }
    var r = await supabase
      .from('companies')
      .select('id, name, plan, auto_upgrade_enabled, monthly_interview_count, monthly_interview_limit')
      .eq('auth_user_id', res.data.user.id)
      .single()
    if (r.data) {
      setCompany(r.data)
      setAutoUpgrade(r.data.auto_upgrade_enabled)
    }
    setLoading(false)
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type: type, text: text })
    setTimeout(function () { setMessage(null) }, 3000)
  }

  function handleAutoUpgradeClick() {
    var newValue = !autoUpgrade
    setConfirmDialog({
      open: true,
      title: newValue ? '自動繰上げをONにしますか？' : '自動繰上げをOFFにしますか？',
      body: newValue
        ? '上限到達時に自動で上位プランに移行します（最大30件）。'
        : 'OFFは翌月から適用されます。上限到達時に面接受付が停止します。',
      onConfirm: function () {
        toggleAutoUpgrade(newValue)
      },
    })
  }

  async function toggleAutoUpgrade(newValue: boolean) {
    if (!company) return
    setSaving(true)
    setConfirmDialog({ open: false, title: '', body: '', onConfirm: function () {} })
    var result = await supabase
      .from('companies')
      .update({ auto_upgrade_enabled: newValue })
      .eq('id', company.id)
    if (result.error) {
      showMessage('error', '設定の更新に失敗しました。')
    } else {
      setAutoUpgrade(newValue)
      showMessage('success', '自動繰上げを' + (newValue ? '有効' : '無効') + 'にしました。')
    }
    setSaving(false)
  }

  function handlePlanChange(targetPlanKey: string) {
    if (!company) return
    var currentIndex = PLAN_ORDER.indexOf(company.plan)
    var targetIndex = PLAN_ORDER.indexOf(targetPlanKey)
    var targetPlan = PLANS.find(function (p) { return p.key === targetPlanKey })
    if (!targetPlan) return
    var isUpgrade = targetIndex > currentIndex
    setConfirmDialog({
      open: true,
      title: targetPlan.name + 'に変更しますか？',
      body: isUpgrade
        ? 'アップグレードは即時適用されます。差額は次回請求に反映されます。'
        : 'ダウングレードは翌月から適用されます。',
      onConfirm: function () {
        setConfirmDialog({ open: false, title: '', body: '', onConfirm: function () {} })
        alert('プラン変更はStripe連携後に実装されます。\n変更先: ' + targetPlan.name)
      },
    })
  }

  var currentPlan = PLANS.find(function (p) { return p.key === company?.plan })
  var usagePercent = company && currentPlan
    ? Math.min(100, Math.round((company.monthly_interview_count / currentPlan.limit) * 100))
    : 0

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        読み込み中...
      </div>
    )
  }

  if (!company) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        企業情報が見つかりません。
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">プラン・契約管理</h1>

      {message && (
        <div className={'mb-4 rounded-md p-3 text-sm ' + (message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">現在のプラン</h2>
        <div className="flex items-center gap-4 mb-2">
          <span className="inline-block px-4 py-2 text-lg font-bold rounded-full bg-blue-100 text-blue-800">
            {currentPlan ? currentPlan.name : company.plan}
          </span>
          <span className="text-gray-600">
            月額 ¥{currentPlan ? currentPlan.price.toLocaleString() : '—'}（税別）
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          面接上限: {currentPlan ? currentPlan.limit : company.monthly_interview_limit}件/月
        </p>
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-600">今月の面接実施数</span>
            <span className="text-sm font-bold text-gray-900">
              {company.monthly_interview_count} / {currentPlan ? currentPlan.limit : company.monthly_interview_limit}件
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={'h-3 rounded-full transition-all ' + (usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-yellow-500' : 'bg-blue-500')}
              style={{ width: usagePercent + '%' }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">使用率: {usagePercent}%</p>
        </div>
        {usagePercent >= 90 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-3">
            <p className="text-sm text-red-700">面接枠の残りが少なくなっています。プランのアップグレードをご検討ください。</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">自動繰上げプラン</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={handleAutoUpgradeClick}
            disabled={saving}
            className={'relative inline-flex h-7 w-12 items-center rounded-full transition-colors ' + (autoUpgrade ? 'bg-blue-600' : 'bg-gray-300') + (saving ? ' opacity-50' : '')}
          >
            <span className={'inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ' + (autoUpgrade ? 'translate-x-6' : 'translate-x-1')} />
          </button>
          <span className="text-sm font-medium text-gray-700">{autoUpgrade ? 'ON' : 'OFF'}</span>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          {autoUpgrade
            ? '上限到達時に自動で上位プランに移行します（最大30件）。'
            : '上限到達時に面接受付が停止します。'}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">プラン一覧</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map(function (plan) {
            var isCurrent = plan.key === company.plan
            var currentIdx = PLAN_ORDER.indexOf(company.plan)
            var planIdx = PLAN_ORDER.indexOf(plan.key)
            var isUpgrade = planIdx > currentIdx
            var isDowngrade = planIdx < currentIdx
            return (
              <div
                key={plan.key}
                className={'border-2 rounded-lg p-6 ' + (isCurrent ? 'border-blue-500 bg-blue-50' : 'border-gray-200')}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  {isCurrent && (
                    <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">現在のプラン</span>
                  )}
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">
                  ¥{plan.price.toLocaleString()}
                  <span className="text-sm font-normal text-gray-500">/月（税別）</span>
                </p>
                <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
                {isUpgrade && (
                  <button
                    onClick={function () { handlePlanChange(plan.key) }}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    アップグレード（即時適用）
                  </button>
                )}
                {isDowngrade && (
                  <button
                    onClick={function () { handlePlanChange(plan.key) }}
                    className="w-full px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    ダウングレード（翌月適用）
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {confirmDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={function () { setConfirmDialog({ open: false, title: '', body: '', onConfirm: function () {} }) }} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-600 mb-6">{confirmDialog.body}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={function () { setConfirmDialog({ open: false, title: '', body: '', onConfirm: function () {} }) }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'

// セキュリティアラートは /api/admin/security/alerts（security_alerts テーブル）から取得
type SecurityAlertItem = { id: string; type: string; ip_address: string | null; details: string | null; resolved: boolean; created_at: string }

type BlockedAccount = {
  portal_type: 'admin' | 'client'
  scope_key: string
  failure_count: number
  blocked_until: string | null
  last_attempt_at: string | null
  user_email: string | null
  user_name: string | null
}

function LockedAccountsList() {
  const [items, setItems] = useState<BlockedAccount[]>([])
  const [loadingLocked, setLoadingLocked] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchBlocked() {
      try {
        const res = await fetch('/api/admin/security/login-throttles')
        const data = await res.json().catch(() => null)
        if (!cancelled) setItems(res.ok && Array.isArray(data?.blocked) ? data.blocked : [])
      } finally {
        if (!cancelled) setLoadingLocked(false)
      }
    }
    fetchBlocked()
    return () => { cancelled = true }
  }, [])

  async function handleUnlock(portal: string, scopeKey: string) {
    const res = await fetch('/api/admin/security/login-throttles/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portal_type: portal, scope_key: scopeKey }),
    })
    if (res.ok) {
      setItems((prev) => prev.filter((x) => !(x.portal_type === portal && x.scope_key === scopeKey)))
    }
  }

  if (loadingLocked) return <p className="text-sm text-gray-500">読み込み中...</p>

  if (items.length === 0) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
        <p className="text-sm text-emerald-400">現在ブロック中のアカウントはありません。</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.portal_type}:${item.scope_key}`} className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <div>
            <p className="text-sm font-medium text-white">
              {item.user_email || item.user_name || `識別子 ${item.scope_key.slice(0, 12)}…`}
              <span className="ml-2 text-xs text-gray-400">[{item.portal_type === 'admin' ? '運営' : '企業'}]</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              ブロック解除予定: {item.blocked_until ? new Date(item.blocked_until).toLocaleString('ja-JP') : '不明'}
              {typeof item.failure_count === 'number' ? ` | 失敗回数: ${item.failure_count}回` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleUnlock(item.portal_type, item.scope_key)}
            className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 border border-emerald-500/20 rounded-xl px-4 py-2 text-sm transition-colors shrink-0"
          >
            ロック解除
          </button>
        </div>
      ))}
    </div>
  )
}

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<'access' | 'audit' | 'policy' | 'alert'>('access')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // セキュリティアラート（実データ: security_alerts）
  const [alerts, setAlerts] = useState<SecurityAlertItem[]>([])
  const [alertsLoading, setAlertsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const loadAlerts = async () => {
      try {
        const res = await fetch('/api/admin/security/alerts')
        if (!res.ok) {
          if (!cancelled) setAlerts([])
          return
        }
        const json = await res.json()
        if (!cancelled) setAlerts(Array.isArray(json?.alerts) ? (json.alerts as SecurityAlertItem[]) : [])
      } catch {
        if (!cancelled) setAlerts([])
      } finally {
        if (!cancelled) setAlertsLoading(false)
      }
    }
    loadAlerts()
    return () => {
      cancelled = true
    }
  }, [])

  const unresolvedAlertCount = alerts.filter((a) => !a.resolved).length
  const summary = {
    alertCount: alerts.length,
    unresolvedAlerts: unresolvedAlertCount,
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* セクション1: ヘッダー */}
        <div>
          <h1 className="text-2xl font-bold text-white">セキュリティ</h1>
          <p className="text-sm text-gray-400 mt-1">アクセス管理・監査ログ・セキュリティ設定</p>
        </div>

        {/* セクション2: サマリーカード */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-gray-400">—</p>
            <p className="text-sm text-gray-400 mt-0.5">アクティブセッション</p>
            <p className="text-xs text-amber-300/90 mt-1">集計未実装</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-gray-400">—</p>
            <p className="text-sm text-gray-400 mt-0.5">ログイン試行</p>
            <p className="text-xs text-amber-300/90 mt-1">集計未実装</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-gray-400">2FA</p>
            <p className="text-sm text-gray-400 mt-0.5">二要素認証</p>
            <p className="text-xs text-amber-300/90 mt-1">未実装（TOTP予定）</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{summary.alertCount}</p>
            <p className="text-sm text-gray-400 mt-0.5">直近のアラート</p>
            <p className="text-xs text-red-400 mt-1">未対応: {summary.unresolvedAlerts}件</p>
          </div>
        </div>

        {/* セクション3: タブナビゲーション */}
        <div className="flex gap-1 bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-xl p-1 mb-6 overflow-x-auto">
          {[
            { id: 'access' as const, label: 'アクセス管理' },
            { id: 'audit' as const, label: '監査ログ' },
            { id: 'policy' as const, label: 'セキュリティポリシー' },
            { id: 'alert' as const, label: 'アラート' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg whitespace-nowrap ${
                activeTab === tab.id ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* タブ1: アクセス管理（管理者一覧・セッション集計は実データ取得APIが無く未実装。架空データ・操作UIは置かない） */}
        {activeTab === 'access' && (
          <div className="space-y-6">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-2">管理者アカウント</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                運営管理者（admin / super_admin）は profiles テーブルで管理されています。
                画面上での一覧表示・追加・編集・停止は<span className="text-amber-300/90 font-medium">今後実装予定</span>です（現在は設定できません）。
              </p>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-2">アクティブセッション</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                ログイン中セッション数の集計・強制ログアウトは<span className="text-amber-300/90 font-medium">集計未実装</span>です
                （現在ログイン中のセッションを集計する基盤がありません）。
              </p>
            </div>
          </div>
        )}

        {/* タブ2: 監査ログ（audit_logs テーブル無し＝未実装。検索・絞り込み等の操作UIは置かない） */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-8 text-center">
              <p className="text-sm text-gray-300 font-medium">監査ログは今後実装予定です</p>
              <p className="text-xs text-gray-500 mt-2">
                設定変更・ログイン・データ操作の記録基盤（監査ログ）は現在未実装です。検索・絞り込みは提供していません。
              </p>
            </div>
          </div>
        )}

        {/* タブ3: セキュリティポリシー */}
        {activeTab === 'policy' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">パスワードポリシー</h2>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  以下のうち「8文字以上」のみがアプリ側で強制されています（管理者・企業アカウント作成／設定用パスワード）。
                  大文字・数字・特殊文字や有効期限は<span className="text-amber-300/90">推奨方針であり現在は未強制</span>です。
                  ログイン自体のパスワード検証は Supabase Auth の仕様に依存します。
                </p>
              </div>
              <dl className="divide-y divide-white/[0.06] text-sm">
                <div className="flex justify-between py-2"><dt className="text-gray-400">最小文字数</dt><dd className="text-white">8文字以上（強制）</dd></div>
                <div className="flex justify-between py-2"><dt className="text-gray-400">大文字 / 数字 / 特殊文字</dt><dd className="text-amber-300/90">推奨・未強制</dd></div>
                <div className="flex justify-between py-2"><dt className="text-gray-400">有効期限</dt><dd className="text-amber-300/90">未強制（定期変更なし）</dd></div>
              </dl>
              <p className="text-xs text-amber-300/90 mt-4">画面からのポリシー編集は今後実装予定です（現在は設定できません）。</p>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">セッション管理</h2>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  運営／企業のセッションは別cookieで分離済みです。セッションの有効時間（タイムアウト）は
                  アプリ独自では制御しておらず、Supabase Auth の現在のセッション仕様に依存します。
                  ブロック中アカウントの手動解除は下記「ログインスロットル管理」から可能です。
                </p>
              </div>
              <dl className="divide-y divide-white/[0.06] text-sm">
                <div className="flex justify-between py-2"><dt className="text-gray-400">運営 / 企業セッション分離</dt><dd className="text-emerald-400">実装済み（別cookie）</dd></div>
                <div className="flex justify-between py-2"><dt className="text-gray-400">有効時間の独自制御（タイムアウト）</dt><dd className="text-amber-300/90">未実装（Supabase Auth 既定に依存）</dd></div>
                <div className="flex justify-between py-2"><dt className="text-gray-400">同時ログイン制限</dt><dd className="text-amber-300/90">未実装（制限なし）</dd></div>
                <div className="flex justify-between py-2"><dt className="text-gray-400">ログイン失敗ロックの手動解除</dt><dd className="text-emerald-400">実装済み（下記ロック管理）</dd></div>
              </dl>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">二要素認証（2FA）</h2>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-amber-200 leading-relaxed">
                  二要素認証（TOTP）は設計仕様ですが、現在<strong>未実装</strong>です。現在は設定できません。
                </p>
              </div>
              <dl className="divide-y divide-white/[0.06] text-sm">
                <div className="flex justify-between py-2"><dt className="text-gray-400">管理者 2FA</dt><dd className="text-gray-300">未実装</dd></div>
                <div className="flex justify-between py-2"><dt className="text-gray-400">企業アカウント 2FA</dt><dd className="text-gray-300">未実装</dd></div>
                <div className="flex justify-between py-2"><dt className="text-gray-400">方式</dt><dd className="text-gray-300">TOTP（予定）</dd></div>
              </dl>
            </div>

            {/* ログイン スロットル（アカウント/IP）管理 */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-2">ログインスロットル管理</h2>
              <p className="text-sm text-gray-400 mb-4">
                アプリ経由ログインの一時制限（アカウント: 30分窓で10回 / IP: 10分窓で60回 → 30分待機）を実装済みです。
                期限切れは次回判定時に自動解除されます。下記は現在ブロック中のアカウントで、運営管理者が手動解除できます。
                なお本機能はアプリAPI経由のログインを制限するもので、Supabase Auth への直接アクセスを完全には遮断しません。
                直接アクセスには Supabase ネイティブ CAPTCHA と標準 rate limit が適用されます。
              </p>
              <LockedAccountsList />
            </div>
          </div>
        )}

        {/* タブ4: アラート */}
        {activeTab === 'alert' && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-white">セキュリティアラート</h2>
              {alerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => showToast('既読処理は今後実装予定です')}
                  className="bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm px-4 py-2 rounded-xl shrink-0"
                >
                  全て既読にする
                </button>
              )}
            </div>
            <div className="space-y-3">
              {alertsLoading ? (
                <p className="text-sm text-gray-500 py-8 text-center">読み込み中...</p>
              ) : alerts.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">セキュリティアラートはありません</p>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`bg-white/[0.04] backdrop-blur-xl rounded-2xl p-5 ${
                      !alert.resolved ? 'border border-red-500/30' : 'border border-white/[0.06]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                      <span className="inline-flex text-xs rounded-lg px-2 py-1 w-fit bg-white/[0.06] text-gray-300">
                        {alert.type}
                      </span>
                      <span className={`text-sm ${!alert.resolved ? 'text-red-400' : 'text-gray-500'}`}>
                        {alert.resolved ? '対応済み' : '未対応'}
                      </span>
                    </div>
                    {alert.details && <p className="text-sm text-gray-300">{alert.details}</p>}
                    {alert.ip_address && <p className="text-xs text-gray-500 mt-1">IP: {alert.ip_address}</p>}
                    <p className="text-xs text-gray-600 mt-2">
                      {new Date(alert.created_at).toLocaleString('ja-JP')}
                    </p>
                    {!alert.resolved && (
                      <button
                        type="button"
                        onClick={() => showToast('ステータス更新機能は今後実装予定です')}
                        className="mt-3 text-sm text-blue-400 hover:text-blue-300"
                      >
                        対応済みにする
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* トースト */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/[0.08] backdrop-blur-2xl border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white shadow-lg">
          {toastMessage}
        </div>
      )}
    </>
  )
}

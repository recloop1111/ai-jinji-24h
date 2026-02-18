'use client'

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

// TODO: 実データに差替え
const ADMIN_ACCOUNTS = [
  { id: 1, name: '田中太郎', email: 'tanaka@ai-interview.example.com', role: 'super_admin', twoFactor: true, lastLogin: '2026-02-15 14:30', status: 'active' },
  { id: 2, name: '佐藤花子', email: 'sato@ai-interview.example.com', role: 'admin', twoFactor: true, lastLogin: '2026-02-15 10:15', status: 'active' },
  { id: 3, name: '鈴木一郎', email: 'suzuki@ai-interview.example.com', role: 'operator', twoFactor: true, lastLogin: '2026-02-14 18:45', status: 'active' },
  { id: 4, name: '高橋美咲', email: 'takahashi@ai-interview.example.com', role: 'operator', twoFactor: false, lastLogin: '2026-02-13 09:20', status: 'active' },
  { id: 5, name: '山本健二', email: 'yamamoto@ai-interview.example.com', role: 'admin', twoFactor: true, lastLogin: '2026-01-28 16:00', status: 'suspended' },
]

// TODO: 実データに差替え
const ACTIVE_SESSIONS = [
  { id: 1, user: '田中太郎', device: 'Chrome / Windows', ip: '203.0.113.1', datetime: '2026-02-15 14:30' },
  { id: 2, user: '佐藤花子', device: 'Safari / macOS', ip: '203.0.113.45', datetime: '2026-02-15 10:15' },
  { id: 3, user: '鈴木一郎', device: 'Chrome / Android', ip: '198.51.100.22', datetime: '2026-02-14 18:45' },
  { id: 4, user: '企業: 株式会社ABC', device: 'Chrome / Windows', ip: '192.0.2.100', datetime: '2026-02-15 13:00' },
]

// TODO: 実データに差替え
const AUDIT_LOGS = [
  { id: 1, datetime: '2026-02-15 14:32', user: '田中太郎', role: 'super_admin', action: 'settings_change', detail: 'メンテナンスモードをOFFに変更', ip: '203.0.113.1' },
  { id: 2, datetime: '2026-02-15 14:30', user: '田中太郎', role: 'super_admin', action: 'login', detail: '管理画面にログイン（2FA認証済み）', ip: '203.0.113.1' },
  { id: 3, datetime: '2026-02-15 13:55', user: '佐藤花子', role: 'admin', action: 'data_edit', detail: '株式会社ABCの質問セットをBからCに変更', ip: '203.0.113.45' },
  { id: 4, datetime: '2026-02-15 13:40', user: '佐藤花子', role: 'admin', action: 'data_edit', detail: '山田商事の面接設定を更新', ip: '203.0.113.45' },
  { id: 5, datetime: '2026-02-15 12:10', user: '鈴木一郎', role: 'operator', action: 'export', detail: '応募者一覧CSVをエクスポート', ip: '198.51.100.22' },
  { id: 6, datetime: '2026-02-15 10:15', user: '佐藤花子', role: 'admin', action: 'login', detail: '管理画面にログイン（2FA認証済み）', ip: '203.0.113.45' },
  { id: 7, datetime: '2026-02-14 18:45', user: '鈴木一郎', role: 'operator', action: 'login', detail: '管理画面にログイン', ip: '198.51.100.22' },
  { id: 8, datetime: '2026-02-14 16:20', user: '田中太郎', role: 'super_admin', action: 'permission_change', detail: '山本健二のアカウントを停止', ip: '203.0.113.1' },
  { id: 9, datetime: '2026-02-14 15:00', user: '佐藤花子', role: 'admin', action: 'data_edit', detail: '株式会社テックフロンティアのプランをAからBに変更', ip: '203.0.113.45' },
  { id: 10, datetime: '2026-02-14 11:30', user: '高橋美咲', role: 'operator', action: 'login', detail: '管理画面にログイン（2FA未設定）', ip: '203.0.113.78' },
  { id: 11, datetime: '2026-02-13 14:00', user: '田中太郎', role: 'super_admin', action: 'settings_change', detail: 'OpenAI APIモデルをGPT-4o-miniからGPT-4oに変更', ip: '203.0.113.1' },
  { id: 12, datetime: '2026-02-13 09:20', user: '高橋美咲', role: 'operator', action: 'login', detail: '管理画面にログイン（2FA未設定）', ip: '203.0.113.78' },
]

// TODO: 実データに差替え
const SECURITY_ALERTS = [
  { id: 1, level: 'high', title: '不正ログイン試行を検出', detail: 'IPアドレス 198.51.100.99 から5回連続でログイン失敗。アカウント「takahashi@ai-interview.example.com」が一時ロックされました。', datetime: '2026-02-15 11:45', status: 'unresolved' },
  { id: 2, level: 'medium', title: '2FA未設定アカウントの検出', detail: '高橋美咲（operator）が2FA未設定のまま30日以上経過しています。セキュリティポリシーに基づき、設定を促してください。', datetime: '2026-02-14 09:00', status: 'unresolved' },
  { id: 3, level: 'low', title: 'セッションタイムアウト超過', detail: '山本健二のセッションが8時間以上継続していたため自動ログアウトしました。', datetime: '2026-02-13 22:00', status: 'resolved' },
  { id: 4, level: 'medium', title: '通常と異なるIPからのログイン', detail: '佐藤花子が通常と異なるIPアドレス（203.0.113.200）からログインしました。海外IPの可能性があります。', datetime: '2026-02-12 15:30', status: 'resolved' },
  { id: 5, level: 'high', title: 'APIキーの不正使用の可能性', detail: 'OpenAI APIの利用量が通常の3倍を超えています。不正使用の可能性を確認してください。', datetime: '2026-02-11 08:00', status: 'resolved' },
]

// TODO: 実データに差替え
const SUMMARY = {
  activeSessions: 12,
  loginAttempts: 342,
  loginFailures: 8,
  twoFactorRate: 85,
  twoFactorCount: 17,
  twoFactorTotal: 20,
  alertCount: 2,
  unresolvedAlerts: 2,
}

const ITEMS_PER_PAGE = 10

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-11 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
        checked ? 'bg-blue-600' : 'bg-gray-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 block w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm text-gray-400 mb-1">{children}</label>
}

function getRoleBadge(role: string): string {
  const map: Record<string, string> = {
    super_admin: 'bg-red-500/20 text-red-400 border border-red-500/30',
    admin: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    operator: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  }
  return map[role] ?? 'bg-gray-500/20 text-gray-400'
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin: 'スーパー管理者',
    admin: '管理者',
    operator: 'オペレーター',
  }
  return map[role] ?? role
}

function getActionBadge(action: string): string {
  const map: Record<string, string> = {
    login: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    settings_change: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    data_edit: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    export: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    permission_change: 'bg-red-500/20 text-red-400 border border-red-500/30',
  }
  return map[action] ?? 'bg-gray-500/20 text-gray-400'
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    login: 'ログイン',
    settings_change: '設定変更',
    data_edit: 'データ編集',
    export: 'エクスポート',
    permission_change: '権限変更',
  }
  return map[action] ?? action
}

function getLevelBadge(level: string): string {
  const map: Record<string, string> = {
    high: 'bg-red-500/20 text-red-400',
    medium: 'bg-amber-500/20 text-amber-400',
    low: 'bg-blue-500/20 text-blue-400',
  }
  return map[level] ?? 'bg-gray-500/20 text-gray-400'
}

function LockedAccountsList() {
  const [lockedCompanies, setLockedCompanies] = useState<any[]>([])
  const [loadingLocked, setLoadingLocked] = useState(true)

  useEffect(() => {
    async function fetchLocked() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase
        .from('companies')
        .select('id, name, is_locked, locked_at, login_fail_count')
        .eq('is_locked', true)
      setLockedCompanies(data || [])
      setLoadingLocked(false)
    }
    fetchLocked()
  }, [])

  async function handleUnlock(companyId: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase
      .from('companies')
      .update({ is_locked: false, locked_at: null, login_fail_count: 0, updated_at: new Date().toISOString() })
      .eq('id', companyId)
    setLockedCompanies((prev) => prev.filter((c) => c.id !== companyId))
  }

  if (loadingLocked) return <p className="text-sm text-gray-500">読み込み中...</p>

  if (lockedCompanies.length === 0) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
        <p className="text-sm text-emerald-400">現在ロックされている企業アカウントはありません。</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {lockedCompanies.map((company) => (
        <div key={company.id} className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <div>
            <p className="text-sm font-medium text-white">{company.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              ロック日時: {company.locked_at ? new Date(company.locked_at).toLocaleString('ja-JP') : '不明'}
              {company.login_fail_count && ` | 失敗回数: ${company.login_fail_count}回`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleUnlock(company.id)}
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

  // 監査ログフィルター
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('all')
  const [auditPeriodFilter, setAuditPeriodFilter] = useState('7days')
  const [auditPage, setAuditPage] = useState(1)

  // セキュリティポリシー
  const [minPasswordLength, setMinPasswordLength] = useState(12)
  const [passwordRequireUpper, setPasswordRequireUpper] = useState(true)
  const [passwordRequireNumber, setPasswordRequireNumber] = useState(true)
  const [passwordRequireSpecial, setPasswordRequireSpecial] = useState(true)
  const [passwordExpiry, setPasswordExpiry] = useState('0')
  const [sessionTimeout, setSessionTimeout] = useState('8h')
  const [maxConcurrentLogin, setMaxConcurrentLogin] = useState('unlimited')
  const [lockAfterFailures, setLockAfterFailures] = useState('5')
  const [lockDuration, setLockDuration] = useState('15')
  const [admin2FARequired, setAdmin2FARequired] = useState(true)
  const [client2FARequired, setClient2FARequired] = useState(false)
  const [twoFAMethod, setTwoFAMethod] = useState('totp')

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const filteredAuditLogs = AUDIT_LOGS.filter((log) => {
    const matchSearch =
      !auditSearch.trim() ||
      log.detail.toLowerCase().includes(auditSearch.trim().toLowerCase()) ||
      log.user.toLowerCase().includes(auditSearch.trim().toLowerCase())
    const matchAction = auditActionFilter === 'all' || log.action === auditActionFilter
    return matchSearch && matchAction
  })

  const auditTotalPages = Math.ceil(filteredAuditLogs.length / ITEMS_PER_PAGE)
  const paginatedAuditLogs = filteredAuditLogs.slice(
    (auditPage - 1) * ITEMS_PER_PAGE,
    auditPage * ITEMS_PER_PAGE
  )

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
            <p className="text-3xl font-bold text-white">{SUMMARY.activeSessions}</p>
            <p className="text-sm text-gray-400 mt-0.5">アクティブセッション</p>
            <p className="text-xs text-gray-500 mt-1">現在ログイン中のユーザー数</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{SUMMARY.loginAttempts}</p>
            <p className="text-sm text-gray-400 mt-0.5">今月のログイン試行</p>
            <p className="text-xs text-amber-400 mt-1">失敗: {SUMMARY.loginFailures}回</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{SUMMARY.twoFactorRate}%</p>
            <p className="text-sm text-gray-400 mt-0.5">2FA有効率</p>
            <p className="text-xs text-gray-500 mt-1">{SUMMARY.twoFactorCount}/{SUMMARY.twoFactorTotal}アカウント</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
            <p className="text-3xl font-bold text-white">{SUMMARY.alertCount}</p>
            <p className="text-sm text-gray-400 mt-0.5">直近のアラート</p>
            <p className="text-xs text-red-400 mt-1">未対応: {SUMMARY.unresolvedAlerts}件</p>
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

        {/* タブ1: アクセス管理 */}
        {activeTab === 'access' && (
          <div className="space-y-6">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h2 className="text-lg font-semibold text-white">管理者アカウント</h2>
                <button
                  type="button"
                  onClick={() => showToast('管理者追加機能は今後実装予定です')}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl shrink-0"
                >
                  管理者を追加
                </button>
                {/* TODO: 管理者追加モーダル */}
              </div>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-xs text-gray-500 py-3 px-4">名前</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">役割</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">2FA</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">最終ログイン</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">ステータス</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ADMIN_ACCOUNTS.map((row) => (
                      <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-4 px-4">
                          <p className="text-sm font-medium text-white">{row.name}</p>
                          <p className="text-xs text-gray-500">{row.email}</p>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex text-xs rounded-lg px-2 py-1 ${getRoleBadge(row.role)}`}>
                            {getRoleLabel(row.role)}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <span className={`w-2 h-2 rounded-full ${row.twoFactor ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                            {row.twoFactor ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-400">{row.lastLogin}</td>
                        <td className="py-4 px-4">
                          <span className={row.status === 'active' ? 'text-emerald-400' : 'text-red-400'}>
                            {row.status === 'active' ? 'アクティブ' : '停止中'}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => showToast('編集機能は今後実装予定です')}
                            className="text-sm text-blue-400 hover:text-blue-300 mr-3"
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => showToast('停止機能は今後実装予定です')}
                            className="text-sm text-blue-400 hover:text-blue-300"
                          >
                            停止
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="lg:hidden space-y-3">
                {ADMIN_ACCOUNTS.map((row) => (
                  <div
                    key={row.id}
                    className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-sm font-medium text-white">{row.name}</p>
                        <p className="text-xs text-gray-500">{row.email}</p>
                      </div>
                      <span className={`inline-flex text-xs rounded-lg px-2 py-1 shrink-0 ${getRoleBadge(row.role)}`}>
                        {getRoleLabel(row.role)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                      <span className={`w-2 h-2 rounded-full ${row.twoFactor ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                      {row.twoFactor ? '2FA有効' : '2FA無効'} | 最終: {row.lastLogin}
                    </div>
                    <span className={`text-xs ${row.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.status === 'active' ? 'アクティブ' : '停止中'}
                    </span>
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => showToast('編集機能は今後実装予定です')} className="text-xs text-blue-400">編集</button>
                      <button type="button" onClick={() => showToast('停止機能は今後実装予定です')} className="text-xs text-blue-400">停止</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">現在のアクティブセッション</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-xs text-gray-500 py-3 px-4">ユーザー</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">デバイス</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">IPアドレス</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">ログイン日時</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACTIVE_SESSIONS.map((row) => (
                      <tr key={row.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-4 px-4 text-sm text-white">{row.user}</td>
                        <td className="py-4 px-4 text-sm text-gray-400">{row.device}</td>
                        <td className="py-4 px-4 text-sm text-gray-400">{row.ip}</td>
                        <td className="py-4 px-4 text-sm text-gray-400">{row.datetime}</td>
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => showToast('強制ログアウト機能は今後実装予定です')}
                            className="text-sm text-blue-400 hover:text-blue-300"
                          >
                            強制ログアウト
                          </button>
                          {/* TODO: セッション無効化API */}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* TODO: 実データに差替え */}
            </div>
          </div>
        )}

        {/* タブ2: 監査ログ */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-4 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => {
                      setAuditSearch(e.target.value)
                      setAuditPage(1)
                    }}
                    placeholder="操作内容・ユーザー名で検索"
                    className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <select
                  value={auditActionFilter}
                  onChange={(e) => {
                    setAuditActionFilter(e.target.value)
                    setAuditPage(1)
                  }}
                  className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300"
                >
                  <option value="all">全て</option>
                  <option value="login">ログイン</option>
                  <option value="settings_change">設定変更</option>
                  <option value="data_edit">データ編集</option>
                  <option value="export">エクスポート</option>
                  <option value="permission_change">権限変更</option>
                </select>
                <select
                  value={auditPeriodFilter}
                  onChange={(e) => setAuditPeriodFilter(e.target.value)}
                  className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-gray-300"
                >
                  <option value="today">今日</option>
                  <option value="7days">過去7日</option>
                  <option value="30days">過去30日</option>
                  <option value="all">全期間</option>
                </select>
              </div>
            </div>

            <div className="hidden lg:block bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                      <th className="text-left text-xs text-gray-500 py-3 px-4">日時</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">ユーザー</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">アクション</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">詳細</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAuditLogs.map((log) => (
                      <tr key={log.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-4 px-4 text-xs text-gray-400">{log.datetime}</td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-white">{log.user}</span>
                            <span className={`text-xs rounded px-2 py-0.5 ${getRoleBadge(log.role)}`}>
                              {getRoleLabel(log.role)}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex text-xs rounded-lg px-2 py-1 ${getActionBadge(log.action)}`}>
                            {getActionLabel(log.action)}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-sm text-gray-300">{log.detail}</td>
                        <td className="py-4 px-4 text-xs text-gray-500">{log.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.04]">
                <p className="text-sm text-gray-400">
                  全{filteredAuditLogs.length}件中 {(auditPage - 1) * ITEMS_PER_PAGE + 1}〜{Math.min(auditPage * ITEMS_PER_PAGE, filteredAuditLogs.length)}件を表示
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage <= 1}
                    className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/[0.08]"
                  >
                    前へ
                  </button>
                  {Array.from({ length: auditTotalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAuditPage(p)}
                      className={`w-9 h-9 text-sm rounded-lg ${
                        auditPage === p ? 'bg-blue-600 text-white' : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.08]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage >= auditTotalPages}
                    className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/[0.08]"
                  >
                    次へ
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:hidden space-y-3">
              {paginatedAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="text-xs text-gray-400">{log.datetime}</span>
                    <span className={`text-xs rounded px-2 py-0.5 shrink-0 ${getActionBadge(log.action)}`}>
                      {getActionLabel(log.action)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white">{log.user}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{log.detail}</p>
                  <p className="text-xs text-gray-500 mt-1">{log.ip}</p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-gray-400">
                  全{filteredAuditLogs.length}件中 {(auditPage - 1) * ITEMS_PER_PAGE + 1}〜{Math.min(auditPage * ITEMS_PER_PAGE, filteredAuditLogs.length)}件を表示
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage <= 1}
                    className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50"
                  >
                    前へ
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage >= auditTotalPages}
                    className="w-9 h-9 text-sm bg-white/[0.05] text-gray-400 rounded-lg disabled:opacity-50"
                  >
                    次へ
                  </button>
                </div>
              </div>
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
                  NISTガイドライン（SP 800-63B）に準拠し、定期的なパスワード変更は求めません。
                  パスワードの漏洩が検知された場合のみ変更を要求します。
                  12文字以上で大文字・小文字・数字・特殊文字を各1文字以上含むことを推奨します。
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <InputLabel>最小文字数</InputLabel>
                  <input
                    type="number"
                    min={8}
                    max={32}
                    value={minPasswordLength}
                    onChange={(e) => setMinPasswordLength(Number(e.target.value) || 8)}
                    className="w-full max-w-[120px] bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <InputLabel>大文字必須</InputLabel>
                  <Toggle checked={passwordRequireUpper} onChange={setPasswordRequireUpper} />
                </div>
                <div className="flex items-center justify-between">
                  <InputLabel>数字必須</InputLabel>
                  <Toggle checked={passwordRequireNumber} onChange={setPasswordRequireNumber} />
                </div>
                <div className="flex items-center justify-between">
                  <InputLabel>特殊文字必須</InputLabel>
                  <Toggle checked={passwordRequireSpecial} onChange={setPasswordRequireSpecial} />
                </div>
                <div>
                  <InputLabel>パスワード有効期限</InputLabel>
                  <select
                    value={passwordExpiry}
                    onChange={(e) => setPasswordExpiry(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="30">30日</option>
                    <option value="60">60日</option>
                    <option value="90">90日</option>
                    <option value="0">無期限</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">セッション管理</h2>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  運営管理者は最終操作から8時間、企業アカウントは24時間でセッションが切れます。
                  同時ログインに制限はありません。アカウントロックは自動解除されますが、
                  緊急時は下記「企業アカウントロック管理」から手動解除も可能です。
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <InputLabel>セッションタイムアウト</InputLabel>
                  <select
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="30m">30分</option>
                    <option value="1h">1時間</option>
                    <option value="2h">2時間</option>
                    <option value="4h">4時間</option>
                    <option value="8h">8時間</option>
                  </select>
                </div>
                <div>
                  <InputLabel>同時ログイン数</InputLabel>
                  <select
                    value={maxConcurrentLogin}
                    onChange={(e) => setMaxConcurrentLogin(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="1">1台</option>
                    <option value="2">2台</option>
                    <option value="3">3台</option>
                    <option value="unlimited">無制限</option>
                  </select>
                </div>
                <div>
                  <InputLabel>ログイン失敗時のロック</InputLabel>
                  <select
                    value={lockAfterFailures}
                    onChange={(e) => setLockAfterFailures(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="3">3回</option>
                    <option value="5">5回</option>
                    <option value="10">10回</option>
                  </select>
                </div>
                <div>
                  <InputLabel>ロック解除までの時間</InputLabel>
                  <select
                    value={lockDuration}
                    onChange={(e) => setLockDuration(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="15">15分</option>
                    <option value="30">30分</option>
                    <option value="60">1時間</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">二要素認証設定</h2>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  運営管理者にはTOTP（Google Authenticator等）による二要素認証を必須とします。
                  企業アカウントには推奨としますが、強制はしません。
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <InputLabel>管理者に2FAを必須にする</InputLabel>
                  <Toggle checked={admin2FARequired} onChange={setAdmin2FARequired} />
                </div>
                <div className="flex items-center justify-between">
                  <InputLabel>企業アカウントに2FAを必須にする</InputLabel>
                  <Toggle checked={client2FARequired} onChange={setClient2FARequired} />
                </div>
                <div>
                  <InputLabel>2FA方式</InputLabel>
                  <select
                    value={twoFAMethod}
                    onChange={(e) => setTwoFAMethod(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="totp">TOTP（認証アプリ）</option>
                    <option value="sms">SMS</option>
                    <option value="email">メール</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
            </div>

            {/* 企業アカウントロック管理 */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-2">企業アカウントロック管理</h2>
              <p className="text-sm text-gray-400 mb-4">
                ログイン失敗によりロックされた企業アカウントを確認・解除できます。
                通常はロック時間経過後に自動解除されますが、緊急時はここから手動で解除してください。
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
              <button
                type="button"
                onClick={() => showToast('既読処理は今後実装予定です')}
                className="bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm px-4 py-2 rounded-xl shrink-0"
              >
                全て既読にする
              </button>
            </div>
            <div className="space-y-3">
              {SECURITY_ALERTS.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-white/[0.04] backdrop-blur-xl rounded-2xl p-5 ${
                    alert.status === 'unresolved' ? 'border border-red-500/30' : 'border border-white/[0.06]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <span className={`inline-flex text-xs rounded-lg px-2 py-1 w-fit ${getLevelBadge(alert.level)}`}>
                      {alert.level === 'high' ? '高' : alert.level === 'medium' ? '中' : '低'}
                    </span>
                    <span className={`text-sm ${alert.status === 'unresolved' ? 'text-red-400' : 'text-gray-500'}`}>
                      {alert.status === 'unresolved' ? '未対応' : '対応済み'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-white">{alert.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{alert.detail}</p>
                  <p className="text-xs text-gray-600 mt-2">{alert.datetime}</p>
                  {alert.status === 'unresolved' && (
                    <button
                      type="button"
                      onClick={() => showToast('ステータス更新機能は今後実装予定です')}
                      className="mt-3 text-sm text-blue-400 hover:text-blue-300"
                    >
                      対応済みにする
                    </button>
                  )}
                </div>
              ))}
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

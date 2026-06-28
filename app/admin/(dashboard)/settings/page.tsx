'use client'

import { useState, useEffect } from 'react'
import PasswordInput from '@/components/shared/PasswordInput'
import {
  MAX_INTERVIEW_MINUTES,
  INTERVIEW_WARNING_MINUTES,
  MAX_TOTAL_QUESTIONS,
  MAX_EVALUATION_QUESTIONS,
  MAX_ICEBREAKER_QUESTIONS,
  MAX_CLOSING_QUESTIONS,
  RECORDING_RETENTION_DAYS,
  DEEP_DIVE_MAX_PER_QUESTION,
} from '@/lib/config/interview-policy'

// メールテンプレートは既存API /api/admin/email-templates（email_templates テーブル）から取得
type EmailTemplate = {
  id: string
  company_id: string | null
  company_name: string
  template_type: string
  subject: string
  body: string
  updated_at: string
}

// 評価軸は EBCA（質問非依存・面接全体横断）で固定6軸。各軸0〜20点（合計120点）を100点満点へ換算する。
// 企業別/カスタム設定は持たない（固定仕様）。
const EVALUATION_AXES: { name: string; points: number }[] = [
  { name: 'コミュニケーション力', points: 20 },
  { name: '論理的思考力', points: 20 },
  { name: '主体性・行動力', points: 20 },
  { name: '志望度・意欲', points: 20 },
  { name: 'ストレス耐性・柔軟性', points: 20 },
  { name: '誠実性・一貫性', points: 20 },
]

function InputLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm text-gray-400 mb-1">{children}</label>
}

const CARD = 'bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4'
const INPUT = 'w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50'

// 請求書設定（billing_issuer_settings）のフォーム項目。発行者/振込先/文言。
// DBカラム key と表示ラベル。値は GET /api/admin/billing-settings から（未設定時は config が placeholder）。
const ISSUER_FIELDS: { key: string; label: string }[] = [
  { key: 'issuer_name', label: '発行者名' },
  { key: 'postal_code', label: '郵便番号' },
  { key: 'address', label: '住所' },
  { key: 'building', label: '建物名（任意）' },
  { key: 'tel', label: '電話番号' },
  { key: 'registration_number', label: '登録番号（空欄可）' },
]
const BANK_FIELDS: { key: string; label: string }[] = [
  { key: 'bank_name', label: '銀行名' },
  { key: 'branch_name', label: '支店名' },
  { key: 'account_type', label: '口座種別' },
  { key: 'account_number', label: '口座番号' },
  { key: 'account_holder', label: '口座名義' },
]
const ALL_ISSUER_KEYS = [...ISSUER_FIELDS, ...BANK_FIELDS].map((f) => f.key).concat('payment_note')

// 接続/実装状態（read-only・実ヘルスチェックではない＝「設定状態」）
const CONNECTION_STATUS: { name: string; status: string; tone: 'ok' | 'pending' }[] = [
  { name: 'Supabase（DB / 認証）', status: '接続済み', tone: 'ok' },
  { name: 'OpenAI（リアルタイム音声面接）', status: '未接続', tone: 'pending' },
  { name: 'Cloudflare R2（録画保存）', status: '未接続', tone: 'pending' },
  { name: 'Twilio（SMS / OTP）', status: '未接続', tone: 'pending' },
  { name: 'メール送信（Resend）', status: '未接続', tone: 'pending' },
  { name: 'レポート生成（EBCA writer）', status: '未実装', tone: 'pending' },
]

// 今後実装予定（read-only・操作不能）
const ROADMAP_ITEMS: { name: string; note: string }[] = [
  { name: '全体メンテナンスモード', note: '今後実装予定（現在は設定できません）' },
  { name: '新規応募・面接の緊急停止（全社）', note: '今後実装予定（企業単位の停止は企業管理で対応）' },
  { name: '障害通知（運営向け）', note: '今後実装予定（現在は設定できません）' },
  { name: '設定変更の監査ログ', note: '今後実装予定（現在は設定できません）' },
  { name: '失敗ジョブ・再試行（録画 / レポート）', note: '今後実装予定（現在は設定できません）' },
]

type TabId = 'policy' | 'connection' | 'security' | 'billing' | 'email' | 'roadmap'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('policy')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // 運営管理設定変更用パスワード（ログインPWとは別・実保存される実機能）
  const [adminSettingPwConfigured, setAdminSettingPwConfigured] = useState<boolean | null>(null)
  const [adminSettingPwCurrent, setAdminSettingPwCurrent] = useState('')
  const [adminSettingPwNew, setAdminSettingPwNew] = useState('')
  const [adminSettingPwConfirm, setAdminSettingPwConfirm] = useState('')
  const [adminSettingPwError, setAdminSettingPwError] = useState('')
  const [adminSettingPwLoading, setAdminSettingPwLoading] = useState(false)

  // メールテンプレート（実データ: email_templates・読み取り専用）
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [emailTemplatesLoading, setEmailTemplatesLoading] = useState(true)

  // 請求書設定（発行者/振込先/支払案内文・billing_issuer_settings・運営のみ）
  const [billingForm, setBillingForm] = useState<Record<string, string>>({})
  const [billingFallback, setBillingFallback] = useState<Record<string, string>>({})
  const [billingPwConfigured, setBillingPwConfigured] = useState<boolean | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)
  const [billingSaving, setBillingSaving] = useState(false)
  const [billingPw, setBillingPw] = useState('')
  const [billingError, setBillingError] = useState('')

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  // 運営管理設定変更用パスワードの設定状況を取得
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/security/setting-password')
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        setAdminSettingPwConfigured(res.ok ? !!json.configured : false)
      } catch {
        if (!cancelled) setAdminSettingPwConfigured(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // メールテンプレート一覧を取得
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/email-templates')
        if (!res.ok) {
          if (!cancelled) setEmailTemplates([])
          return
        }
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        setEmailTemplates(Array.isArray(json?.templates) ? (json.templates as EmailTemplate[]) : [])
      } catch {
        if (!cancelled) setEmailTemplates([])
      } finally {
        if (!cancelled) setEmailTemplatesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // 請求書設定を取得（運営のみ。client には公開しない API）
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/billing-settings')
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          const s = (json?.settings ?? {}) as Record<string, string | null>
          const next: Record<string, string> = {}
          for (const k of ALL_ISSUER_KEYS) next[k] = s?.[k] ?? ''
          setBillingForm(next)
          setBillingFallback((json?.fallback ?? {}) as Record<string, string>)
          setBillingPwConfigured(!!json?.settingPasswordConfigured)
        }
      } catch {
        // 取得失敗時は空のまま（保存は可能）
      } finally {
        if (!cancelled) setBillingLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSaveBillingSettings = async () => {
    setBillingError('')
    if (!billingPw) {
      setBillingError('運営管理設定変更用パスワードを入力してください')
      return
    }
    setBillingSaving(true)
    try {
      const res = await fetch('/api/admin/billing-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...billingForm, adminSettingPassword: billingPw }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBillingError(json?.error?.message ?? '保存に失敗しました')
        return
      }
      setBillingPw('')
      showToast('請求書設定を保存しました')
    } catch {
      setBillingError('保存に失敗しました')
    } finally {
      setBillingSaving(false)
    }
  }

  const handleAdminSettingPasswordSubmit = async () => {
    setAdminSettingPwError('')
    if (!adminSettingPwNew || !adminSettingPwConfirm) {
      setAdminSettingPwError('新しいパスワードを入力してください')
      return
    }
    if (adminSettingPwNew.length < 8) {
      setAdminSettingPwError('パスワードは8文字以上で設定してください')
      return
    }
    if (adminSettingPwNew !== adminSettingPwConfirm) {
      setAdminSettingPwError('新しいパスワードと確認用パスワードが一致しません')
      return
    }
    if (adminSettingPwConfigured && !adminSettingPwCurrent) {
      setAdminSettingPwError('現在の設定変更用パスワードを入力してください')
      return
    }
    const wasConfigured = adminSettingPwConfigured
    setAdminSettingPwLoading(true)
    try {
      const res = await fetch('/api/admin/security/setting-password', {
        method: wasConfigured ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          wasConfigured
            ? { currentPassword: adminSettingPwCurrent, newPassword: adminSettingPwNew }
            : { newPassword: adminSettingPwNew },
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAdminSettingPwError(json?.error?.message ?? '保存に失敗しました')
        return
      }
      setAdminSettingPwConfigured(true)
      setAdminSettingPwCurrent('')
      setAdminSettingPwNew('')
      setAdminSettingPwConfirm('')
      showToast(wasConfigured ? '設定変更用パスワードを変更しました' : '設定変更用パスワードを設定しました')
    } catch {
      setAdminSettingPwError('保存に失敗しました')
    } finally {
      setAdminSettingPwLoading(false)
    }
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'policy', label: '運用ポリシー' },
    { id: 'connection', label: '接続状態' },
    { id: 'security', label: 'セキュリティ' },
    { id: 'billing', label: '請求書設定' },
    { id: 'email', label: 'メール' },
    { id: 'roadmap', label: '今後実装予定' },
  ]

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* ヘッダー */}
        <div>
          <h1 className="text-2xl font-bold text-white">システム設定</h1>
          <p className="text-sm text-gray-400 mt-1">プラットフォーム全体の運用ポリシー・状態（料金・企業別設定・設定パスワード以外の編集機能は持ちません）</p>
        </div>

        {/* タブナビゲーション */}
        <div className="flex gap-1 bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-xl p-1 mb-6 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* タブ1: 運用ポリシー（固定仕様・read-only） */}
        {activeTab === 'policy' && (
          <div className="space-y-4">
            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-1">面接の運用ポリシー（固定仕様）</h2>
              <p className="text-xs text-gray-500 mb-4">システム共通の固定値です（編集不可）。値は lib/config/interview-policy で一元管理しています。</p>
              <dl className="divide-y divide-white/[0.06] text-sm">
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">面接最大時間</dt><dd className="text-white font-medium">{MAX_INTERVIEW_MINUTES}分</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">残り時間警告（開始からの経過）</dt><dd className="text-white font-medium">{INTERVIEW_WARNING_MINUTES}分時点</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">全質問上限（アイスブレイク＋評価＋クロージング）</dt><dd className="text-white font-medium">{MAX_TOTAL_QUESTIONS}問</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">アイスブレイク上限</dt><dd className="text-white font-medium">{MAX_ICEBREAKER_QUESTIONS}問</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">評価質問（evaluation）上限</dt><dd className="text-white font-medium">{MAX_EVALUATION_QUESTIONS}問</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">クロージング上限</dt><dd className="text-white font-medium">{MAX_CLOSING_QUESTIONS}問</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">録画保存期間</dt><dd className="text-white font-medium">{RECORDING_RETENTION_DAYS}日（適用予定値）</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-gray-400">深掘り質問</dt><dd className="text-amber-300 font-medium">最大{DEEP_DIVE_MAX_PER_QUESTION}回/質問（設計仕様・未実装）</dd></div>
              </dl>
            </div>

            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-1">デフォルト評価軸（固定仕様）</h2>
              <p className="text-xs text-gray-500 mb-4">EBCA（面接全体を横断して6軸でスコア化）。各軸0〜20点・合計120点を100点満点へ換算します。企業別/カスタム設定は持ちません（編集不可）。</p>
              <dl className="divide-y divide-white/[0.06] text-sm">
                {EVALUATION_AXES.map((axis) => (
                  <div key={axis.name} className="flex items-center justify-between py-2">
                    <dt className="text-gray-300">{axis.name}</dt>
                    <dd className="text-white font-medium">{axis.points}点</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2">
                  <dt className="text-gray-400">合計</dt>
                  <dd className="text-white font-medium">120点 → 100点満点へ換算</dd>
                </div>
              </dl>
              <p className="text-xs text-amber-300/90 mt-4">固定の設計仕様です。レポート生成機能は現在未実装です。</p>
            </div>

            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-1">料金モデル（参考・編集は企業管理／課金管理）</h2>
              <p className="text-xs text-gray-500 mb-4">料金・月間上限は企業ごとに「企業管理」で設定します。ここは参考表示のみ（編集不可）。</p>
              <div className="space-y-3 text-sm">
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
                  <p className="text-white font-medium">基本料金: 1面接・1人あたり ¥4,000（税別）</p>
                  <p className="text-xs text-gray-400 mt-1">プラン: 従量課金（pay_per_use）／ カスタム（custom）</p>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
                  <p className="text-gray-300">月間上限人数は企業詳細画面から企業ごとに設定（最低5人）。上限到達後は面接が自動停止。</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* タブ2: 接続状態（read-only・実ヘルスチェックではない） */}
        {activeTab === 'connection' && (
          <div className="space-y-4">
            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-1">接続状態（設定状態）</h2>
              <p className="text-xs text-gray-500 mb-4">これは実ヘルスチェックではなく、現在の「設定状態」です。外部APIキーは表示しません（.env 管理）。</p>
              <dl className="divide-y divide-white/[0.06] text-sm">
                {CONNECTION_STATUS.map((c) => (
                  <div key={c.name} className="flex justify-between py-2.5">
                    <dt className="text-gray-400">{c.name}</dt>
                    <dd className={c.tone === 'ok' ? 'text-emerald-400 font-medium' : 'text-gray-300 font-medium'}>{c.status}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {/* タブ3: セキュリティ（運営管理設定変更用パスワード・実保存される実機能） */}
        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-4">運営管理設定変更用パスワード</h2>
              <p className="text-sm text-gray-400 mb-3">
                企業設定・単価・月間上限などの重要設定を変更する際に使用する、ログインパスワードとは別のパスワードです。
              </p>
              <p className="text-xs mb-4">
                {adminSettingPwConfigured === null
                  ? <span className="text-gray-500">状態を確認中...</span>
                  : adminSettingPwConfigured
                    ? <span className="text-emerald-400 font-medium">設定済み</span>
                    : <span className="text-amber-400 font-medium">未設定</span>}
              </p>
              <div className="space-y-4 max-w-md">
                {adminSettingPwConfigured && (
                  <div>
                    <InputLabel>現在の運営管理設定変更用パスワード</InputLabel>
                    <PasswordInput
                      value={adminSettingPwCurrent}
                      onChange={setAdminSettingPwCurrent}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                      placeholder="現在の運営管理設定変更用パスワードを入力"
                      iconClassName="text-gray-400 hover:text-gray-200"
                    />
                  </div>
                )}
                <div>
                  <InputLabel>新しい運営管理設定変更用パスワード</InputLabel>
                  <PasswordInput
                    value={adminSettingPwNew}
                    onChange={setAdminSettingPwNew}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                    placeholder="新しいパスワードを入力"
                    iconClassName="text-gray-400 hover:text-gray-200"
                  />
                  <p className="text-xs text-gray-500 mt-1">8文字以上で設定してください</p>
                </div>
                <div>
                  <InputLabel>新しい運営管理設定変更用パスワード（確認）</InputLabel>
                  <PasswordInput
                    value={adminSettingPwConfirm}
                    onChange={setAdminSettingPwConfirm}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                    placeholder="新しいパスワードを再入力"
                    iconClassName="text-gray-400 hover:text-gray-200"
                  />
                </div>
                {adminSettingPwError && <p className="text-sm text-red-400">{adminSettingPwError}</p>}
                <button
                  type="button"
                  onClick={handleAdminSettingPasswordSubmit}
                  disabled={adminSettingPwLoading || adminSettingPwConfigured === null}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60"
                >
                  {adminSettingPwLoading ? '保存中...' : adminSettingPwConfigured ? '変更する' : '設定する'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                IPブロック・アカウントロック等のセキュリティ運用は「セキュリティ」画面（/admin/security）で管理します。
              </p>
            </div>
          </div>
        )}

        {/* タブ: 請求書設定（発行者/振込先/支払案内文・運営のみ・client非公開） */}
        {activeTab === 'billing' && (
          <div className="space-y-4">
            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-1">請求書の発行者・振込先設定</h2>
              <p className="text-xs text-gray-500 mb-4">
                請求書PDFに記載する発行者情報・振込先・支払案内文です。運営のみ編集できます（企業側には表示されません）。
                未入力の項目は既定値（lib/config/billing.ts）が使われます。保存には運営管理設定変更用パスワードが必要です。
              </p>

              {billingLoading ? (
                <p className="text-sm text-gray-500 py-6 text-center">読み込み中...</p>
              ) : (
                <div className="space-y-6">
                  {/* 発行者 */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">発行者情報</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                      {ISSUER_FIELDS.map((f) => (
                        <div key={f.key}>
                          <InputLabel>{f.label}</InputLabel>
                          <input
                            type="text"
                            value={billingForm[f.key] ?? ''}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={billingFallback[f.key] || ''}
                            className={INPUT}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 振込先 */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">振込先情報</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                      {BANK_FIELDS.map((f) => (
                        <div key={f.key}>
                          <InputLabel>{f.label}</InputLabel>
                          <input
                            type="text"
                            value={billingForm[f.key] ?? ''}
                            onChange={(e) => setBillingForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={billingFallback[f.key] || ''}
                            className={INPUT}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 支払案内文/備考 */}
                  <div className="max-w-2xl">
                    <InputLabel>支払案内文 / 備考</InputLabel>
                    <textarea
                      value={billingForm['payment_note'] ?? ''}
                      onChange={(e) => setBillingForm((prev) => ({ ...prev, payment_note: e.target.value }))}
                      placeholder={billingFallback['payment_note'] || ''}
                      rows={3}
                      className={INPUT}
                    />
                  </div>

                  {/* 設定パスワード＋保存 */}
                  <div className="max-w-md space-y-3 border-t border-white/[0.06] pt-5">
                    {billingPwConfigured === false && (
                      <p className="text-xs text-amber-400">
                        運営管理設定変更用パスワードが未設定です。「セキュリティ」タブで設定してから保存してください。
                      </p>
                    )}
                    <div>
                      <InputLabel>運営管理設定変更用パスワード</InputLabel>
                      <PasswordInput
                        value={billingPw}
                        onChange={setBillingPw}
                        className={INPUT}
                        placeholder="保存するには入力してください"
                        iconClassName="text-gray-400 hover:text-gray-200"
                      />
                    </div>
                    {billingError && <p className="text-sm text-red-400">{billingError}</p>}
                    <button
                      type="button"
                      onClick={handleSaveBillingSettings}
                      disabled={billingSaving || billingPwConfigured === false}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors disabled:opacity-60"
                    >
                      {billingSaving ? '保存中...' : '保存する'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* タブ4: メール（テンプレート一覧は実データ読み取り。送信元・編集・Resendは未接続/今後実装予定） */}
        {activeTab === 'email' && (
          <div className="space-y-4">
            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-2">メール送信（Resend）</h2>
              <p className="text-sm text-gray-300">状態: <span className="text-gray-400 font-medium">未接続</span></p>
              <p className="text-xs text-gray-500 mt-2">送信元アドレス・送信元表示名・APIキーは .env 管理で、画面からの設定は今後実装予定です（現在は設定できません）。</p>
            </div>

            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-4">メールテンプレート一覧（読み取り専用）</h2>
              <div className="space-y-2">
                {emailTemplatesLoading ? (
                  <p className="text-sm text-gray-500 py-6 text-center">読み込み中...</p>
                ) : emailTemplates.length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">メールテンプレートはまだありません</p>
                ) : (
                  emailTemplates.map((t) => (
                    <div key={t.id} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4">
                      <p className="text-sm font-medium text-white truncate">{t.subject || t.template_type}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {t.template_type}{t.company_name ? ` ・ ${t.company_name}` : ''}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-gray-500 mt-3">テンプレートの編集は今後実装予定です（現在は閲覧のみ）。</p>
            </div>
          </div>
        )}

        {/* タブ5: 今後実装予定（read-only・操作不能） */}
        {activeTab === 'roadmap' && (
          <div className="space-y-4">
            <div className={CARD}>
              <h2 className="text-lg font-semibold text-white mb-1">今後実装予定</h2>
              <p className="text-xs text-gray-500 mb-4">以下は未実装です。現在は設定できません（表示のみ）。</p>
              <dl className="divide-y divide-white/[0.06] text-sm">
                {ROADMAP_ITEMS.map((r) => (
                  <div key={r.name} className="flex flex-col sm:flex-row sm:justify-between gap-1 py-2.5">
                    <dt className="text-gray-300">{r.name}</dt>
                    <dd className="text-amber-300/90 text-xs sm:text-sm">{r.note}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>

      {/* トースト（設定変更用パスワード保存の成否表示） */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-50 bg-white/[0.08] backdrop-blur-2xl border border-white/[0.10] rounded-xl shadow-lg px-5 py-3 text-sm text-gray-300">
          {toastMessage}
        </div>
      )}
    </>
  )
}

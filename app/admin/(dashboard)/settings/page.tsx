'use client'

import { useState } from 'react'

// TODO: 実データに差替え
const EMAIL_TEMPLATES = [
  { name: '面接案内メール', status: '使用中' },
  { name: '面接リマインダー', status: '使用中' },
  { name: '面接完了通知', status: '使用中' },
  { name: '結果通知メール', status: '未設定' },
]

// TODO: 実データに差替え
const API_LOGS = [
  { date: '2026-02-15 14:32', service: 'OpenAI', action: '面接実行', status: '成功', detail: '1,250 tokens' },
  { date: '2026-02-15 14:28', service: 'Resend', action: '面接案内メール', status: '成功', detail: '—' },
  { date: '2026-02-15 13:55', service: 'OpenAI', action: '質問変更判定', status: '成功', detail: '830 tokens' },
  { date: '2026-02-15 13:40', service: 'OpenAI', action: '面接実行', status: '成功', detail: '1,480 tokens' },
  { date: '2026-02-15 12:10', service: 'Resend', action: 'リマインダー', status: '失敗', detail: '—' },
]

// TODO: 実データに差替え
const EVALUATION_AXES = [
  { name: 'コミュニケーション', weight: 16.7 },
  { name: '論理的思考', weight: 16.7 },
  { name: 'カルチャーフィット', weight: 16.7 },
  { name: '仕事への意欲', weight: 16.7 },
  { name: '課題対応力', weight: 16.7 },
  { name: '成長可能性', weight: 16.5 },
]

function Toggle({
  checked,
  onChange,
  size = 'md',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  size?: 'sm' | 'md'
}) {
  const isMd = size === 'md'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
        checked ? 'bg-blue-600' : 'bg-gray-600'
      } ${isMd ? 'w-12 h-6' : 'w-11 h-5'}`}
    >
      <span
        className={`absolute top-0.5 block bg-white rounded-full shadow transition-transform duration-200 ${
          isMd ? 'left-0.5 w-5 h-5' : 'left-0.5 w-4 h-4'
        } ${checked ? (isMd ? 'translate-x-6' : 'translate-x-5') : 'translate-x-0'}`}
      />
    </button>
  )
}

function InputLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm text-gray-400 mb-1">{children}</label>
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'email' | 'interview' | 'api' | 'notification'>('general')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // TODO: 実データに差替え（一般設定の初期値）
  const [serviceName, setServiceName] = useState('AI面接官')
  const [serviceUrl, setServiceUrl] = useState('https://ai-interview.example.com')
  const [operatorName, setOperatorName] = useState('株式会社AIインタビュー')
  const [supportEmail, setSupportEmail] = useState('support@ai-interview.example.com')
  const [planA, setPlanA] = useState({ name: 'スタータープラン', fee: '50000', limit: '10' })
  const [planB, setPlanB] = useState({ name: 'スタンダードプラン', fee: '100000', limit: '30' })
  const [planC, setPlanC] = useState({ name: 'プレミアムプラン', fee: '150000', limit: '50' })
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('現在メンテナンス中です。しばらくお待ちください。')

  // TODO: 実データに差替え（メール設定の初期値）
  const [resendApiKey, setResendApiKey] = useState('re_xxxx...xxxx')
  const [fromEmail, setFromEmail] = useState('noreply@ai-interview.example.com')
  const [fromName, setFromName] = useState('AI面接官')

  // TODO: 実データに差替え（面接設定の初期値）
  const [defaultDuration, setDefaultDuration] = useState('30')
  const [defaultQuestionCount, setDefaultQuestionCount] = useState('9')
  const [openaiApiKey, setOpenaiApiKey] = useState('sk-xxxx...xxxx')
  const [openaiModel, setOpenaiModel] = useState('GPT-4o')
  const [voiceModel, setVoiceModel] = useState('alloy')
  const [interviewTone, setInterviewTone] = useState('セミフォーマル')

  // TODO: 実データに差替え（通知設定の初期値）
  const [adminNotifyEmail, setAdminNotifyEmail] = useState('admin@ai-interview.example.com')
  const [adminNotifications, setAdminNotifications] = useState({
    newCompany: true,
    changeRequest: true,
    paymentOverdue: true,
    interviewError: true,
    monthlyReport: true,
    apiError: false,
  })
  const [clientNotifications, setClientNotifications] = useState({
    interviewComplete: true,
    monthlyReport: true,
    planWarning: true,
    invoiceIssued: true,
    maintenanceNotice: false,
  })

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2000)
  }

  const updateAdminNotification = (key: keyof typeof adminNotifications, value: boolean) => {
    setAdminNotifications((prev) => ({ ...prev, [key]: value }))
  }

  const updateClientNotification = (key: keyof typeof clientNotifications, value: boolean) => {
    setClientNotifications((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <>
      <div className="space-y-6 min-w-0 max-w-[100vw] pb-10">
        {/* セクション1: ヘッダー */}
        <div>
          <h1 className="text-2xl font-bold text-white">システム設定</h1>
          <p className="text-sm text-gray-400 mt-1">プラットフォーム全体の設定管理</p>
        </div>

        {/* セクション2: タブナビゲーション */}
        <div className="flex gap-1 bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-xl p-1 mb-6 overflow-x-auto">
          {[
            { id: 'general' as const, label: '一般設定' },
            { id: 'email' as const, label: 'メール設定' },
            { id: 'interview' as const, label: '面接設定' },
            { id: 'api' as const, label: 'API設定' },
            { id: 'notification' as const, label: '通知設定' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white/[0.08] text-white'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* タブ1: 一般設定 */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">サービス基本情報</h2>
              <div className="space-y-4">
                <div>
                  <InputLabel>サービス名</InputLabel>
                  <input
                    type="text"
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <InputLabel>サービスURL</InputLabel>
                  <input
                    type="text"
                    value={serviceUrl}
                    onChange={(e) => setServiceUrl(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <InputLabel>運営会社名</InputLabel>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <InputLabel>サポートメールアドレス</InputLabel>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">デフォルトプラン設定</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-400">プランA</p>
                  <div>
                    <InputLabel>名前</InputLabel>
                    <input
                      type="text"
                      value={planA.name}
                      onChange={(e) => setPlanA((p) => ({ ...p, name: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <InputLabel>月額（円）</InputLabel>
                    <input
                      type="text"
                      value={planA.fee}
                      onChange={(e) => setPlanA((p) => ({ ...p, fee: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <InputLabel>面接上限</InputLabel>
                    <input
                      type="text"
                      value={planA.limit}
                      onChange={(e) => setPlanA((p) => ({ ...p, limit: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-400">プランB</p>
                  <div>
                    <InputLabel>名前</InputLabel>
                    <input
                      type="text"
                      value={planB.name}
                      onChange={(e) => setPlanB((p) => ({ ...p, name: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <InputLabel>月額（円）</InputLabel>
                    <input
                      type="text"
                      value={planB.fee}
                      onChange={(e) => setPlanB((p) => ({ ...p, fee: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <InputLabel>面接上限</InputLabel>
                    <input
                      type="text"
                      value={planB.limit}
                      onChange={(e) => setPlanB((p) => ({ ...p, limit: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                </div>
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-400">プランC</p>
                  <div>
                    <InputLabel>名前</InputLabel>
                    <input
                      type="text"
                      value={planC.name}
                      onChange={(e) => setPlanC((p) => ({ ...p, name: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <InputLabel>月額（円）</InputLabel>
                    <input
                      type="text"
                      value={planC.fee}
                      onChange={(e) => setPlanC((p) => ({ ...p, fee: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <InputLabel>面接上限</InputLabel>
                    <input
                      type="text"
                      value={planC.limit}
                      onChange={(e) => setPlanC((p) => ({ ...p, limit: e.target.value }))}
                      className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 text-white text-sm"
                    />
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">メンテナンスモード</h2>
              <div className="flex items-center gap-3">
                <Toggle checked={maintenanceMode} onChange={setMaintenanceMode} />
                <span className="text-sm text-gray-400">
                  {maintenanceMode ? 'ON' : 'OFF'}
                </span>
              </div>
              {maintenanceMode && (
                <div className="mt-4">
                  <InputLabel>メンテナンスメッセージ</InputLabel>
                  <textarea
                    value={maintenanceMessage}
                    onChange={(e) => setMaintenanceMessage(e.target.value)}
                    rows={2}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              )}
              <p className="text-xs text-amber-400 mt-2">
                ONにすると企業側・応募者側の全画面にメンテナンス表示されます
              </p>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>
          </div>
        )}

        {/* タブ2: メール設定 */}
        {activeTab === 'email' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">メール送信設定（Resend）</h2>
              <div className="space-y-4">
                <div>
                  <InputLabel>APIキー</InputLabel>
                  <input
                    type="password"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>
                <div>
                  <InputLabel>送信元メールアドレス</InputLabel>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>
                <div>
                  <InputLabel>送信元表示名</InputLabel>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => showToast('メール接続テスト機能は今後実装予定です')}
                  className="bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm px-4 py-2 rounded-xl"
                >
                  接続テスト
                </button>
                {/* TODO: Resend API接続テスト */}
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">メールテンプレート一覧</h2>
              <div className="space-y-2">
                {EMAIL_TEMPLATES.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-white/[0.04] border border-white/[0.06] rounded-xl p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.status}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => showToast('テンプレート編集機能は今後実装予定です')}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      編集
                    </button>
                    {/* TODO: テンプレート編集モーダル */}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* タブ3: 面接設定 */}
        {activeTab === 'interview' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">面接基本設定</h2>
              <div className="space-y-4">
                <div>
                  <InputLabel>デフォルト面接時間</InputLabel>
                  <select
                    value={defaultDuration}
                    onChange={(e) => setDefaultDuration(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="15">15分</option>
                    <option value="20">20分</option>
                    <option value="30">30分</option>
                    <option value="40">40分</option>
                    <option value="60">60分</option>
                  </select>
                </div>
                <div>
                  <InputLabel>デフォルト質問数</InputLabel>
                  <select
                    value={defaultQuestionCount}
                    onChange={(e) => setDefaultQuestionCount(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="5">5問</option>
                    <option value="7">7問</option>
                    <option value="9">9問</option>
                    <option value="12">12問</option>
                  </select>
                </div>
                <div>
                  <InputLabel>深掘り最大回数</InputLabel>
                  <p className="text-sm text-gray-400 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
                    AIが回答の充実度に応じて0〜2回自動判定（v9.0仕様）
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">AI面接官設定</h2>
              <div className="space-y-4">
                <div>
                  <InputLabel>OpenAI APIキー</InputLabel>
                  <input
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>
                <div>
                  <InputLabel>使用モデル</InputLabel>
                  <select
                    value={openaiModel}
                    onChange={(e) => setOpenaiModel(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="GPT-4o">GPT-4o</option>
                    <option value="GPT-4o-mini">GPT-4o-mini</option>
                    <option value="GPT-4-turbo">GPT-4-turbo</option>
                  </select>
                </div>
                <div>
                  <InputLabel>音声モデル</InputLabel>
                  <select
                    value={voiceModel}
                    onChange={(e) => setVoiceModel(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="alloy">alloy</option>
                    <option value="echo">echo</option>
                    <option value="fable">fable</option>
                    <option value="onyx">onyx</option>
                    <option value="nova">nova</option>
                    <option value="shimmer">shimmer</option>
                  </select>
                </div>
                <div>
                  <InputLabel>面接官のトーン</InputLabel>
                  <select
                    value={interviewTone}
                    onChange={(e) => setInterviewTone(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="フォーマル">フォーマル</option>
                    <option value="セミフォーマル">セミフォーマル</option>
                    <option value="カジュアル">カジュアル</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => showToast('API接続テスト機能は今後実装予定です')}
                  className="bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm px-4 py-2 rounded-xl"
                >
                  接続テスト
                </button>
                {/* TODO: OpenAI API接続テスト */}
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">デフォルト評価軸</h2>
              <div className="space-y-3">
                {EVALUATION_AXES.map((axis, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-sm text-gray-300 w-40 shrink-0">{axis.name}</span>
                    <span className="text-sm text-gray-500">{axis.weight}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-400 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3">
                全軸均等 16.7%（v9.0で固定、将来的にカスタム対応予定）
              </p>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>
          </div>
        )}

        {/* タブ4: API設定 */}
        {activeTab === 'api' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">外部API連携</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-xs text-gray-500 py-3 px-4">サービス</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">ステータス</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">APIキー</th>
                      <th className="text-left text-xs text-gray-500 py-3 px-4">アクション</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-4 px-4 text-sm text-white">OpenAI</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-2 text-sm text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          接続済み
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-500">sk-xxxx...xxxx</td>
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => showToast('API設定の変更機能は今後実装予定です')}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          設定変更
                        </button>
                        {/* TODO: API設定モーダル */}
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-4 px-4 text-sm text-white">Resend</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-2 text-sm text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          接続済み
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-500">re-xxxx...xxxx</td>
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => showToast('API設定の変更機能は今後実装予定です')}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          設定変更
                        </button>
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-4 px-4 text-sm text-white">Stripe</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-2 text-sm text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-gray-500" />
                          未接続
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-500">—</td>
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => showToast('API設定の変更機能は今後実装予定です')}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          設定する
                        </button>
                      </td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-4 px-4 text-sm text-white">Supabase</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-2 text-sm text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          接続済み
                        </span>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-500">eyJxx...xxxx</td>
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => showToast('API設定の変更機能は今後実装予定です')}
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          設定変更
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">直近のAPIコール</h2>
              <div className="space-y-2">
                {API_LOGS.map((log, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-sm"
                  >
                    <span className="text-gray-500">{log.date}</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-white">{log.service}</span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-300">{log.action}</span>
                    <span className="text-gray-400">|</span>
                    <span
                      className={
                        log.status === '成功' ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {log.status}
                    </span>
                    <span className="text-gray-400">|</span>
                    <span className="text-gray-500">{log.detail}</span>
                  </div>
                ))}
              </div>
              {/* TODO: 実データに差替え */}
            </div>
          </div>
        )}

        {/* タブ5: 通知設定 */}
        {activeTab === 'notification' && (
          <div className="space-y-4">
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">運営チームへの通知</h2>
              <div className="space-y-4">
                <div>
                  <InputLabel>通知先メールアドレス</InputLabel>
                  <input
                    type="email"
                    value={adminNotifyEmail}
                    onChange={(e) => setAdminNotifyEmail(e.target.value)}
                    className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>
                <div className="space-y-3">
                  {[
                    { key: 'newCompany' as const, label: '新規企業登録時' },
                    { key: 'changeRequest' as const, label: '変更リクエスト受信時' },
                    { key: 'paymentOverdue' as const, label: '支払い遅延発生時' },
                    { key: 'interviewError' as const, label: '面接エラー発生時' },
                    { key: 'monthlyReport' as const, label: '月次レポート自動送信' },
                    { key: 'apiError' as const, label: 'APIエラー発生時' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{label}</span>
                      <Toggle
                        size="sm"
                        checked={adminNotifications[key]}
                        onChange={(v) => updateAdminNotification(key, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
            </div>

            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 mb-4">
              <h2 className="text-lg font-semibold text-white mb-4">企業への自動通知</h2>
              <div className="space-y-3">
                {[
                  { key: 'interviewComplete' as const, label: '面接完了時の結果通知' },
                  { key: 'monthlyReport' as const, label: '月次利用レポート' },
                  { key: 'planWarning' as const, label: 'プラン上限接近時の警告（残り20%）' },
                  { key: 'invoiceIssued' as const, label: '請求書発行時' },
                  { key: 'maintenanceNotice' as const, label: 'メンテナンス予告' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{label}</span>
                    <Toggle
                      size="sm"
                      checked={clientNotifications[key]}
                      onChange={(v) => updateClientNotification(key, v)}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => showToast('設定を保存しました')}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-xl"
              >
                保存
              </button>
              {/* TODO: Supabaseに保存 */}
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

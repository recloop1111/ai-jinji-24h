'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { hasDemoCookie, clearDemoCookie } from '@/lib/config/demo'
import { LayoutGrid as DashboardIcon, Users as UsersIcon, Briefcase as BriefcaseIcon, MessageSquare as QuestionsIcon, Mail as MailIcon, FileText as PlanIcon, CircleDollarSign as BillingIcon, Settings as SettingsIcon, Pause as SuspensionIcon, User as PersonIcon, Menu as MenuIcon, X as CloseIcon, Copy as CopyIcon, ArrowLeft as BackIcon } from 'lucide-react'

// TODO: 実際の企業URLに差替え
const INTERVIEW_URL = 'https://ai-jinji-24h.vercel.app/interview/demo-company'

const navigation = [
  { name: 'ダッシュボード', href: '/client/dashboard', icon: DashboardIcon },
  { name: '応募者一覧', href: '/client/applicants', icon: UsersIcon },
  { name: '求人管理', href: '/client/jobs', icon: BriefcaseIcon },
  { name: '面接質問設定', href: '/client/questions', icon: QuestionsIcon },
  { name: 'メールテンプレート', href: '/client/templates', icon: MailIcon },
  { name: 'プラン・契約', href: '/client/plan', icon: PlanIcon },
  { name: '請求履歴', href: '/client/billing', icon: BillingIcon },
  { name: '設定', href: '/client/settings', icon: SettingsIcon },
  { name: '停止申請', href: '/client/suspension', icon: SuspensionIcon },
]

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [companyName, setCompanyName] = useState('')

  // ヘッダーの企業名: demo時は「デモ企業」、実ログイン時は /api/client/company から取得
  useEffect(() => {
    let cancelled = false
    async function loadCompanyName() {
      // デモ判定はサーバ判別可能な cookie（dev のみ・本番無効）。sessionStorage は使わない。
      if (hasDemoCookie()) {
        if (!cancelled) setCompanyName('デモ企業')
        return
      }
      try {
        const res = await fetch('/api/client/company')
        const json = res.ok ? await res.json() : null
        if (!cancelled) setCompanyName(json?.name || '--')
      } catch {
        if (!cancelled) setCompanyName('--')
      }
    }
    loadCompanyName()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(INTERVIEW_URL)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // fallback
    }
  }

  const handleLogout = () => {
    clearDemoCookie()
    router.push('/client/login')
  }

  // ルート（ダッシュボード）以外で「戻る」を表示。履歴があれば1つ前へ、無ければダッシュボードへ。
  const showBack = pathname !== '/client/dashboard'
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/client/dashboard')
    }
  }

  const isActive = (href: string) => pathname === href || (href !== '/client/dashboard' && pathname.startsWith(href))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* モバイル: オーバーレイ背景 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* サイドバー */}
      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ロゴ */}
        <div className="p-5 border-b border-slate-200 shrink-0">
          <h1 className="text-lg font-bold text-slate-900">AI人事24h</h1>
          <p className="text-xs text-slate-500 mt-0.5">企業管理画面</p>
        </div>

        {/* メニュー */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive(item.href) ? 'text-indigo-600' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* 面接URLコピー */}
        <div className="p-4 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={handleCopyUrl}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            <CopyIcon className="w-4 h-4 shrink-0" />
            {copySuccess ? 'コピーしました' : '面接URLをコピー'}
          </button>
          {copySuccess && (
            <p className="mt-1.5 text-xs text-slate-500 text-center truncate" title={INTERVIEW_URL}>
              {INTERVIEW_URL}
            </p>
          )}
        </div>

        {/* ログアウト */}
        <div className="p-4 border-t border-slate-200 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left px-3 py-2.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインエリア */}
      <div className="md:pl-60">
        {/* ヘッダー */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="メニューを開く"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          {showBack && (
            <button
              type="button"
              onClick={handleBack}
              title="前の画面へ戻る"
              aria-label="前の画面へ戻る"
              className="p-2 -ml-1 rounded-lg hover:bg-slate-100 text-slate-600 shrink-0"
            >
              <BackIcon className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-700 hidden sm:inline">{companyName || '読み込み中'}</span>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600">
              <PersonIcon className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* コンテンツ */}
        <main className="p-4 md:p-6">{children}</main>
      </div>

      {/* モバイル: サイドバー内の閉じるボタン */}
      {sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed top-4 right-4 p-2 rounded-lg bg-white/90 hover:bg-white text-slate-600 z-[60] md:hidden"
          aria-label="メニューを閉じる"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}

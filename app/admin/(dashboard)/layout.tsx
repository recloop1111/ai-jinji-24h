'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navigation = [
  { name: 'ダッシュボード', href: '/admin', icon: GridIcon },
  { name: '企業管理', href: '/admin/companies', icon: BuildingIcon },
  { name: '応募者管理', href: '/admin/applicants', icon: UsersIcon },
  { name: '質問バンク', href: '/admin/questions', icon: ChatBubbleIcon },
  { name: '課金管理', href: '/admin/billing', icon: YenIcon },
  { name: 'システム設定', href: '/admin/settings', icon: GearIcon },
  { name: 'セキュリティ', href: '/admin/security', icon: ShieldIcon },
]

const PATH_TO_PAGE_NAME: Record<string, string> = {
  '/admin': 'ダッシュボード',
  '/admin/companies': '企業管理',
  '/admin/applicants': '応募者管理',
  '/admin/questions': '質問バンク',
  '/admin/billing': '課金管理',
  '/admin/settings': 'システム設定',
  '/admin/security': 'セキュリティ',
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function YenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 18V6" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function getPageName(pathname: string): string {
  if (pathname === '/admin') return 'ダッシュボード'
  for (const [path, name] of Object.entries(PATH_TO_PAGE_NAME)) {
    if (path !== '/admin' && pathname.startsWith(path)) return name
  }
  return 'ダッシュボード'
}

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    // TODO: Supabase Authセッション破棄を実装
    router.push('/admin/login')
  }

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const pageName = getPageName(pathname)

  return (
    <div className="min-h-screen bg-gray-950">
      {/* モバイル・タブレット: オーバーレイ背景 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* サイドバー */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-950/90 backdrop-blur-2xl border-r border-white/5 flex flex-col z-50 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* ロゴ */}
        <div className="p-5 border-b border-white/5 shrink-0 flex items-center">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 text-lg font-bold">
            AI人事24h
          </span>
          <span className="ml-2 bg-gradient-to-r from-red-500 to-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
            運営管理
          </span>
        </div>

        {/* メニュー */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 mx-2 rounded-xl text-sm transition-colors border ${
                  active
                    ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-white/10 text-white'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* ログアウト */}
        <div className="p-4 border-t border-white/5 shrink-0">
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 mx-2 w-full text-left text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-xl transition-colors"
          >
            <LogoutIcon className="w-5 h-5 shrink-0" />
            ログアウト
          </button>
        </div>
      </aside>

      {/* メインエリア */}
      <div className="lg:pl-64">
        {/* ヘッダー */}
        <header className="sticky top-0 z-30 h-14 bg-gray-950/80 backdrop-blur-2xl border-b border-white/[0.06] px-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            aria-label="メニューを開く"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
          <h2 className="text-lg font-semibold text-white">{pageName}</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 hidden sm:inline">管理者</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
              管
            </div>
          </div>
        </header>

        {/* コンテンツ */}
        <main className="relative overflow-hidden p-6 min-h-screen bg-gray-950">
          {/* 装飾用グロウ */}
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-600/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/3 -right-20 w-96 h-96 bg-purple-600/6 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 left-1/3 w-72 h-72 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>

      {/* モバイル・タブレット: サイドバー内の閉じるボタン */}
      {sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed top-4 right-4 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white z-[60] lg:hidden"
          aria-label="メニューを閉じる"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}

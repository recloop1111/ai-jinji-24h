'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, Building2, Users, MessageSquare, CircleDollarSign, Settings, Shield, Menu, X, LogOut } from 'lucide-react'

const navigation = [
  { name: 'ダッシュボード', href: '/admin', icon: LayoutGrid },
  { name: '企業管理', href: '/admin/companies', icon: Building2 },
  { name: '応募者管理', href: '/admin/applicants', icon: Users },
  { name: '質問バンク', href: '/admin/questions', icon: MessageSquare },
  { name: '課金管理', href: '/admin/billing', icon: CircleDollarSign },
  { name: 'システム設定', href: '/admin/settings', icon: Settings },
  { name: 'セキュリティ', href: '/admin/security', icon: Shield },
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
            <LogOut className="w-5 h-5 shrink-0" />
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
            <Menu className="w-6 h-6" />
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
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}

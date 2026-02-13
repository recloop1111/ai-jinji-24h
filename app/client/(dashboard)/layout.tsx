'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navigation = [
  { name: '応募者一覧', href: '/client/applicants', icon: '👥' },
  { name: 'プラン・契約管理', href: '/client/plan', icon: '📋' },
  { name: '請求履歴', href: '/client/billing', icon: '💰' },
  { name: 'テンプレートメール設定', href: '/client/templates', icon: '✉️' },
  { name: '停止申請', href: '/client/suspension', icon: '⏸️' },
]

const TOUR_STEPS = [
  { targetId: 'sidebar-nav', title: 'ナビゲーション', description: 'ここからすべての機能にアクセスできます。各メニューをクリックして画面を切り替えます。' },
  { targetId: 'nav-applicants', title: '応募者一覧', description: '応募者の一覧・詳細・AI評価レポートを確認できます。' },
  { targetId: 'nav-templates', title: 'テンプレートメール設定', description: '面接案内や合否通知のメールテンプレートを設定できます。' },
  { targetId: 'nav-plan', title: 'プラン・契約管理', description: '現在のプランの確認やアップグレード・ダウングレードができます。' },
  { targetId: 'interview-url-copy', title: '面接URL', description: 'このURLを求人ページに掲載すると、応募者がAI面接を受けられます。コピーして貼り付けるだけで設定完了です。' },
]

export default function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [interviewSlug, setInterviewSlug] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [companyId, setCompanyId] = useState('')
  const [tourActive, setTourActive] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [highlightRect, setHighlightRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/client/login')
        return
      }
      setUserEmail(user.email || '')

      const { data: company } = await supabase
        .from('companies')
        .select('id, name, interview_slug, onboarding_completed')
        .eq('auth_user_id', user.id)
        .single()

      if (company) {
        setCompanyName(company.name)
        setInterviewSlug(company.interview_slug)
        setCompanyId(company.id)
        if (!company.onboarding_completed) {
          setTimeout(() => setTourActive(true), 500)
        }
      }
    }
    getUser()
  }, [])

  var updateHighlight = useCallback(() => {
    if (!tourActive) return
    var step = TOUR_STEPS[tourStep]
    var el = document.getElementById(step.targetId)
    if (!el) return
    var rect = el.getBoundingClientRect()
    var padding = 6
    setHighlightRect({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    })
    var tooltipTop = rect.top + rect.height / 2 - 80
    var tooltipLeft = rect.right + 20
    if (tooltipLeft + 320 > window.innerWidth) {
      tooltipLeft = rect.left - 340
    }
    if (tooltipTop < 10) tooltipTop = 10
    if (tooltipTop + 200 > window.innerHeight) tooltipTop = window.innerHeight - 210
    setTooltipPos({ top: tooltipTop, left: tooltipLeft })
  }, [tourActive, tourStep])

  useEffect(() => {
    updateHighlight()
  }, [updateHighlight])

  async function completeTour() {
    setTourActive(false)
    setTourStep(0)
    setHighlightRect(null)
    if (companyId) {
      await supabase.from('companies').update({ onboarding_completed: true }).eq('id', companyId)
    }
  }

  function handleTourNext() {
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep(tourStep + 1)
    } else {
      completeTour()
    }
  }

  function handleTourBack() {
    if (tourStep > 0) setTourStep(tourStep - 1)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/client/login')
  }

  const handleCopyUrl = async () => {
    if (!interviewSlug) return
    const url = `${window.location.origin}/interview/${interviewSlug}`
    await navigator.clipboard.writeText(url)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-60 bg-gray-800 text-white transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ zIndex: tourActive ? 10001 : 50 }}>
        <div className="p-5 border-b border-gray-700">
          <p className="text-xs text-gray-400">企業管理画面</p>
          <h1 className="text-base font-bold mt-1">{companyName || 'AI人事24h'}</h1>
        </div>

        <nav id="sidebar-nav" className="p-3 space-y-1 flex-1">
          {navigation.map(item => {
            var navId = ''
            if (item.href === '/client/applicants') navId = 'nav-applicants'
            else if (item.href === '/client/plan') navId = 'nav-plan'
            else if (item.href === '/client/templates') navId = 'nav-templates'
            return (
              <Link
                key={item.href}
                id={navId || undefined}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  pathname === item.href || pathname.startsWith(item.href + '/')
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {interviewSlug && (
          <div id="interview-url-copy" className="absolute bottom-0 w-full p-4 border-t border-gray-700">
            <p className="text-xs text-gray-400 mb-2">面接URL</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-300 truncate flex-1">/interview/{interviewSlug}</p>
              <button
                onClick={handleCopyUrl}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
              >
                {copySuccess ? '✓' : 'コピー'}
              </button>
            </div>
          </div>
        )}
      </aside>

      <div className="lg:pl-60">
        <header className="bg-white shadow-sm border-b h-[60px] px-4 flex items-center justify-between">
          <button
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 text-gray-600"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{userEmail}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ログアウト
            </button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>

      {tourActive && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 10000 }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
              <defs>
                <mask id="tour-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="white" />
                  {highlightRect && (
                    <rect
                      x={highlightRect.left}
                      y={highlightRect.top}
                      width={highlightRect.width}
                      height={highlightRect.height}
                      rx="8"
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tour-mask)" />
            </svg>
          </div>

          {highlightRect && (
            <div
              style={{
                position: 'fixed',
                top: highlightRect.top,
                left: highlightRect.left,
                width: highlightRect.width,
                height: highlightRect.height,
                zIndex: 10001,
                borderRadius: '8px',
                boxShadow: '0 0 0 3px rgba(59,130,246,0.7), 0 0 16px rgba(59,130,246,0.3)',
                pointerEvents: 'none',
              }}
            />
          )}

          <div
            style={{
              position: 'fixed',
              top: tooltipPos.top,
              left: tooltipPos.left,
              zIndex: 10002,
            }}
          >
            <div className="bg-white rounded-lg shadow-2xl p-5 w-80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-blue-600 font-bold">ステップ {tourStep + 1} / {TOUR_STEPS.length}</span>
                <button onClick={() => completeTour()} className="text-xs text-gray-400 hover:text-gray-600">スキップ</button>
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">{TOUR_STEPS[tourStep].title}</h3>
              <p className="text-sm text-gray-600 mb-4">{TOUR_STEPS[tourStep].description}</p>
              <div className="flex items-center justify-between">
                <button
                  onClick={handleTourBack}
                  className={'text-sm px-3 py-1.5 rounded-md ' + (tourStep === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100')}
                  disabled={tourStep === 0}
                >
                  戻る
                </button>
                <button
                  onClick={handleTourNext}
                  className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {tourStep === TOUR_STEPS.length - 1 ? '完了' : '次へ'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

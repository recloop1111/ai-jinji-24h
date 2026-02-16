'use client'

import { Loader2, AlertCircle, Inbox } from 'lucide-react'

// ===== 運営管理画面用（ダークテーマ） =====

export function SkeletonCard() {
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 animate-pulse">
      <div className="h-8 bg-white/[0.06] rounded-lg w-1/2 mb-3" />
      <div className="h-4 bg-white/[0.06] rounded w-3/4 mb-2" />
      <div className="h-4 bg-white/[0.06] rounded w-1/3" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-white/[0.06]">
        <div className="h-5 bg-white/[0.06] rounded w-32 animate-pulse" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-4 border-b border-white/[0.04] animate-pulse">
          <div className="h-4 bg-white/[0.06] rounded flex-1" />
          <div className="h-4 bg-white/[0.06] rounded w-20" />
          <div className="h-4 bg-white/[0.06] rounded w-24" />
          <div className="h-4 bg-white/[0.06] rounded w-16" />
        </div>
      ))}
    </div>
  )
}

export function ErrorState({ message = 'データの取得に失敗しました', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-red-500/20 rounded-2xl p-12 text-center">
      <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
      <p className="text-gray-300 font-medium mb-2">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          再読み込み
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message = 'データがありません', icon }: { message?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-12 text-center">
      {icon ?? <Inbox className="w-12 h-12 mx-auto text-gray-600 mb-4" />}
      <p className="text-gray-500 font-medium">{message}</p>
    </div>
  )
}

// ===== 企業管理画面用（ライトテーマ） =====

export function SkeletonCardLight() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm animate-pulse">
      <div className="h-6 bg-slate-200 rounded w-1/2 mb-3" />
      <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
      <div className="h-4 bg-slate-100 rounded w-1/3" />
    </div>
  )
}

export function SkeletonTableLight({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <div className="h-5 bg-slate-200 rounded w-32 animate-pulse" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-slate-100 animate-pulse">
          <div className="h-4 bg-slate-100 rounded flex-1" />
          <div className="h-4 bg-slate-100 rounded w-20" />
          <div className="h-4 bg-slate-100 rounded w-24" />
          <div className="h-4 bg-slate-100 rounded w-16" />
        </div>
      ))}
    </div>
  )
}

export function ErrorStateLight({ message = 'データの取得に失敗しました', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-red-200 p-12 text-center shadow-sm">
      <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
      <p className="text-slate-700 font-medium mb-2">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          再読み込み
        </button>
      )}
    </div>
  )
}

export function EmptyStateLight({ message = 'データがありません', icon }: { message?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
      {icon ?? <Inbox className="w-12 h-12 mx-auto text-slate-300 mb-4" />}
      <p className="text-slate-500 font-medium">{message}</p>
    </div>
  )
}

export function LoadingSpinner({ className = 'w-5 h-5' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-current`} />
}

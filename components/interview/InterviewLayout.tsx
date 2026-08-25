'use client'

import { ReactNode } from 'react'
import { APP_NAME } from '@/constants'

type MaxWidth = 'sm' | 'md' | 'lg'

interface InterviewLayoutProps {
  children: ReactNode
  maxWidth?: MaxWidth
  companyName?: string
  companyLogo?: string
}

const maxWidthClasses: Record<MaxWidth, string> = {
  sm: 'max-w-[480px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[720px]',
}

export default function InterviewLayout({
  children,
  maxWidth = 'md',
  companyName,
  companyLogo,
}: InterviewLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className={`w-full ${maxWidthClasses[maxWidth]}`}>
          <div className="mb-8 text-center">
            {/* 上部は「応募先企業名」の表示位置。サービス名(AIMEN24)はここに出さない
                （ブランドは footer の Powered by AIMEN24）。企業を解決できない場合のみ AIMEN24 を fallback 表示。 */}
            {companyLogo ? (
              <>
                <img
                  src={companyLogo}
                  alt={companyName || 'Company logo'}
                  className="h-12 mx-auto mb-2"
                />
                {companyName && (
                  <h1 className="text-xl font-bold text-gray-900 mt-1">{companyName}</h1>
                )}
              </>
            ) : companyName ? (
              <h1 className="text-xl font-bold text-gray-900">{companyName}</h1>
            ) : (
              <span className="text-lg font-bold text-blue-600">{APP_NAME}</span>
            )}
          </div>
          {children}
        </div>
      </div>
      <footer className="py-4 text-center text-sm text-gray-500">
        Powered by {APP_NAME}
      </footer>
    </div>
  )
}

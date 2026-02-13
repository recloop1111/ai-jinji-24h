'use client'

import InterviewLayout from '@/components/interview/InterviewLayout'

export default function CancelledPage() {
  return (
    <InterviewLayout>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-3">
          面接がキャンセルされました
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          面接を再度受ける場合は、企業の担当者にお問い合わせください。
        </p>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-400">
            このページは閉じていただいて問題ありません。
          </p>
        </div>
      </div>
    </InterviewLayout>
  )
}

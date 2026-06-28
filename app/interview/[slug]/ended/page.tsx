'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

export default function EndedPage() {
  // 応募者公開フロー専用。/ や /client/login など企業管理側へは絶対に遷移しない。
  const [showCloseHint, setShowCloseHint] = useState(false)

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.opener) {
      window.close()
    } else {
      // 親ウィンドウが無い場合は遷移せず、タブを閉じる案内を表示する（企業管理画面へは飛ばさない）
      setShowCloseHint(true)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">面接が途中で終了しました</h1>
          <p className="text-slate-600 leading-relaxed">
            ご参加ありがとうございました。
          </p>
        </div>

        {showCloseHint ? (
          <p className="mt-8 text-slate-600 text-sm leading-relaxed">
            面接は終了しました。このタブを閉じてください。
          </p>
        ) : (
          <div className="mt-8">
            <button
              onClick={handleClose}
              className="w-full px-6 py-3 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

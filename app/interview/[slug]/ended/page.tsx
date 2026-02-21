'use client'

import { useParams, useRouter } from 'next/navigation'
import { X } from 'lucide-react'

export default function EndedPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const handleClose = () => {
    // ウィンドウを閉じるか、トップページに遷移
    if (window.opener) {
      window.close()
    } else {
      // トップページに遷移（または適切なページ）
      window.location.href = '/'
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
        
        <div className="mt-8">
          <button
            onClick={handleClose}
            className="w-full px-6 py-3 bg-slate-800 text-white font-medium rounded-xl hover:bg-slate-900 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

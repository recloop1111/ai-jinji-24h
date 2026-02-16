'use client'

import { useParams, useRouter } from 'next/navigation'
import { CheckCircle, Lightbulb } from 'lucide-react'

// TODO: Phase 4 - GPT-4oで面接内容からフィードバックを自動生成
const FEEDBACK = {
  goodPoints: [
    '質問の意図を正確に理解し、簡潔で分かりやすい回答ができていました。',
    '具体例を交えながら自分の経験を説明する力が優れています。',
    '面接官との対話を意識し、適切なタイミングで質問を返す姿勢が見られました。',
  ],
  advice: [
    'より深い自己分析を加えることで、あなたの強みがより明確に伝わります。',
    '将来のキャリアビジョンを具体的に語ることで、意欲がより伝わりやすくなります。',
  ],
}

export default function FeedbackPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const handleViewDiagnosis = () => {
    router.push(`/interview/${slug}/diagnosis`)
  }

  return (
    <div className="min-h-screen flex flex-col overflow-hidden bg-[#0a0a0f]">
      {/* 背景: グラデーションオーブ + ドットパターン */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-30">
          <svg className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <pattern id="dotGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="12" cy="12" r="0.5" fill="white" fillOpacity="0.15" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotGrid)" />
          </svg>
        </div>
      </div>

      <div className="relative flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
        {/* ヘッダー */}
        <header className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 sm:mb-4">
            面接お疲れさまでした！
          </h1>
          <p className="text-sm sm:text-base text-gray-400">
            AIがあなたの面接を分析し、フィードバックをお届けします
          </p>
        </header>

        {/* AIからのフィードバック */}
        <div className="space-y-6 sm:space-y-8 mb-8 sm:mb-12">
          {/* 良かった点 */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4 sm:mb-5">
              <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400 shrink-0" />
              <h2 className="text-lg sm:text-xl font-bold text-white">良かった点</h2>
            </div>
            <ul className="space-y-3 sm:space-y-4">
              {FEEDBACK.goodPoints.map((point, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-sm sm:text-base text-gray-200 leading-relaxed flex-1">{point}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* アドバイス */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4 sm:mb-5">
              <Lightbulb className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
              <h2 className="text-lg sm:text-xl font-bold text-white">アドバイス</h2>
            </div>
            <ul className="space-y-3 sm:space-y-4">
              {FEEDBACK.advice.map((advice, index) => (
                <li key={index} className="flex items-start gap-3">
                  <Lightbulb className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <p className="text-sm sm:text-base text-gray-200 leading-relaxed flex-1">{advice}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 診断ボタン */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleViewDiagnosis}
            className="px-8 sm:px-10 py-3 sm:py-4 bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-base sm:text-lg font-semibold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-cyan-500/20"
          >
            あなたの仕事タイプ診断を見る
          </button>
        </div>

        {/* フッター */}
        <footer className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-white/10">
          <p className="text-center text-xs sm:text-sm text-gray-400">Powered by AI人事24h</p>
        </footer>
      </div>
    </div>
  )
}

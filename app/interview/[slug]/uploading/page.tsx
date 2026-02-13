'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import InterviewLayout from '@/components/interview/InterviewLayout'

const feedback = {
  summary: 'コミュニケーション能力が高く、質問に対して的確に回答されていました。特に自身の経験を具体的なエピソードで説明できている点が印象的でした。',
  strengths: '論理的な思考力と、相手の質問の意図を正確に汲み取る力が優れています。また、困難な状況での対応力について具体的に説明でき、実践的な問題解決能力が感じられました。',
  personality: '誠実で協調性のある人柄が伺えます。チームワークを大切にしながらも、自身の意見をしっかりと持ち、建設的に議論を進められるタイプです。',
}

export default function UploadingPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<'uploading' | 'analyzing' | 'feedback'>('uploading')
  const [feedbackVisible, setFeedbackVisible] = useState([false, false, false])

  useEffect(() => {
    if (phase === 'uploading') {
      if (progress >= 60) {
        setPhase('analyzing')
        return
      }
      const timer = setTimeout(() => {
        setProgress((prev) => Math.min(prev + 2, 60))
      }, 100)
      return () => clearTimeout(timer)
    } else if (phase === 'analyzing') {
      if (progress >= 100) {
        setPhase('feedback')
        return
      }
      const timer = setTimeout(() => {
        setProgress((prev) => Math.min(prev + 1, 100))
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [phase, progress])

  useEffect(() => {
    if (phase === 'feedback') {
      // フィードバックを順次表示
      const timers = [
        setTimeout(() => {
          setFeedbackVisible((prev) => [true, prev[1], prev[2]])
        }, 0),
        setTimeout(() => {
          setFeedbackVisible((prev) => [prev[0], true, prev[2]])
        }, 800),
        setTimeout(() => {
          setFeedbackVisible((prev) => [prev[0], prev[1], true])
        }, 1600),
      ]

      // 全表示後3秒で遷移
      const redirectTimer = setTimeout(() => {
        router.push(`/interview/${slug}/complete`)
      }, 4600)

      return () => {
        timers.forEach((timer) => clearTimeout(timer))
        clearTimeout(redirectTimer)
      }
    }
  }, [phase, slug, router])

  return (
    <InterviewLayout>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        {phase !== 'feedback' ? (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <svg
                className="animate-spin h-16 w-16 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {phase === 'uploading'
                ? '面接データを送信しています...'
                : 'AIが面接内容を分析しています...'}
            </h2>

            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-2">{progress}%</p>
            </div>

            <p className="text-sm text-gray-500">このページを閉じないでください</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-4">
              分析が完了しました
            </h2>

            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: '100%' }} />
              </div>
              <p className="text-sm text-gray-600 mt-2">100%</p>
            </div>

            <div className="space-y-4 mb-6 text-left">
              <div
                className={`bg-blue-50 rounded-xl p-4 transition-all duration-700 ${
                  feedbackVisible[0]
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-4'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">面接サマリー</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {feedback.summary}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`bg-green-50 rounded-xl p-4 transition-all duration-700 ${
                  feedbackVisible[1]
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-4'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">💪</span>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">あなたの強み</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {feedback.strengths}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`bg-purple-50 rounded-xl p-4 transition-all duration-700 ${
                  feedbackVisible[2]
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 translate-y-4'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🧠</span>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-2">パーソナリティ分析</h3>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {feedback.personality}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500">
              まもなく完了画面に移動します...
            </p>
          </div>
        )}
      </div>
    </InterviewLayout>
  )
}

'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InterviewLayout from '@/components/interview/InterviewLayout'
import { PrimaryButton } from '@/components/interview/FormComponents'

const feedback = {
  summary: 'コミュニケーション能力が高く、質問に対して的確に回答されていました。特に自身の経験を具体的なエピソードで説明できている点が印象的でした。',
  strengths: '論理的な思考力と、相手の質問の意図を正確に汲み取る力が優れています。また、困難な状況での対応力について具体的に説明でき、実践的な問題解決能力が感じられました。',
  personality: '誠実で協調性のある人柄が伺えます。チームワークを大切にしながらも、自身の意見をしっかりと持ち、建設的に議論を進められるタイプです。',
}

export default function CompletePage() {
  const params = useParams()
  const slug = params.slug as string
  const supabase = createClient()

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmitRating() {
    if (rating === 0) return

    const applicantId = sessionStorage.getItem(`interview_${slug}_applicant_id`)
    if (!applicantId) {
      return
    }

    setSubmitting(true)
    const { error } = await supabase
      .from('applicants')
      .update({ satisfaction_rating: rating })
      .eq('id', applicantId)

    if (!error) {
      setSubmitted(true)
    }
    setSubmitting(false)
  }

  return (
    <InterviewLayout>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
              <svg
                className="w-10 h-10 text-green-600"
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            面接が完了しました
          </h1>
          <p className="text-sm text-gray-600">
            ご参加いただきありがとうございました。結果は企業の担当者からご連絡いたします。
          </p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="bg-blue-50 rounded-xl p-4">
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

          <div className="bg-green-50 rounded-xl p-4">
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

          <div className="bg-purple-50 rounded-xl p-4">
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

        <div className="bg-gray-50 rounded-xl p-6 text-center">
          {!submitted ? (
            <>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                面接の満足度を教えてください
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                今後のサービス改善に役立てさせていただきます
              </p>
              <div className="flex items-center justify-center gap-2 mb-6">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="transition-transform hover:scale-110"
                  >
                    <svg
                      className={`w-8 h-8 ${
                        star <= (hoverRating || rating)
                          ? 'text-yellow-400'
                          : 'text-gray-300'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </button>
                ))}
              </div>
              <div className="max-w-xs mx-auto">
                <PrimaryButton
                  onClick={handleSubmitRating}
                  disabled={rating === 0}
                  loading={submitting}
                >
                  送信する
                </PrimaryButton>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-green-600"
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
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                ご回答ありがとうございました
              </h3>
              <p className="text-sm text-gray-600">
                このページは閉じていただいて問題ありません
              </p>
            </>
          )}
        </div>
      </div>
    </InterviewLayout>
  )
}

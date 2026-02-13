'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InterviewLayout from '@/components/interview/InterviewLayout'
import { PrimaryButton, Checkbox, TextLink } from '@/components/interview/FormComponents'

export default function InterviewPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [company, setCompany] = useState<{
    id: string
    name: string
    logo_url: string | null
    is_suspended: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [consent1, setConsent1] = useState(false)
  const [consent2, setConsent2] = useState(false)

  useEffect(() => {
    fetchCompany()
  }, [slug])

  async function fetchCompany() {
    setLoading(true)
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, logo_url, is_suspended')
      .eq('interview_slug', slug)
      .single()

    if (error || !data) {
      setCompany(null)
    } else {
      setCompany(data)
    }
    setLoading(false)
  }

  function handleNext() {
    if (consent1 && consent2) {
      router.push(`/interview/${slug}/verify`)
    }
  }

  if (loading) {
    return (
      <InterviewLayout>
        <div className="flex items-center justify-center py-12">
          <svg
            className="animate-spin h-8 w-8 text-blue-600"
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
      </InterviewLayout>
    )
  }

  if (!company) {
    return (
      <InterviewLayout>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            この面接URLは無効です
          </h1>
          <p className="text-gray-600">
            企業の担当者にお問い合わせください。
          </p>
        </div>
      </InterviewLayout>
    )
  }

  if (company.is_suspended) {
    return (
      <InterviewLayout companyName={company.name} companyLogo={company.logo_url || undefined}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 text-center">
          <div className="text-orange-500 text-5xl mb-4">⏸️</div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
            面接受付が一時停止されています
          </h1>
          <p className="text-gray-600">
            現在、この企業の面接受付は一時停止されています。
          </p>
        </div>
      </InterviewLayout>
    )
  }

  return (
    <InterviewLayout companyName={company.name} companyLogo={company.logo_url || undefined}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 text-center">
            AI面接のご案内
          </h1>
          <p className="text-sm text-gray-600 text-center">
            AIがリアルタイムであなたの面接を行います
          </p>
        </div>

        <div className="bg-blue-50 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <div>
              <p className="text-sm font-medium text-gray-900">所要時間：最大40分程度</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 flex-shrink-0 mt-0.5"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
            <div>
              <p className="text-sm font-medium text-gray-900">カメラとマイクを使用します（面接は録画されます）</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 flex-shrink-0 mt-0.5"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
            <div>
              <p className="text-sm font-medium text-gray-900">安定した通信環境と静かな場所でご参加ください</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 flex-shrink-0 mt-0.5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <div>
              <p className="text-sm font-medium text-gray-900">録画データは採用選考にのみ使用されます</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <Checkbox
            checked={consent1}
            onChange={setConsent1}
            label={
              <>
                利用規約およびプライバシーポリシーに同意します
                <TextLink href="/terms" className="ml-1">
                  （詳細）
                </TextLink>
              </>
            }
          />
          <Checkbox
            checked={consent2}
            onChange={setConsent2}
            label="面接の録画およびAIによる評価に同意します"
          />
        </div>

        <PrimaryButton
          onClick={handleNext}
          disabled={!consent1 || !consent2}
        >
          同意して次へ進む
        </PrimaryButton>
      </div>
    </InterviewLayout>
  )
}

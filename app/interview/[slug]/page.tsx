'use client'

import { useState, useEffect } from 'react'

const SUPPORT_EMAIL = 'recloop.1111@gmail.com' // TODO: 本番前に support@ai-jinji24h.com に変更
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
      router.push(`/interview/${slug}/form`)
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
          <div className="flex justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
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
          <div className="flex justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </div>
          <p className="text-gray-600">
            現在、面接の受付を一時停止しております。恐れ入りますが、しばらく経ってから再度お試しください。
          </p>
        </div>
      </InterviewLayout>
    )
  }

  return (
    <InterviewLayout companyName={company.name} companyLogo={company.logo_url || undefined}>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="bg-blue-50 rounded-xl p-4 mb-6 flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 flex-shrink-0">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <p className="text-sm font-medium text-gray-900">この面接は最大約40分間です。静かな環境でお受けください。</p>
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
          次へ進む
        </PrimaryButton>

        <p className="text-center mt-4">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-blue-600 hover:underline">
            お困りの方はこちら
          </a>
        </p>
      </div>
    </InterviewLayout>
  )
}

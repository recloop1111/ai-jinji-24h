'use client'

import { useState, useEffect } from 'react'

const SUPPORT_EMAIL = 'recloop.1111@gmail.com' // TODO: 本番前に support@ai-jinji24h.com に変更
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InterviewLayout from '@/components/interview/InterviewLayout'
import { PrimaryButton, Checkbox, TextLink } from '@/components/interview/FormComponents'

const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

// Supabaseから取得できない場合のダミーデータ
const dummyCompany = {
  id: 'dummy-company-id',
  name: '株式会社サンプル',
  logo_url: null,
  is_suspended: false,
}

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
  const [selectedLanguage, setSelectedLanguage] = useState('ja')

  useEffect(() => {
    fetchCompany()
  }, [slug])

  async function fetchCompany() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, logo_url, is_suspended')
        .eq('interview_slug', slug)
        .single()

      if (error || !data) {
        // Supabaseから取得できない場合はダミーデータを使用
        setCompany(dummyCompany)
      } else {
        setCompany(data)
      }
    } catch (error) {
      // エラーが発生した場合もダミーデータを使用
      setCompany(dummyCompany)
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

  // companyがnullの場合はダミーデータを使用（エラー画面は表示しない）
  const displayCompany = company || dummyCompany
  // TODO: Phase 4 - 本番ではダミーデータを削除し、無効なURLは正しくエラー表示する

  if (displayCompany.is_suspended) {
    return (
      <InterviewLayout companyName={displayCompany.name} companyLogo={displayCompany.logo_url || undefined}>
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
    <>
      {/* 言語選択ドロップダウン（上部右端） */}
      <div className="fixed top-4 right-4 z-50">
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="bg-white text-gray-900 text-sm px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        {/* TODO: Phase 4 - 選択した言語をURLパラメータまたはstateで引き継ぎ、全画面のUIテキストを切り替え */}
      </div>

      <InterviewLayout companyName={displayCompany.name} companyLogo={displayCompany.logo_url || undefined}>
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
    </>
  )
}

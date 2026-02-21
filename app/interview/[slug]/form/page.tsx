'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InterviewLayout from '@/components/interview/InterviewLayout'
import {
  StepIndicator,
  PrimaryButton,
  TextLink,
  InputField,
  TextInput,
  TextArea,
  SelectField,
  RadioGroup,
} from '@/components/interview/FormComponents'

const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '面接']

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

const EDUCATION_OPTIONS = [
  { value: 'junior_high', label: '中学卒' },
  { value: 'high_school', label: '高校卒' },
  { value: 'vocational', label: '専門学校卒' },
  { value: 'junior_college', label: '短大卒' },
  { value: 'university', label: '大学卒' },
  { value: 'graduate', label: '大学院卒' },
  { value: 'other', label: 'その他' },
]


export default function FormPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const supabase = createClient()

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [jobTypes, setJobTypes] = useState<{ value: string; label: string; employmentType: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [lastName, setLastName] = useState('テスト')
  const [firstName, setFirstName] = useState('太郎')
  const [lastNameKana, setLastNameKana] = useState('テスト')
  const [firstNameKana, setFirstNameKana] = useState('タロウ')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('09012345678')
  const [email, setEmail] = useState('debug@test.com')
  const [prefecture, setPrefecture] = useState('東京都')
  const [education, setEducation] = useState('university')
  const [employmentType, setEmploymentType] = useState('')
  const [industryExperience, setIndustryExperience] = useState('')
  const [jobId, setJobId] = useState('')
  const [workHistory, setWorkHistory] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    initialize()
  }, [slug])

  async function initialize() {
    setLoading(true)
    
    // sessionStorageから電話番号取得
    const storedPhone = sessionStorage.getItem(`interview_${slug}_phone`) || sessionStorage.getItem('interview_phone')
    if (storedPhone) {
      setPhone(storedPhone)
    }

    // 企業情報取得
    try {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('interview_slug', slug)
        .single()

      if (companyError || !company) {
        console.error('[FormPage] 企業情報取得エラー:', companyError)
        setLoading(false)
        return
      }

      setCompanyId(company.id)

      // 求人一覧取得（jobsテーブル）
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select('id, title, employment_type')
        .eq('company_id', company.id)
        .eq('is_active', true)

      if (jobsError) {
        console.error('[FormPage] 求人一覧取得エラー:', jobsError)
      }

      if (jobsData && jobsData.length > 0) {
        setJobTypes(
          jobsData.map((j) => ({
            value: j.id,
            label: `${j.title} × ${j.employment_type === 'fulltime' ? '正社員' : j.employment_type === 'parttime' ? 'アルバイト' : j.employment_type}`,
            employmentType: j.employment_type || '',
          }))
        )
      }
    } catch (error) {
      console.error('[FormPage] 初期化エラー:', error)
    }

    setLoading(false)
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!lastName.trim()) newErrors.lastName = '姓を入力してください'
    if (!firstName.trim()) newErrors.firstName = '名を入力してください'
    
    if (!lastNameKana.trim()) {
      newErrors.lastNameKana = '姓（フリガナ）を入力してください'
    } else if (!/^[ァ-ヶー]+$/.test(lastNameKana)) {
      newErrors.lastNameKana = 'カタカナで入力してください'
    }
    
    if (!firstNameKana.trim()) {
      newErrors.firstNameKana = '名（フリガナ）を入力してください'
    } else if (!/^[ァ-ヶー]+$/.test(firstNameKana)) {
      newErrors.firstNameKana = 'カタカナで入力してください'
    }

    const ageNum = parseInt(age, 10)
    if (!age.trim()) {
      newErrors.age = '年齢を入力してください'
    } else if (isNaN(ageNum) || ageNum < 1 || ageNum > 100) {
      newErrors.age = '年齢は1〜100の範囲で入力してください'
    }

    if (!gender) newErrors.gender = '性別を選択してください'
    if (!phone.trim()) newErrors.phone = '電話番号を入力してください'
    if (!email.trim()) {
      newErrors.email = 'メールアドレスを入力してください'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'メールアドレスの形式が正しくありません'
    }

    if (!prefecture) newErrors.prefecture = '都道府県を選択してください'
    if (!education) newErrors.education = '最終学歴を選択してください'
    const selectedJob = jobTypes.find((j) => j.value === jobId)
    if (selectedJob?.employmentType === 'fulltime' && !employmentType) {
      newErrors.employmentType = '就業形態を選択してください'
    }
    if (jobId && !industryExperience) newErrors.industryExperience = '業界経験を選択してください'
    if (jobTypes.length > 0 && !jobId) newErrors.jobId = '応募職種を選択してください'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    if (!companyId) {
      console.error('[FormPage] companyIdが取得できません')
      return
    }

    setSubmitting(true)
    const selectedJob = jobTypes.find((j) => j.value === jobId)

    // Supabaseクライアントの作成方法を確認
    console.log('[FormPage] Import:', 'import { createClient } from "@/lib/supabase/client"')
    console.log('[FormPage] Supabase client creation:', 'const supabase = createClient()')
    console.log('[FormPage] Supabase client:', supabase)
    console.log('[FormPage] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    
    // Session情報を取得
    try {
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[FormPage] Supabase session:', session)
    } catch (sessionError) {
      console.error('[FormPage] Session取得エラー:', sessionError)
    }

    try {
      // employment_type: フォームで選択された「就業形態（新卒/中途）」の値を常に設定
      // 値は 'new_graduate' (新卒) または 'mid_career' (中途)
      const insertData = {
        // NOT NULL カラム（必須）
        company_id: companyId,
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        last_name_kana: lastNameKana.trim(),
        first_name_kana: firstNameKana.trim(),
        birth_date: (() => {
          const now = new Date()
          const birthYear = now.getFullYear() - parseInt(age, 10)
          return `${birthYear}-01-01`
        })(),
        gender: gender,
        phone_number: phone,
        email: email.trim(),
        selection_status: 'pending', // 準備中（面接前の初期状態）
        status: '準備中', // 面接の進行状況（準備中・完了・途中離脱）
        result: '未対応', // 選考結果（未対応・検討中・二次通過・不採用）
        duplicate_flag: false,
        inappropriate_flag: false,
        // NULL可能カラム（任意）
        age: parseInt(age, 10) || null,
        prefecture: prefecture || null,
        education: education || null,
        employment_type: employmentType || null, // フォームで選択された値を常に設定
        industry_experience: industryExperience || null,
        job_id: jobId || null,
        work_history: workHistory.trim() || null,
        qualifications: qualifications.trim() || null,
      }

      console.log('[FormPage] Insert data:', insertData)
      console.log('[FormPage] employment_type value:', employmentType)
      console.log('[FormPage] employment_type in insertData:', insertData.employment_type)
      
      const { data, error } = await supabase
        .from('applicants')
        .insert(insertData)
        .select()
        .single()

      console.log('[FormPage] Insert result - data:', data)
      console.log('[FormPage] Insert result - error:', error)

      if (error) {
        console.error('[FormPage] 応募者情報保存エラー:', error)
        setErrors({ submit: '情報の保存に失敗しました。もう一度お試しください。' })
        setSubmitting(false)
        return
      }

      if (data) {
        sessionStorage.setItem(`interview_${slug}_applicant_id`, data.id)
        sessionStorage.setItem(`interview_${slug}_company_id`, companyId)
        router.push(`/interview/${slug}/verify?phone=${encodeURIComponent(phone)}`)
      }
    } catch (error) {
      console.error('[FormPage] 応募者情報保存例外:', error)
      setErrors({ submit: '情報の保存に失敗しました。もう一度お試しください。' })
      setSubmitting(false)
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

  return (
    <InterviewLayout>
      <div className="mb-6">
        <StepIndicator currentStep={2} totalSteps={5} labels={STEP_LABELS} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 text-center">
            基本情報の入力
          </h1>
          <p className="text-sm text-gray-600 text-center">
            必須項目はすべてご入力ください。
          </p>
        </div>

        <div className="space-y-4 [&_input]:text-gray-900 [&_textarea]:text-gray-900 [&_select]:text-gray-900 [&_label]:text-gray-700">
          <div className="grid grid-cols-2 gap-3">
            <InputField label="姓" required error={errors.lastName}>
              <TextInput
                value={lastName}
                onChange={setLastName}
                placeholder="山田"
              />
            </InputField>
            <InputField label="名" required error={errors.firstName}>
              <TextInput
                value={firstName}
                onChange={setFirstName}
                placeholder="太郎"
              />
            </InputField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField label="姓（フリガナ）" required error={errors.lastNameKana}>
              <TextInput
                value={lastNameKana}
                onChange={setLastNameKana}
                placeholder="ヤマダ"
              />
            </InputField>
            <InputField label="名（フリガナ）" required error={errors.firstNameKana}>
              <TextInput
                value={firstNameKana}
                onChange={setFirstNameKana}
                placeholder="タロウ"
              />
            </InputField>
          </div>

          <InputField label="年齢" required error={errors.age}>
            <input
              type="number"
              min={1}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="例）25"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-white text-gray-900"
            />
          </InputField>

          <InputField label="性別" required error={errors.gender}>
            <SelectField
              value={gender}
              onChange={setGender}
              options={[
                { value: 'male', label: '男性' },
                { value: 'female', label: '女性' },
                { value: 'other', label: 'その他' },
              ]}
              placeholder="選択してください"
            />
          </InputField>

          <InputField label="電話番号" required error={errors.phone}>
            <TextInput
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="例）09012345678"
            />
          </InputField>

          <InputField label="メールアドレス" required error={errors.email}>
            <TextInput
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="example@email.com"
            />
          </InputField>

          <InputField label="居住都道府県" required error={errors.prefecture}>
            <SelectField
              value={prefecture}
              onChange={setPrefecture}
              options={PREFECTURES.map((p) => ({ value: p, label: p }))}
              placeholder="選択してください"
            />
          </InputField>

          <InputField label="最終学歴" required error={errors.education}>
            <SelectField
              value={education}
              onChange={setEducation}
              options={EDUCATION_OPTIONS}
              placeholder="選択してください"
            />
          </InputField>

          <InputField label="応募職種" required error={errors.jobId}>
            {jobTypes.length > 0 ? (
              <SelectField
                value={jobId}
                onChange={(v) => {
                  setJobId(v)
                  const job = jobTypes.find((j) => j.value === v)
                  if (job?.employmentType === 'parttime') setEmploymentType('')
                }}
                options={jobTypes}
                placeholder="選択してください"
              />
            ) : (
              <p className="text-sm text-gray-500">求人が登録されていません</p>
            )}
          </InputField>

          {jobId && jobTypes.find((j) => j.value === jobId)?.employmentType === 'fulltime' && (
            <InputField label="就業形態（新卒/中途）" required error={errors.employmentType}>
              <RadioGroup
                value={employmentType}
                onChange={setEmploymentType}
                options={[
                  { value: 'new_graduate', label: '新卒' },
                  { value: 'mid_career', label: '中途' },
                ]}
              />
            </InputField>
          )}

          {jobId && (
            <InputField label="業界経験（経験あり/未経験）" required error={errors.industryExperience}>
              <RadioGroup
                value={industryExperience}
                onChange={setIndustryExperience}
                options={[
                  { value: 'experienced', label: '経験あり' },
                  { value: 'inexperienced', label: '未経験' },
                ]}
              />
            </InputField>
          )}

          <InputField label="職歴・業種" error={errors.workHistory}>
            <TextArea
              value={workHistory}
              onChange={setWorkHistory}
              placeholder="職歴や経験した業種を入力してください（任意）"
              maxLength={500}
              rows={4}
            />
          </InputField>

          <InputField label="保有資格" error={errors.qualifications}>
            <TextArea
              value={qualifications}
              onChange={setQualifications}
              placeholder="保有している資格を入力してください（任意）"
              maxLength={300}
              rows={3}
            />
          </InputField>

          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded">
              {errors.submit}
            </div>
          )}

          <PrimaryButton onClick={handleSubmit} loading={submitting}>
            次へ進む
          </PrimaryButton>

          <div className="text-center pt-4">
            <TextLink
              onClick={() => {
                if (window.confirm('面接をキャンセルしますか？入力内容は保存されません。')) {
                  router.push(`/interview/${slug}/cancelled`)
                }
              }}
            >
              面接をキャンセルする
            </TextLink>
          </div>
        </div>
      </div>
    </InterviewLayout>
  )
}

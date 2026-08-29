'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Globe, Clock, ShieldCheck, HelpCircle } from 'lucide-react'
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
import TurnstileWidget, { type TurnstileHandle } from '@/components/auth/TurnstileWidget'
import { normalizeDigits } from '@/lib/utils/normalizeDigits'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SUPPORT_EMAIL = 'support@ai-jinji24h.com'

const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '面接']

// 応募開始画面（/interview/[slug]）と同一の言語リスト。切替は sessionStorage に保存するだけ（送信ロジック非依存）。
const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'pt', label: 'Português' },
]

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

  const [companyId, setCompanyId] = useState<string | null>(null)
  // 上部に表示する「応募先企業名/ロゴ」（/interview/[slug] と同じ public-config を情報源に再利用）。
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [jobTypes, setJobTypes] = useState<{ value: string; label: string; employmentType: string }[]>([])
  const [loading, setLoading] = useState(true)
  // 応募開始画面と統一のヘッダー言語切替（表示＋sessionStorage 保存のみ・フォーム送信ロジックには非干渉）。
  const [selectedLanguage, setSelectedLanguage] = useState('ja')

  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastNameKana, setLastNameKana] = useState('')
  const [firstNameKana, setFirstNameKana] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [prefecture, setPrefecture] = useState('')
  const [education, setEducation] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [industryExperience, setIndustryExperience] = useState('')
  const [jobId, setJobId] = useState('')
  const [workHistory, setWorkHistory] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef<TurnstileHandle>(null)

  useEffect(() => {
    initialize()
  }, [slug])

  // 同一タブで以前選んだ言語があれば表示を合わせる（開始画面と同じ sessionStorage キー）。表示同期のための意図的な setState。
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch {
      /* noop */
    }
  }, [slug])

  async function initialize() {
    setLoading(true)
    
    // sessionStorageから電話番号取得
    const storedPhone = sessionStorage.getItem(`interview_${slug}_phone`) || sessionStorage.getItem('interview_phone')
    if (storedPhone) {
      setPhone(storedPhone)
    }

    // 企業情報取得（公開設定API。companies は安全列のみ）
    try {
      const res = await fetch(`/api/interview/${slug}/public-config`)
      const json = await res.json().catch(() => null)
      const company = json?.company
      if (!res.ok || !company) {
        setLoading(false)
        return
      }

      setCompanyId(company.id)
      setCompanyName(company.name ?? '')
      setCompanyLogo(company.logo_url ?? null)

      // デモモードの場合はテスト用初期値を設定
      if (company.is_demo) {
        setLastName('テスト')
        setFirstName('太郎')
        setLastNameKana('テスト')
        setFirstNameKana('タロウ')
        setPhone('09012345678')
        setEmail('debug@test.com')
        setPrefecture('東京都')
        setEducation('university')
      }

      // 求人一覧（当該企業の active のみ・公開設定APIが返す）
      const jobsData: { id: string; title: string; employment_type: string }[] = json.jobs ?? []

      if (jobsData && jobsData.length > 0) {
        setJobTypes(
          jobsData.map((j) => ({
            value: j.id,
            label: `${j.title} × ${j.employment_type === 'fulltime' ? '正社員' : j.employment_type === 'parttime' ? 'アルバイト' : j.employment_type}`,
            employmentType: j.employment_type || '',
          }))
        )
      }
    } catch {
      // 初期化エラー
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
    if (TURNSTILE_SITE_KEY && !captchaToken) newErrors.submit = '認証を完了してください'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) {
      // validate() が各フィールドの errors を setErrors 済み。必須項目が画面外でも「押しても進めない理由」が
      // 分かるよう、ボタン付近にも必ず要約メッセージを出す（silent に進めないだけにしない）。
      setErrors((prev) => ({
        ...prev,
        submit: prev.submit || '未入力またはエラーの項目があります。各項目のエラー表示をご確認ください。',
      }))
      return
    }
    if (!companyId) {
      // 企業情報の解決に失敗している状態。silent no-op にせず honest error を表示する。
      setErrors({ submit: '企業情報を取得できませんでした。ページを再読み込みしてお試しください。' })
      return
    }

    setSubmitting(true)

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
          const birthYear = now.getFullYear() - parseInt(normalizeDigits(age), 10)
          return `${birthYear}-01-01`
        })(),
        gender: gender,
        // API送信前にも半角へ正規化（autofill 等で onChange を経由しない場合の防御）
        phone_number: normalizeDigits(phone),
        email: email.trim(),
        selection_status: 'pending', // 準備中（面接前の初期状態）
        status: '準備中', // 面接の進行状況（準備中・完了・途中離脱）
        result: '未対応', // 選考結果（未対応・検討中・二次通過・不採用）
        duplicate_flag: false,
        inappropriate_flag: false,
        // NULL可能カラム（任意）
        age: parseInt(normalizeDigits(age), 10) || null,
        prefecture: prefecture || null,
        education: education || null,
        employment_type: employmentType || null, // フォームで選択された値を常に設定
        industry_experience: industryExperience || null,
        job_id: jobId || null,
        work_history: workHistory.trim() || null,
        qualifications: qualifications.trim() || null,
        captchaToken,
      }

      // applicants の直INSERT は廃止し、service-role API で作成＋ケイパビリティ・トークンを発行する
      const res = await fetch(`/api/interview/${slug}/applicant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(insertData),
      })
      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.applicant_id) {
        // API が返す具体的な原因（例: 認証に失敗しました＝captcha 検証失敗）をそのまま表示し、
        // 原因を「保存失敗」で覆い隠さない。メッセージが無い場合のみ汎用文言に fallback。
        setErrors({ submit: json?.error?.message || '情報の保存に失敗しました。もう一度お試しください。' })
        setCaptchaToken('')
        turnstileRef.current?.reset()
        setSubmitting(false)
        return
      }

      sessionStorage.setItem(`interview_${slug}_applicant_id`, json.applicant_id)
      sessionStorage.setItem(`interview_${slug}_company_id`, json.company_id)
      sessionStorage.setItem(`interview_${slug}_token`, json.token)

      // TODO(SMS provider 接続前・必須): 送信失敗後に再押下すると applicant が再作成され得る（重複）。
      //   provider 接続時に冪等化する（applicant_id 既存なら再作成せず /sms/send 再送のみ、または upsert）。
      //   詳細は docs/PRE_RELEASE_CHECKLIST.md「Twilio Verify（実SMS）」。実 SMS 課金前に対応。
      // 「次へ進む」＝ SMS 送信トリガー（別ボタンは作らない）。送信成功時のみ /verify へ進む。
      //   demo 企業: 実 SMS を送らず success（channel:'demo'）→ /verify（固定コード 1234 案内）。
      //   通常企業: provider 未接続なら 503 SMS_NOT_AVAILABLE → /verify へ進めず form に留まり honest error 表示。
      const sendRes = await fetch(`/api/interview/${slug}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: json.token, applicant_id: json.applicant_id }),
      })
      const sendJson = await sendRes.json().catch(() => null)
      if (!sendRes.ok || !sendJson?.sent) {
        // 送っていないのに先へ進めない（虚偽の「送信しました」を作らない）。応募者は作成済み。
        setErrors({ submit: sendJson?.error?.message || 'SMS認証は現在準備中です。お手数ですが運営までお問い合わせください。' })
        setSubmitting(false)
        return
      }
      // 送信先電話番号のマスク（server が返す masked_phone。demo は無し）を verify 表示用に保持。PII は URL に載せない。
      if (typeof sendJson.masked_phone === 'string' && sendJson.masked_phone) {
        sessionStorage.setItem(`interview_${slug}_masked_phone`, sendJson.masked_phone)
      }
      router.push(`/interview/${slug}/verify`)
    } catch {
      setErrors({ submit: '情報の保存に失敗しました。もう一度お試しください。' })
      setCaptchaToken('')
      turnstileRef.current?.reset()
      setSubmitting(false)
    }
  }

  // 応募開始画面と統一のヘッダー（会社名 左 ＋ 言語切替 右）。loading/本体で共用。
  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        {companyLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={companyLogo} alt={companyName} className="h-8 w-8 flex-shrink-0 rounded-lg border border-slate-200 object-cover" />
        ) : null}
        <span className="truncate text-base font-bold text-slate-900">{companyName}</span>
      </div>
      <div className="relative flex-shrink-0">
        <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <select
          value={selectedLanguage}
          onChange={(e) => {
            setSelectedLanguage(e.target.value)
            try {
              sessionStorage.setItem(`interview_${slug}_language`, e.target.value)
            } catch {
              /* noop */
            }
          }}
          aria-label="言語を選択"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        {header}
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-10">
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
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {header}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-10 lg:p-12">
          {/* ステッパー（横並び・現在=2）。ロジックは不変（表示のみ）。 */}
          <div className="mb-9">
            <StepIndicator currentStep={2} totalSteps={5} labels={STEP_LABELS} />
          </div>

          {/* 見出し（左寄せ・大きく）＋補足＋所要時間。 */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">基本情報の入力</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-sm text-slate-500">必須項目はすべてご入力ください。</p>
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                所要時間：約2分
              </span>
            </div>
          </div>

          {/* フォーム: PC は2カラム / スマホは1カラム。入力部品・挙動は不変（並び替えと余白のみ）。 */}
          <div className="[&_input]:text-gray-900 [&_textarea]:text-gray-900 [&_select]:text-gray-900 [&_label]:text-gray-700">
            <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
              {/* 1行目: 姓 / 名 */}
              <InputField label="姓" required error={errors.lastName}>
                <TextInput value={lastName} onChange={setLastName} placeholder="山田" />
              </InputField>
              <InputField label="名" required error={errors.firstName}>
                <TextInput value={firstName} onChange={setFirstName} placeholder="太郎" />
              </InputField>

              {/* 2行目: 姓（フリガナ）/ 名（フリガナ） */}
              <InputField label="姓（フリガナ）" required error={errors.lastNameKana}>
                <TextInput value={lastNameKana} onChange={setLastNameKana} placeholder="ヤマダ" />
              </InputField>
              <InputField label="名（フリガナ）" required error={errors.firstNameKana}>
                <TextInput value={firstNameKana} onChange={setFirstNameKana} placeholder="タロウ" />
              </InputField>

              {/* 3行目: 年齢 / 性別 */}
              <InputField label="年齢" required error={errors.age}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={age}
                  onChange={(e) => setAge(normalizeDigits(e.target.value))}
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
                  ]}
                  placeholder="選択してください"
                />
              </InputField>

              {/* 4行目: 電話番号 / メールアドレス */}
              <InputField label="電話番号" required error={errors.phone}>
                <TextInput
                  type="tel"
                  value={phone}
                  onChange={(v) => setPhone(normalizeDigits(v))}
                  placeholder="例）09012345678"
                />
              </InputField>
              <InputField label="メールアドレス" required error={errors.email}>
                <TextInput type="email" value={email} onChange={setEmail} placeholder="example@email.com" />
              </InputField>

              {/* 5行目: 居住都道府県 / 最終学歴 */}
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

              {/* 6行目: 応募職種（横幅いっぱい） */}
              <div className="sm:col-span-2">
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
              </div>

              {/* 条件付き: 就業形態（新卒/中途）。ロジック・表示条件は不変。 */}
              {jobId && jobTypes.find((j) => j.value === jobId)?.employmentType === 'fulltime' && (
                <div className="sm:col-span-2">
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
                </div>
              )}

              {/* 条件付き: 業界経験（経験あり/未経験）。ロジック・表示条件は不変。 */}
              {jobId && (
                <div className="sm:col-span-2">
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
                </div>
              )}

              {/* 7行目: 職歴・業種（textarea・横幅いっぱい） */}
              <div className="sm:col-span-2">
                <InputField label="職歴・業種" error={errors.workHistory}>
                  <TextArea
                    value={workHistory}
                    onChange={setWorkHistory}
                    placeholder="職歴や経験した業種を入力してください（任意）"
                    maxLength={500}
                    rows={4}
                  />
                </InputField>
              </div>

              {/* 8行目: 保有資格（textarea・横幅いっぱい） */}
              <div className="sm:col-span-2">
                <InputField label="保有資格" error={errors.qualifications}>
                  <TextArea
                    value={qualifications}
                    onChange={setQualifications}
                    placeholder="保有している資格を入力してください（任意）"
                    maxLength={300}
                    rows={3}
                  />
                </InputField>
              </div>
            </div>

            {/* captcha（挙動不変）。 */}
            {TURNSTILE_SITE_KEY && (
              <div className="mt-6 flex justify-center">
                <TurnstileWidget
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  action="interview_applicant"
                  theme="light"
                  onVerify={setCaptchaToken}
                  onExpire={() => setCaptchaToken('')}
                />
              </div>
            )}

            {/* 送信エラー要約（挙動不変）。 */}
            {errors.submit && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {errors.submit}
              </div>
            )}

            {/* 安心感の補助文（CTA の上）。 */}
            <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              入力いただいた情報は暗号化して安全に管理します
            </p>

            {/* メインCTA（共有 PrimaryButton・onClick/loading は不変）。 */}
            <div className="mt-3">
              <PrimaryButton onClick={handleSubmit} loading={submitting}>
                次へ進む
              </PrimaryButton>
            </div>

            {/* キャンセル（控えめなテキストリンク・挙動不変）。 */}
            <div className="mt-4 text-center">
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

            {/* サポート導線（最下部・控えめ）。 */}
            <div className="mt-5 border-t border-slate-100 pt-4 text-center">
              <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <HelpCircle className="h-3.5 w-3.5" />
                ご不明な点があれば
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:text-blue-700">
                  サポート
                </a>
                をご利用ください
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

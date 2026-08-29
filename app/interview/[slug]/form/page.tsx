'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Globe, Clock, ShieldCheck, HelpCircle, Plus, Trash2, Search, Pencil } from 'lucide-react'
import {
  StepIndicator,
  PrimaryButton,
  SecondaryButton,
  TextLink,
  InputField,
  TextInput,
  TextArea,
  SelectField,
  RadioGroup,
  Checkbox,
} from '@/components/interview/FormComponents'
import TurnstileWidget, { type TurnstileHandle } from '@/components/auth/TurnstileWidget'
import { normalizeDigits } from '@/lib/utils/normalizeDigits'
import { computeAge } from '@/lib/resume/normalize'
import {
  normalizeResumeInput,
  validateResumeEducation,
  validateResumeWorkExperience,
  validateResumeLicense,
  educationFieldVisibility,
} from '@/lib/resume/validate'
import { RESUME_LIMITS } from '@/lib/resume/types'
import type {
  ResumeInput, ResumeEducationInput, ResumeWorkExperienceInput, ResumeLicenseInput,
} from '@/lib/resume/types'

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SUPPORT_EMAIL = 'support@ai-jinji24h.com'

const STEP_LABELS = ['同意', '情報入力', 'SMS認証', '環境確認', '面接']

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

const GENDER_OPTIONS = [
  { value: 'male', label: '男性' },
  { value: 'female', label: '女性' },
  { value: 'other', label: 'その他' },
  { value: 'no_answer', label: '回答しない' },
]

const SCHOOL_TYPE_OPTIONS = [
  { value: 'junior_high', label: '中学校' },
  { value: 'high_school', label: '高等学校' },
  { value: 'vocational', label: '専門学校' },
  { value: 'junior_college', label: '短期大学' },
  { value: 'university', label: '大学' },
  { value: 'graduate_school', label: '大学院' },
  { value: 'other', label: 'その他' },
]

const GRADUATION_STATUS_OPTIONS = [
  { value: 'graduated', label: '卒業' },
  { value: 'expected', label: '卒業見込み' },
  { value: 'enrolled', label: '在学中' },
  { value: 'withdrawn', label: '中退' },
]

// 資格名の入力補助（datalist・自由入力を妨げない）。
const COMMON_LICENSES = [
  '普通自動車第一種運転免許', 'TOEIC', 'TOEFL', '実用英語技能検定（英検）',
  '日商簿記検定2級', '日商簿記検定3級', '基本情報技術者試験', '応用情報技術者試験',
  'ファイナンシャル・プランニング技能士', '宅地建物取引士', 'MOS（Microsoft Office Specialist）',
  '介護職員初任者研修', '登録販売者',
]

const SUB_STEPS = ['基本情報', '住所', '学歴', '職歴', '資格・自己PR', '確認']

type EduCard = ResumeEducationInput & { _k: number }
type WorkCard = ResumeWorkExperienceInput & { _k: number }
type LicCard = ResumeLicenseInput & { _k: number }

let _keySeq = 1
const nextKey = () => _keySeq++

// カードの内部キー _k を落として ResumeInput 用の素の形へ（保存/正規化前）。
const stripKey = <T extends { _k: number }>(c: T): Omit<T, '_k'> => {
  const rest = { ...c } as Partial<T>
  delete rest._k
  return rest as Omit<T, '_k'>
}

const emptyEdu = (): EduCard => ({ _k: nextKey(), schoolType: '', schoolName: '', facultyDepartment: '', enteredYearMonth: '', graduatedYearMonth: '', graduationStatus: '' })
const emptyWork = (): WorkCard => ({ _k: nextKey(), companyName: '', department: '', position: '', employmentType: '', joinedYearMonth: '', leftYearMonth: '', isCurrent: false, description: '' })
const emptyLic = (): LicCard => ({ _k: nextKey(), name: '', acquiredYearMonth: '' })

export default function FormPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [jobTypes, setJobTypes] = useState<{ value: string; label: string; employmentType: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLanguage, setSelectedLanguage] = useState('ja')

  // ── 基本情報 ─────────────────────────────────────────────
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastNameKana, setLastNameKana] = useState('')
  const [firstNameKana, setFirstNameKana] = useState('')
  const [birthDate, setBirthDate] = useState('') // YYYY-MM-DD（native date）。age は表示のみ、送信は server 計算。
  const [gender, setGender] = useState('') // 任意（空＝未回答）
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [jobId, setJobId] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [industryExperience, setIndustryExperience] = useState('')

  // ── 住所 ─────────────────────────────────────────────────
  const [postalCode, setPostalCode] = useState('')
  const [addrPrefecture, setAddrPrefecture] = useState('')
  const [city, setCity] = useState('')
  const [town, setTown] = useState('')
  const [addressLine, setAddressLine] = useState('')
  const [building, setBuilding] = useState('')
  const [postalSearching, setPostalSearching] = useState(false)
  const [postalNote, setPostalNote] = useState('')
  const [postalCandidates, setPostalCandidates] = useState<{ prefecture: string; city: string; town: string }[] | null>(null)

  // ── 学歴 / 職歴 / 資格 ─────────────────────────────────────
  const [educations, setEducations] = useState<EduCard[]>([emptyEdu()])
  const [workExperiences, setWorkExperiences] = useState<WorkCard[]>([emptyWork()])
  const [noWork, setNoWork] = useState(false)
  const [licenses, setLicenses] = useState<LicCard[]>([])
  const [motivation, setMotivation] = useState('')
  const [selfPr, setSelfPr] = useState('')
  const [personalRequests, setPersonalRequests] = useState('')

  // ── wizard 制御 ───────────────────────────────────────────
  const [subStep, setSubStep] = useState(1) // 1..6
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const hydratedRef = useRef(false)
  const postalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPostalQueryRef = useRef<string>('')

  const DRAFT_KEY = `interview_${slug}_resume_draft`

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`interview_${slug}_language`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSelectedLanguage(saved)
    } catch { /* noop */ }
  }, [slug])

  // ── draft の復元（PII は sessionStorage のみ・localStorage には保存しない） ──
  const restoreDraft = useCallback((): boolean => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return false
      const d = JSON.parse(raw)
      if (!d || typeof d !== 'object') return false
      setLastName(d.lastName ?? ''); setFirstName(d.firstName ?? '')
      setLastNameKana(d.lastNameKana ?? ''); setFirstNameKana(d.firstNameKana ?? '')
      setBirthDate(d.birthDate ?? ''); setGender(d.gender ?? '')
      if (d.phone) setPhone(d.phone)
      setEmail(d.email ?? ''); setJobId(d.jobId ?? '')
      setEmploymentType(d.employmentType ?? ''); setIndustryExperience(d.industryExperience ?? '')
      setPostalCode(d.postalCode ?? ''); setAddrPrefecture(d.addrPrefecture ?? '')
      setCity(d.city ?? ''); setTown(d.town ?? ''); setAddressLine(d.addressLine ?? ''); setBuilding(d.building ?? '')
      if (Array.isArray(d.educations) && d.educations.length) setEducations(d.educations.map((e: ResumeEducationInput) => ({ ...e, _k: nextKey() })))
      if (Array.isArray(d.workExperiences) && d.workExperiences.length) setWorkExperiences(d.workExperiences.map((w: ResumeWorkExperienceInput) => ({ ...w, _k: nextKey() })))
      setNoWork(d.noWork === true)
      if (Array.isArray(d.licenses)) setLicenses(d.licenses.map((l: ResumeLicenseInput) => ({ ...l, _k: nextKey() })))
      setMotivation(d.motivation ?? ''); setSelfPr(d.selfPr ?? ''); setPersonalRequests(d.personalRequests ?? '')
      return true
    } catch { return false }
  }, [DRAFT_KEY])

  // draft の自動保存（debounce）。captcha/postal 等の transient は保存しない。
  useEffect(() => {
    if (!hydratedRef.current) return
    const t = setTimeout(() => {
      try {
        const snapshot = {
          lastName, firstName, lastNameKana, firstNameKana, birthDate, gender, phone, email,
          jobId, employmentType, industryExperience,
          postalCode, addrPrefecture, city, town, addressLine, building,
          educations: educations.map(stripKey),
          workExperiences: workExperiences.map(stripKey),
          noWork,
          licenses: licenses.map(stripKey),
          motivation, selfPr, personalRequests,
        }
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot))
      } catch { /* noop（容量超過等は無視） */ }
    }, 500)
    return () => clearTimeout(t)
  }, [DRAFT_KEY, lastName, firstName, lastNameKana, firstNameKana, birthDate, gender, phone, email,
    jobId, employmentType, industryExperience, postalCode, addrPrefecture, city, town, addressLine, building,
    educations, workExperiences, noWork, licenses, motivation, selfPr, personalRequests])

  const clearDraft = useCallback(() => {
    try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* noop */ }
  }, [DRAFT_KEY])

  const initialize = useCallback(async () => {
    setLoading(true)
    const storedPhone = sessionStorage.getItem(`interview_${slug}_phone`) || sessionStorage.getItem('interview_phone')
    if (storedPhone) setPhone(storedPhone)

    try {
      const res = await fetch(`/api/interview/${slug}/public-config`)
      const json = await res.json().catch(() => null)
      const company = json?.company
      if (!res.ok || !company) { setLoading(false); return }

      setCompanyId(company.id)
      setCompanyName(company.name ?? '')

      const restored = restoreDraft()
      if (restored) setDraftRestored(true)

      // デモ企業のみ QA 補助の初期値（未復元時のみ・本番前に無効化予定）。
      if (company.is_demo && !restored) {
        setLastName('テスト'); setFirstName('太郎')
        setLastNameKana('テスト'); setFirstNameKana('タロウ')
        setBirthDate('1998-04-01'); setGender('no_answer')
        setPhone('09012345678'); setEmail('debug@test.com')
        setAddrPrefecture('東京都'); setCity('千代田区'); setTown('千代田'); setAddressLine('1-1')
        setEducations([{ ...emptyEdu(), schoolType: 'university', schoolName: 'テスト大学', facultyDepartment: '工学部', enteredYearMonth: '2017-04', graduatedYearMonth: '2021-03', graduationStatus: 'graduated' }])
        setWorkExperiences([emptyWork()])
      }

      const jobsData: { id: string; title: string; employment_type: string }[] = json.jobs ?? []
      if (jobsData && jobsData.length > 0) {
        setJobTypes(jobsData.map((j) => ({
          value: j.id,
          label: `${j.title} × ${j.employment_type === 'fulltime' ? '正社員' : j.employment_type === 'parttime' ? 'アルバイト' : j.employment_type}`,
          employmentType: j.employment_type || '',
        })))
      }
    } catch { /* 初期化エラー */ }

    hydratedRef.current = true
    setLoading(false)
  }, [slug, restoreDraft])

  useEffect(() => {
    // 初期ロード（public-config 取得＋draft 復元）。内部で setLoading 等を行う意図的な同期。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initialize()
  }, [initialize])

  // ── 郵便番号 → 住所（7桁完成時に一度だけ debounce 検索。毎キーでは叩かない） ──
  const runPostalLookup = useCallback(async (sevenDigits: string) => {
    if (lastPostalQueryRef.current === sevenDigits) return
    lastPostalQueryRef.current = sevenDigits
    setPostalSearching(true)
    setPostalCandidates(null)
    setPostalNote('住所を検索しています…')
    try {
      const res = await fetch(`/api/postal/lookup?zip=${encodeURIComponent(sevenDigits)}`)
      const json = await res.json().catch(() => null)
      if (json?.available && Array.isArray(json.results) && json.results.length > 0) {
        if (json.results.length === 1) {
          const r = json.results[0]
          setAddrPrefecture(r.prefecture || ''); setCity(r.city || ''); setTown(r.town || '')
          setPostalNote('住所を自動入力しました。番地・建物名をご入力ください。')
        } else {
          // 複数候補は自動確定せず選択 UI を出す。
          setPostalCandidates(json.results.map((r: { prefecture: string; city: string; town: string }) => ({ prefecture: r.prefecture, city: r.city, town: r.town })))
          setPostalNote('該当する住所を選択してください。')
        }
      } else {
        // unconfigured / not_found / upstream_error いずれも手動入力を継続できる（応募をブロックしない）。
        setPostalNote('自動取得できませんでした。お手数ですが住所を直接ご入力ください。')
      }
    } catch {
      setPostalNote('自動取得できませんでした。お手数ですが住所を直接ご入力ください。')
    } finally {
      setPostalSearching(false)
    }
  }, [])

  function onPostalChange(v: string) {
    const digits = normalizeDigits(v).replace(/[^0-9]/g, '').slice(0, 7)
    setPostalCode(digits)
    if (postalTimerRef.current) clearTimeout(postalTimerRef.current)
    if (digits.length === 7) {
      postalTimerRef.current = setTimeout(() => runPostalLookup(digits), 350)
    } else {
      setPostalNote(''); setPostalCandidates(null); lastPostalQueryRef.current = ''
    }
  }

  function pickCandidate(c: { prefecture: string; city: string; town: string }) {
    setAddrPrefecture(c.prefecture); setCity(c.city); setTown(c.town)
    setPostalCandidates(null)
    setPostalNote('住所を選択しました。番地・建物名をご入力ください。')
  }

  // ── ResumeInput 構築（正規化前）──
  function buildResumeInput(): ResumeInput {
    return {
      address: { postalCode, prefecture: addrPrefecture, city, town, addressLine, building },
      educations: educations.map(stripKey),
      workExperiences: noWork ? [] : workExperiences.map(stripKey),
      licenses: licenses.map(stripKey),
      motivation, selfPr, personalRequests,
    }
  }

  const katakana = (s: string) => /^[ァ-ヶー\s]+$/.test(s.trim())
  const scrollToTop = () => { try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch { /* noop */ } }

  // ── step ごとの検証（移動時のみ） ──
  function validateStep(step: number): Record<string, string> {
    const e: Record<string, string> = {}
    if (step === 1) {
      if (!lastName.trim()) e.lastName = '姓を入力してください'
      if (!firstName.trim()) e.firstName = '名を入力してください'
      if (!lastNameKana.trim()) e.lastNameKana = '姓（フリガナ）を入力してください'
      else if (!katakana(lastNameKana)) e.lastNameKana = 'カタカナで入力してください'
      if (!firstNameKana.trim()) e.firstNameKana = '名（フリガナ）を入力してください'
      else if (!katakana(firstNameKana)) e.firstNameKana = 'カタカナで入力してください'
      if (!birthDate) e.birthDate = '生年月日を入力してください'
      else {
        const age = computeAge(birthDate)
        if (age == null || age < 15 || age > 100) e.birthDate = '生年月日をご確認ください'
      }
      if (!phone.trim()) e.phone = '電話番号を入力してください'
      if (!email.trim()) e.email = 'メールアドレスを入力してください'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'メールアドレスの形式が正しくありません'
      if (jobTypes.length > 0 && !jobId) e.jobId = '応募職種を選択してください'
      const job = jobTypes.find((j) => j.value === jobId)
      if (job?.employmentType === 'fulltime' && !employmentType) e.employmentType = '就業形態を選択してください'
      if (jobId && !industryExperience) e.industryExperience = '業界経験を選択してください'
    } else if (step === 2) {
      if (postalCode && postalCode.length !== 7) e.postalCode = '郵便番号は7桁で入力してください'
      if (!addrPrefecture) e.addrPrefecture = '都道府県を選択してください'
      if (!city.trim()) e.city = '市区町村を入力してください'
      if (!addressLine.trim()) e.addressLine = '番地を入力してください'
    } else if (step === 3) {
      const filled = educations.filter((c) => (c.schoolName ?? '').trim() || c.schoolType)
      if (filled.length === 0) e.educations = '学歴を1件以上ご入力ください'
      educations.forEach((c, i) => {
        if (!(c.schoolName ?? '').trim() && !c.schoolType) return // 空カードは無視
        for (const err of validateResumeEducation(c)) e[`edu_${i}_${err.field}`] = err.message
      })
    } else if (step === 4) {
      if (!noWork) {
        const filled = workExperiences.filter((c) => (c.companyName ?? '').trim())
        if (filled.length === 0) e.workExperiences = '職歴をご入力いただくか「職歴なし」をお選びください'
        workExperiences.forEach((c, i) => {
          if (!(c.companyName ?? '').trim() && !c.department && !c.position && !c.joinedYearMonth && !c.description) return
          for (const err of validateResumeWorkExperience(c)) e[`work_${i}_${err.field}`] = err.message
        })
      }
    } else if (step === 5) {
      licenses.forEach((c, i) => {
        if (!(c.name ?? '').trim() && !c.acquiredYearMonth) return
        for (const err of validateResumeLicense(c)) e[`lic_${i}_${err.field}`] = err.message
      })
      if (motivation.length > RESUME_LIMITS.motivation) e.motivation = `志望動機は${RESUME_LIMITS.motivation}文字以内で入力してください`
      if (selfPr.length > RESUME_LIMITS.selfPr) e.selfPr = `自己PRは${RESUME_LIMITS.selfPr}文字以内で入力してください`
      if (personalRequests.length > RESUME_LIMITS.personalRequests) e.personalRequests = `本人希望欄は${RESUME_LIMITS.personalRequests}文字以内で入力してください`
    }
    return e
  }

  function goNext() {
    const e = validateStep(subStep)
    setErrors(e)
    if (Object.keys(e).length > 0) { scrollToTop(); return }
    setSubStep((s) => Math.min(6, s + 1))
    scrollToTop()
  }
  function goPrev() {
    setErrors({})
    setSubStep((s) => Math.max(1, s - 1))
    scrollToTop()
  }
  function editStep(step: number) {
    setErrors({})
    setSubStep(step)
    scrollToTop()
  }

  async function handleSubmit() {
    // 全 step 分を最終検証（step1..5）。
    const merged: Record<string, string> = {}
    for (let s = 1; s <= 5; s++) Object.assign(merged, validateStep(s))
    if (Object.keys(merged).length > 0) {
      setErrors(merged)
      setErrors((p) => ({ ...p, submit: '未入力またはエラーの項目があります。各ステップをご確認ください。' }))
      return
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setErrors({ submit: '認証を完了してください' }); return
    }
    if (!companyId) {
      setErrors({ submit: '企業情報を取得できませんでした。ページを再読み込みしてお試しください。' }); return
    }

    // server SoT と同じ正規化で最終チェック（矛盾があれば送信しない）。
    const { errors: rErrors } = normalizeResumeInput(buildResumeInput())
    if (rErrors.length > 0) {
      setErrors({ submit: '入力内容に問題があります。各ステップをご確認ください。' }); return
    }

    setSubmitting(true)
    try {
      const payload = {
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        last_name_kana: lastNameKana.trim(),
        first_name_kana: firstNameKana.trim(),
        birth_date: birthDate, // YYYY-MM-DD。age は server が birth_date から計算
        gender: gender || null, // 未回答は server 側で no_answer に寄せる
        phone_number: normalizeDigits(phone),
        email: email.trim(),
        job_id: jobId || null,
        employment_type: employmentType || null,
        industry_experience: industryExperience || null,
        resume: buildResumeInput(),
        captchaToken,
      }

      const res = await fetch(`/api/interview/${slug}/applicant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.applicant_id) {
        setErrors({ submit: json?.error?.message || '応募情報を保存できませんでした。もう一度お試しください。' })
        setCaptchaToken(''); turnstileRef.current?.reset(); setSubmitting(false)
        return
      }

      sessionStorage.setItem(`interview_${slug}_applicant_id`, json.applicant_id)
      sessionStorage.setItem(`interview_${slug}_company_id`, json.company_id)
      sessionStorage.setItem(`interview_${slug}_token`, json.token)

      const sendRes = await fetch(`/api/interview/${slug}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: json.token, applicant_id: json.applicant_id }),
      })
      const sendJson = await sendRes.json().catch(() => null)
      if (!sendRes.ok || !sendJson?.sent) {
        setErrors({ submit: sendJson?.error?.message || 'SMS認証は現在準備中です。お手数ですが運営までお問い合わせください。' })
        setSubmitting(false)
        return
      }
      if (typeof sendJson.masked_phone === 'string' && sendJson.masked_phone) {
        sessionStorage.setItem(`interview_${slug}_masked_phone`, sendJson.masked_phone)
      }
      clearDraft() // 応募確定（＝SMS 送信後）で下書きを破棄
      router.push(`/interview/${slug}/verify`)
    } catch {
      setErrors({ submit: '応募情報を保存できませんでした。もう一度お試しください。' })
      setCaptchaToken(''); turnstileRef.current?.reset(); setSubmitting(false)
    }
  }

  const currentAge = birthDate ? computeAge(birthDate) : null

  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="truncate text-base font-bold text-slate-900">{companyName}</span>
      </div>
      <div className="relative flex-shrink-0">
        <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <select
          value={selectedLanguage}
          onChange={(e) => {
            setSelectedLanguage(e.target.value)
            try { sessionStorage.setItem(`interview_${slug}_language`, e.target.value) } catch { /* noop */ }
          }}
          aria-label="言語を選択"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {LANGUAGES.map((lang) => (<option key={lang.code} value={lang.code}>{lang.label}</option>))}
        </select>
      </div>
    </header>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        {header}
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-10">
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] sm:p-9">
          <div className="mb-7">
            <StepIndicator currentStep={2} totalSteps={5} labels={STEP_LABELS} />
          </div>

          {/* draft 復元トースト */}
          {draftRestored && (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
              <span>入力途中の内容を復元しました</span>
              <button onClick={() => setDraftRestored(false)} className="text-xs font-medium text-blue-600 hover:text-blue-800">閉じる</button>
            </div>
          )}

          {/* サブステップ進捗 */}
          <div className="mb-6">
            <div className="flex items-center gap-1.5">
              {SUB_STEPS.map((label, i) => {
                const n = i + 1
                const active = n === subStep
                const done = n < subStep
                return (
                  <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className={`h-1.5 w-full rounded-full ${done || active ? 'bg-blue-600' : 'bg-slate-200'}`} />
                    <span className={`text-[10px] sm:text-xs ${active ? 'font-semibold text-blue-700' : 'text-slate-400'}`}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="[&_input]:text-gray-900 [&_textarea]:text-gray-900 [&_select]:text-gray-900 [&_label]:text-gray-700">

            {/* ── STEP 1: 基本情報 ── */}
            {subStep === 1 && (
              <section>
                <StepHeader title="基本情報" note="お名前・連絡先・応募職種をご入力ください。" minutes="約2分" />
                <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
                  <InputField label="姓" required error={errors.lastName}><TextInput value={lastName} onChange={setLastName} placeholder="山田" /></InputField>
                  <InputField label="名" required error={errors.firstName}><TextInput value={firstName} onChange={setFirstName} placeholder="太郎" /></InputField>
                  <InputField label="姓（フリガナ）" required error={errors.lastNameKana}><TextInput value={lastNameKana} onChange={setLastNameKana} placeholder="ヤマダ" /></InputField>
                  <InputField label="名（フリガナ）" required error={errors.firstNameKana}><TextInput value={firstNameKana} onChange={setFirstNameKana} placeholder="タロウ" /></InputField>

                  <InputField label="生年月日" required error={errors.birthDate}>
                    <div>
                      <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max="2015-12-31" min="1930-01-01"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-900" />
                      {currentAge != null && currentAge >= 0 && (<p className="mt-1 text-xs text-slate-500">現在 {currentAge} 歳</p>)}
                    </div>
                  </InputField>
                  <InputField label="性別（任意）" error={errors.gender}>
                    <SelectField value={gender} onChange={setGender} options={GENDER_OPTIONS} placeholder="選択しない" />
                  </InputField>

                  <InputField label="電話番号" required error={errors.phone}>
                    <TextInput type="tel" value={phone} onChange={(v) => setPhone(normalizeDigits(v))} placeholder="例）09012345678" />
                  </InputField>
                  <InputField label="メールアドレス" required error={errors.email}>
                    <TextInput type="email" value={email} onChange={setEmail} placeholder="example@email.com" />
                  </InputField>

                  <div className="sm:col-span-2">
                    <InputField label="応募職種" required error={errors.jobId}>
                      {jobTypes.length > 0 ? (
                        <SelectField value={jobId} onChange={(v) => {
                          setJobId(v)
                          const job = jobTypes.find((j) => j.value === v)
                          if (job?.employmentType === 'parttime') setEmploymentType('')
                        }} options={jobTypes} placeholder="選択してください" />
                      ) : (<p className="text-sm text-gray-500">求人が登録されていません</p>)}
                    </InputField>
                  </div>

                  {jobId && jobTypes.find((j) => j.value === jobId)?.employmentType === 'fulltime' && (
                    <div className="sm:col-span-2">
                      <InputField label="就業形態（新卒/中途）" required error={errors.employmentType}>
                        <RadioGroup value={employmentType} onChange={setEmploymentType} options={[{ value: 'new_graduate', label: '新卒' }, { value: 'mid_career', label: '中途' }]} />
                      </InputField>
                    </div>
                  )}
                  {jobId && (
                    <div className="sm:col-span-2">
                      <InputField label="業界経験（経験あり/未経験）" required error={errors.industryExperience}>
                        <RadioGroup value={industryExperience} onChange={setIndustryExperience} options={[{ value: 'experienced', label: '経験あり' }, { value: 'inexperienced', label: '未経験' }]} />
                      </InputField>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── STEP 2: 住所 ── */}
            {subStep === 2 && (
              <section>
                <StepHeader title="住所" note="郵便番号から住所を検索できます。番地・建物名はご自身でご入力ください。" minutes="約1分" />
                <div className="grid grid-cols-1 gap-x-5 gap-y-5">
                  <InputField label="郵便番号（任意）" error={errors.postalCode}>
                    <div>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">〒</span>
                        <input type="text" inputMode="numeric" value={postalCode} onChange={(e) => onPostalChange(e.target.value)} placeholder="2200012" maxLength={8}
                          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 pl-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        {postalSearching && (<Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-pulse text-blue-500" />)}
                      </div>
                      {postalNote && (<p className="mt-1.5 text-xs text-slate-500">{postalNote}</p>)}
                    </div>
                  </InputField>

                  {postalCandidates && postalCandidates.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-medium text-slate-600">候補から選択してください</p>
                      <div className="flex flex-col gap-1.5">
                        {postalCandidates.map((c, i) => (
                          <button key={i} type="button" onClick={() => pickCandidate(c)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-400 hover:bg-blue-50">
                            {c.prefecture}{c.city}{c.town}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <InputField label="都道府県" required error={errors.addrPrefecture}>
                    <SelectField value={addrPrefecture} onChange={setAddrPrefecture} options={PREFECTURES.map((p) => ({ value: p, label: p }))} placeholder="選択してください" />
                  </InputField>
                  <InputField label="市区町村" required error={errors.city}><TextInput value={city} onChange={setCity} placeholder="横浜市西区" /></InputField>
                  <InputField label="町名（任意）" error={errors.town}><TextInput value={town} onChange={setTown} placeholder="みなとみらい" /></InputField>
                  <InputField label="番地" required error={errors.addressLine}><TextInput value={addressLine} onChange={setAddressLine} placeholder="1-2-3" /></InputField>
                  <InputField label="建物名・部屋番号（任意）" error={errors.building}><TextInput value={building} onChange={setBuilding} placeholder="○○マンション101" /></InputField>
                </div>
              </section>
            )}

            {/* ── STEP 3: 学歴 ── */}
            {subStep === 3 && (
              <section>
                <StepHeader title="学歴" note="新しい学歴から順にご入力ください。" minutes="約2分" />
                {errors.educations && <FieldBanner message={errors.educations} />}
                <div className="flex flex-col gap-4">
                  {educations.map((c, i) => {
                    const vis = educationFieldVisibility(c.schoolType)
                    return (
                      <CardShell key={c._k} title={`学歴 ${i + 1}`} onRemove={educations.length > 1 ? () => setEducations((a) => a.filter((x) => x._k !== c._k)) : undefined}>
                        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                          <InputField label="学校区分" required error={errors[`edu_${i}_schoolType`]}>
                            <SelectField value={c.schoolType ?? ''} onChange={(v) => setEducations((a) => a.map((x) => x._k === c._k ? { ...x, schoolType: v } : x))} options={SCHOOL_TYPE_OPTIONS} placeholder="選択してください" />
                          </InputField>
                          <InputField label="学校名" required error={errors[`edu_${i}_schoolName`]}>
                            <TextInput value={c.schoolName ?? ''} onChange={(v) => setEducations((a) => a.map((x) => x._k === c._k ? { ...x, schoolName: v } : x))} placeholder="○○大学" />
                          </InputField>
                          {vis.showFacultyDepartment && (
                            <InputField label="学部・学科（任意）" error={errors[`edu_${i}_facultyDepartment`]}>
                              <TextInput value={c.facultyDepartment ?? ''} onChange={(v) => setEducations((a) => a.map((x) => x._k === c._k ? { ...x, facultyDepartment: v } : x))} placeholder="○○学部○○学科" />
                            </InputField>
                          )}
                          <InputField label="入学年月（任意）" error={errors[`edu_${i}_enteredYearMonth`]}>
                            <MonthInput value={c.enteredYearMonth ?? ''} onChange={(v) => setEducations((a) => a.map((x) => x._k === c._k ? { ...x, enteredYearMonth: v } : x))} />
                          </InputField>
                          <InputField label="卒業年月（任意）" error={errors[`edu_${i}_graduatedYearMonth`]}>
                            <MonthInput value={c.graduatedYearMonth ?? ''} onChange={(v) => setEducations((a) => a.map((x) => x._k === c._k ? { ...x, graduatedYearMonth: v } : x))} />
                          </InputField>
                          <InputField label="卒業区分（任意）" error={errors[`edu_${i}_graduationStatus`]}>
                            <SelectField value={c.graduationStatus ?? ''} onChange={(v) => setEducations((a) => a.map((x) => x._k === c._k ? { ...x, graduationStatus: v } : x))} options={GRADUATION_STATUS_OPTIONS} placeholder="選択してください" />
                          </InputField>
                        </div>
                      </CardShell>
                    )
                  })}
                </div>
                <AddButton label="学歴を追加" disabled={educations.length >= RESUME_LIMITS.maxEducations} onClick={() => setEducations((a) => [...a, emptyEdu()])} />
              </section>
            )}

            {/* ── STEP 4: 職歴 ── */}
            {subStep === 4 && (
              <section>
                <StepHeader title="職歴" note="新しい職歴から順にご入力ください。職歴がない場合は「職歴なし」をお選びください。" minutes="約3分" />
                <div className="mb-4">
                  <Checkbox checked={noWork} onChange={setNoWork} label="職歴なし（新卒・未就業）" />
                </div>
                {!noWork && (
                  <>
                    {errors.workExperiences && <FieldBanner message={errors.workExperiences} />}
                    <div className="flex flex-col gap-4">
                      {workExperiences.map((c, i) => (
                        <CardShell key={c._k} title={`職歴 ${i + 1}`} onRemove={workExperiences.length > 1 ? () => setWorkExperiences((a) => a.filter((x) => x._k !== c._k)) : undefined}>
                          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                            <InputField label="会社名" required error={errors[`work_${i}_companyName`]}>
                              <TextInput value={c.companyName ?? ''} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, companyName: v } : x))} placeholder="株式会社○○" />
                            </InputField>
                            <InputField label="部署（任意）" error={errors[`work_${i}_department`]}>
                              <TextInput value={c.department ?? ''} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, department: v } : x))} placeholder="営業部" />
                            </InputField>
                            <InputField label="役職（任意）" error={errors[`work_${i}_position`]}>
                              <TextInput value={c.position ?? ''} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, position: v } : x))} placeholder="主任" />
                            </InputField>
                            <InputField label="雇用形態（任意）" error={errors[`work_${i}_employmentType`]}>
                              <TextInput value={c.employmentType ?? ''} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, employmentType: v } : x))} placeholder="正社員" />
                            </InputField>
                            <InputField label="入社年月（任意）" error={errors[`work_${i}_joinedYearMonth`]}>
                              <MonthInput value={c.joinedYearMonth ?? ''} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, joinedYearMonth: v } : x))} />
                            </InputField>
                            <InputField label="退職年月" error={errors[`work_${i}_leftYearMonth`]}>
                              <MonthInput value={c.leftYearMonth ?? ''} disabled={c.isCurrent === true} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, leftYearMonth: v } : x))} />
                            </InputField>
                            <div className="sm:col-span-2">
                              <Checkbox checked={c.isCurrent === true} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, isCurrent: v, leftYearMonth: v ? '' : x.leftYearMonth } : x))} label="現在も在籍している" />
                            </div>
                            <div className="sm:col-span-2">
                              <InputField label="仕事内容（任意）" error={errors[`work_${i}_description`]}>
                                <TextArea value={c.description ?? ''} onChange={(v) => setWorkExperiences((a) => a.map((x) => x._k === c._k ? { ...x, description: v } : x))} placeholder="担当した業務内容をご記入ください" maxLength={RESUME_LIMITS.description} rows={3} />
                              </InputField>
                            </div>
                          </div>
                        </CardShell>
                      ))}
                    </div>
                    <AddButton label="職歴を追加" disabled={workExperiences.length >= RESUME_LIMITS.maxWorkExperiences} onClick={() => setWorkExperiences((a) => [...a, emptyWork()])} />
                  </>
                )}
              </section>
            )}

            {/* ── STEP 5: 資格・自己PR ── */}
            {subStep === 5 && (
              <section>
                <StepHeader title="資格・自己PR" note="保有資格・志望動機・自己PRをご入力ください（任意）。" minutes="約3分" />
                <datalist id="license-suggestions">
                  {COMMON_LICENSES.map((n) => (<option key={n} value={n} />))}
                </datalist>
                <div className="mb-2 text-sm font-semibold text-slate-700">保有資格・免許</div>
                <div className="flex flex-col gap-4">
                  {licenses.map((c, i) => (
                    <CardShell key={c._k} title={`資格 ${i + 1}`} onRemove={() => setLicenses((a) => a.filter((x) => x._k !== c._k))}>
                      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <InputField label="資格・免許名" required error={errors[`lic_${i}_name`]}>
                          <input list="license-suggestions" value={c.name ?? ''} onChange={(e) => setLicenses((a) => a.map((x) => x._k === c._k ? { ...x, name: e.target.value } : x))}
                            placeholder="普通自動車第一種運転免許" maxLength={RESUME_LIMITS.licenseName}
                            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </InputField>
                        <InputField label="取得年月（任意）" error={errors[`lic_${i}_acquiredYearMonth`]}>
                          <MonthInput value={c.acquiredYearMonth ?? ''} onChange={(v) => setLicenses((a) => a.map((x) => x._k === c._k ? { ...x, acquiredYearMonth: v } : x))} />
                        </InputField>
                      </div>
                    </CardShell>
                  ))}
                </div>
                <AddButton label="資格を追加" disabled={licenses.length >= RESUME_LIMITS.maxLicenses} onClick={() => setLicenses((a) => [...a, emptyLic()])} />

                <div className="mt-6 flex flex-col gap-5">
                  <InputField label="志望動機（任意）" error={errors.motivation}>
                    <TextArea value={motivation} onChange={setMotivation} placeholder="志望する理由をご記入ください" maxLength={RESUME_LIMITS.motivation} rows={4} />
                  </InputField>
                  <InputField label="自己PR（任意）" error={errors.selfPr}>
                    <TextArea value={selfPr} onChange={setSelfPr} placeholder="ご自身の強みや経験をご記入ください" maxLength={RESUME_LIMITS.selfPr} rows={4} />
                  </InputField>
                  <InputField label="本人希望欄（任意）" error={errors.personalRequests}>
                    <TextArea value={personalRequests} onChange={setPersonalRequests} placeholder="勤務条件などのご希望があればご記入ください" maxLength={RESUME_LIMITS.personalRequests} rows={3} />
                  </InputField>
                </div>
              </section>
            )}

            {/* ── STEP 6: 確認 ── */}
            {subStep === 6 && (
              <section>
                <StepHeader title="入力内容の確認" note="内容をご確認のうえ、応募にお進みください。" minutes="" />
                <div className="flex flex-col gap-5">
                  <PreviewSection title="基本情報" onEdit={() => editStep(1)}>
                    <PreviewRow label="氏名" value={`${lastName} ${firstName}（${lastNameKana} ${firstNameKana}）`} />
                    <PreviewRow label="生年月日" value={`${birthDate}${currentAge != null ? `（${currentAge}歳）` : ''}`} />
                    <PreviewRow label="性別" value={GENDER_OPTIONS.find((g) => g.value === gender)?.label ?? '未回答'} />
                    <PreviewRow label="電話番号" value={phone} />
                    <PreviewRow label="メール" value={email} />
                    <PreviewRow label="応募職種" value={jobTypes.find((j) => j.value === jobId)?.label ?? '—'} />
                  </PreviewSection>

                  <PreviewSection title="住所" onEdit={() => editStep(2)}>
                    <PreviewRow label="郵便番号" value={postalCode || '—'} />
                    <PreviewRow label="住所" value={`${addrPrefecture}${city}${town}${addressLine}${building ? ` ${building}` : ''}`} />
                  </PreviewSection>

                  <PreviewSection title="学歴" onEdit={() => editStep(3)}>
                    {educations.filter((c) => (c.schoolName ?? '').trim()).map((c, i) => (
                      <PreviewRow key={i} label={SCHOOL_TYPE_OPTIONS.find((s) => s.value === c.schoolType)?.label ?? '学歴'}
                        value={`${c.schoolName}${c.facultyDepartment ? ` / ${c.facultyDepartment}` : ''}${c.graduatedYearMonth ? `（${c.graduatedYearMonth} ${GRADUATION_STATUS_OPTIONS.find((g) => g.value === c.graduationStatus)?.label ?? ''}）` : ''}`} />
                    ))}
                  </PreviewSection>

                  <PreviewSection title="職歴" onEdit={() => editStep(4)}>
                    {noWork ? <PreviewRow label="職歴" value="職歴なし" /> :
                      workExperiences.filter((c) => (c.companyName ?? '').trim()).map((c, i) => (
                        <PreviewRow key={i} label={c.companyName ?? ''} value={`${c.position ?? ''}${c.joinedYearMonth ? ` / ${c.joinedYearMonth}〜${c.isCurrent ? '現在' : (c.leftYearMonth ?? '')}` : ''}`} />
                      ))}
                  </PreviewSection>

                  <PreviewSection title="資格・自己PR" onEdit={() => editStep(5)}>
                    {licenses.filter((c) => (c.name ?? '').trim()).map((c, i) => (
                      <PreviewRow key={i} label="資格" value={`${c.name}${c.acquiredYearMonth ? `（${c.acquiredYearMonth}）` : ''}`} />
                    ))}
                    {motivation && <PreviewRow label="志望動機" value={motivation} />}
                    {selfPr && <PreviewRow label="自己PR" value={selfPr} />}
                    {personalRequests && <PreviewRow label="本人希望欄" value={personalRequests} />}
                  </PreviewSection>
                </div>

                {TURNSTILE_SITE_KEY && (
                  <div className="mt-6 flex justify-center">
                    <TurnstileWidget ref={turnstileRef} siteKey={TURNSTILE_SITE_KEY} action="interview_applicant" theme="light" onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} />
                  </div>
                )}
                <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  入力いただいた情報は暗号化して安全に管理します
                </p>
              </section>
            )}

            {errors.submit && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{errors.submit}</div>
            )}

            {/* ナビゲーション */}
            <div className="mt-8 flex items-center gap-3">
              {subStep > 1 && (<div className="flex-1"><SecondaryButton onClick={goPrev}>戻る</SecondaryButton></div>)}
              <div className={subStep > 1 ? 'flex-1' : 'w-full'}>
                {subStep < 6 ? (
                  <PrimaryButton onClick={goNext}>次へ進む</PrimaryButton>
                ) : (
                  <PrimaryButton onClick={handleSubmit} loading={submitting}>この内容で応募する</PrimaryButton>
                )}
              </div>
            </div>

            <div className="mt-4 text-center">
              <TextLink onClick={() => {
                if (window.confirm('面接をキャンセルしますか？入力内容は保存されません。')) {
                  clearDraft()
                  router.push(`/interview/${slug}/cancelled`)
                }
              }}>面接をキャンセルする</TextLink>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4 text-center">
              <p className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <HelpCircle className="h-3.5 w-3.5" />
                ご不明な点があれば
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:text-blue-700">サポート</a>
                をご利用ください
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// ── 補助コンポーネント ─────────────────────────────────────────
function StepHeader({ title, note, minutes }: { title: string; note: string; minutes: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-sm text-slate-500">{note}</p>
        {minutes && (<span className="inline-flex items-center gap-1 text-xs text-slate-400"><Clock className="h-3.5 w-3.5" />所要時間：{minutes}</span>)}
      </div>
    </div>
  )
}

function MonthInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input type="month" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'cursor-not-allowed bg-gray-100' : 'bg-white'}`} />
  )
}

function CardShell({ title, onRemove, children }: { title: string; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />削除
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-sm font-medium transition ${disabled ? 'cursor-not-allowed border-slate-200 text-slate-300' : 'border-blue-300 text-blue-600 hover:bg-blue-50'}`}>
      <Plus className="h-4 w-4" />{label}
    </button>
  )
}

function FieldBanner({ message }: { message: string }) {
  return (<div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{message}</div>)
}

function PreviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
          <Pencil className="h-3.5 w-3.5" />修正
        </button>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="whitespace-pre-wrap break-words text-slate-800">{value || '—'}</span>
    </div>
  )
}

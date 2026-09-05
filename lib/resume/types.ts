// デジタル履歴書 v1 — domain types / string unions / server validation 上限。
//   DB row 型（snake_case・DB 由来）と public form input 型（camelCase・client 由来）を必要以上に混ぜない。
//   本ファイルは pure（DB/HTTP 非依存）。

// ── string unions（DB CHECK と一致） ─────────────────────────────────────────
export const SCHOOL_TYPES = [
  'junior_high', 'high_school', 'vocational', 'junior_college', 'university', 'graduate_school', 'other',
] as const
export type SchoolType = (typeof SCHOOL_TYPES)[number]

export const GRADUATION_STATUSES = ['graduated', 'expected', 'withdrawn', 'enrolled'] as const
export type GraduationStatus = (typeof GRADUATION_STATUSES)[number]

// ── public form input（正規化前・client 由来。camelCase） ───────────────────
export interface ResumeAddressInput {
  postalCode?: string | null
  prefecture?: string | null
  city?: string | null
  town?: string | null
  addressLine?: string | null
  building?: string | null
}
export interface ResumeEducationInput {
  schoolType?: string | null
  schoolName?: string | null
  facultyDepartment?: string | null
  enteredYearMonth?: string | null
  graduatedYearMonth?: string | null
  graduationStatus?: string | null
}
export interface ResumeWorkExperienceInput {
  companyName?: string | null
  department?: string | null
  position?: string | null
  employmentType?: string | null
  joinedYearMonth?: string | null
  leftYearMonth?: string | null
  isCurrent?: boolean | null
  description?: string | null
}
export interface ResumeLicenseInput {
  name?: string | null
  acquiredYearMonth?: string | null
}
export interface ResumeInput {
  address?: ResumeAddressInput | null
  educations?: ResumeEducationInput[] | null
  workExperiences?: ResumeWorkExperienceInput[] | null
  licenses?: ResumeLicenseInput[] | null
  motivation?: string | null
  selfPr?: string | null
  personalRequests?: string | null
}

// ── normalized（server validation 後・RPC の jsonb へ渡す形。snake_case・DB 名と一致） ──
export interface NormalizedResumeAddress {
  postal_code: string | null
  prefecture: string | null
  city: string | null
  town: string | null
  address_line: string | null
  building: string | null
}
export interface NormalizedResumeEducation {
  sort_order: number
  school_type: SchoolType
  school_name: string
  faculty_department: string | null
  entered_year_month: string | null
  graduated_year_month: string | null
  graduation_status: GraduationStatus | null
}
export interface NormalizedResumeWorkExperience {
  sort_order: number
  company_name: string
  department: string | null
  position: string | null
  employment_type: string | null
  joined_year_month: string | null
  left_year_month: string | null
  is_current: boolean
  description: string | null
}
export interface NormalizedResumeLicense {
  sort_order: number
  name: string
  acquired_year_month: string | null
}
export interface NormalizedResumeInput {
  address: NormalizedResumeAddress
  educations: NormalizedResumeEducation[]
  work_experiences: NormalizedResumeWorkExperience[]
  licenses: NormalizedResumeLicense[]
  motivation: string | null
  self_pr: string | null
  personal_requests: string | null
}

// ── server validation の上限（DB varchar ではなく domain validation を SoT にする・日本語利用前提・短すぎない） ──
export const RESUME_LIMITS = {
  name: 50,            // 姓/名（各）
  kana: 50,            // フリガナ（各）
  postalCodeDigits: 7,
  city: 50,
  town: 100,
  addressLine: 100,
  building: 100,
  schoolName: 100,
  facultyDepartment: 100,
  companyName: 100,
  department: 100,
  position: 100,
  workEmploymentType: 50,
  licenseName: 100,
  description: 2000,   // 職歴の仕事内容
  motivation: 2000,    // 志望動機
  selfPr: 2000,        // 自己PR
  personalRequests: 1000, // 本人希望欄
  // 配列上限（無制限保存を避ける）
  maxEducations: 20,
  maxWorkExperiences: 30,
  maxLicenses: 30,
} as const

export interface ResumeValidationError {
  field: string
  message: string
}

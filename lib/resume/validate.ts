// デジタル履歴書 v1 — validation / normalization 純ロジック（DB/HTTP 非依存）。
//   server の domain validation を SoT にする（DB varchar ではなく本ロジックで上限/整合を担保）。
//   sort_order は client 値を信用せず配列順で 0..N-1 に再採番。
import {
  RESUME_LIMITS, SCHOOL_TYPES, GRADUATION_STATUSES,
  type SchoolType, type GraduationStatus,
  type ResumeInput, type ResumeEducationInput, type ResumeWorkExperienceInput,
  type ResumeLicenseInput, type ResumeAddressInput,
  type NormalizedResumeInput, type NormalizedResumeEducation, type ResumeValidationError,
} from './types'
import { normalizePostalCode, normalizeYearMonth, isValidYearMonth, yearMonthToOrdinal, trimToNull } from './normalize'

const isSchoolType = (v: unknown): v is SchoolType => typeof v === 'string' && (SCHOOL_TYPES as readonly string[]).includes(v)
const isGraduationStatus = (v: unknown): v is GraduationStatus =>
  typeof v === 'string' && (GRADUATION_STATUSES as readonly string[]).includes(v)

// 学校区分ごとの項目出し分け。
//   - showFacultyDepartment（学部・学科）: 専門/短大/大学/大学院 のみ（中学/高校/その他は非表示）。
//   - showEnteredYearMonth（入学年月）: 中学校は卒業情報中心のため非表示。それ以外は表示（任意）。
export function educationFieldVisibility(
  schoolType: string | null | undefined,
): { showFacultyDepartment: boolean; showEnteredYearMonth: boolean } {
  const showFacultyDepartment =
    schoolType === 'vocational' || schoolType === 'junior_college' || schoolType === 'university' || schoolType === 'graduate_school'
  const showEnteredYearMonth = schoolType !== 'junior_high'
  return { showFacultyDepartment, showEnteredYearMonth }
}

// 新 school_type → legacy `applicants.education`（NOT NULL・単一 TEXT）用コードの対応表。
//   admin/client 応募者詳細の EDUCATION_LABELS のキー集合と一致させる（graduate_school→'graduate'）。
const SCHOOL_TYPE_TO_LEGACY_EDUCATION: Record<SchoolType, string> = {
  junior_high: 'junior_high',
  high_school: 'high_school',
  vocational: 'vocational',
  junior_college: 'junior_college',
  university: 'university',
  graduate_school: 'graduate',
  other: 'other',
}

// 構造化学歴から legacy `applicants.education`（Production は NOT NULL）用の最終学歴コードを生成。
//   - 最後の有効な学歴カード（normalized は空カード除外済み・フォーム順＝配列末尾が最終行）を「最終学歴」に採用。
//   - 学歴 0 件は空文字 '' を返す（NOT NULL を満たす／架空の学歴を作らない／既存表示は '' → '未入力' として自然に描画）。
//   - DB 制約は変更せず、server 側で legacy 互換値を補う（RPC/P9 SQL/Prod DB は不変）。
export function deriveLegacyEducation(educations: readonly NormalizedResumeEducation[]): string {
  if (!educations || educations.length === 0) return ''
  const last = educations[educations.length - 1]
  return SCHOOL_TYPE_TO_LEGACY_EDUCATION[last.school_type] ?? ''
}

// 新 resume フォームの性別は male/female 必須（空/other/no_answer は reject）。
//   ※ legacy applicant（other/no_answer 既存データ）や DB CHECK は破壊しない＝本検証は新フォーム経路専用。
export function validateResumeGender(gender: string | null | undefined): ResumeValidationError | null {
  if (gender === 'male' || gender === 'female') return null
  return { field: 'gender', message: '性別を選択してください' }
}

// 在職中なら退職年月は不要（disable/hide）。
export function workRequiresLeftDate(isCurrent: boolean | null | undefined): boolean {
  return isCurrent !== true
}

const overLimit = (s: string | null, max: number): boolean => s != null && s.length > max

// ── 個別 validation（正規化前の入力に対して。field は index 付きで呼び出し側が付与可） ──
export function validateResumeEducation(e: ResumeEducationInput): ResumeValidationError[] {
  const errs: ResumeValidationError[] = []
  if (!isSchoolType(e.schoolType)) errs.push({ field: 'schoolType', message: '学校区分を選択してください' })
  const name = trimToNull(e.schoolName ?? null)
  if (!name) errs.push({ field: 'schoolName', message: '学校名を入力してください' })
  else if (overLimit(name, RESUME_LIMITS.schoolName)) errs.push({ field: 'schoolName', message: `学校名は${RESUME_LIMITS.schoolName}文字以内で入力してください` })
  if (overLimit(trimToNull(e.facultyDepartment ?? null), RESUME_LIMITS.facultyDepartment)) errs.push({ field: 'facultyDepartment', message: `学部・学科は${RESUME_LIMITS.facultyDepartment}文字以内で入力してください` })
  if (!isValidYearMonth(e.enteredYearMonth)) errs.push({ field: 'enteredYearMonth', message: '入学年月は YYYY-MM 形式で入力してください' })
  if (!isValidYearMonth(e.graduatedYearMonth)) errs.push({ field: 'graduatedYearMonth', message: '卒業年月は YYYY-MM 形式で入力してください' })
  if (e.graduationStatus != null && String(e.graduationStatus).trim() !== '' && !isGraduationStatus(e.graduationStatus))
    errs.push({ field: 'graduationStatus', message: '卒業区分が不正です' })
  // 明らかな逆転（入学 > 卒業）は reject
  const a = yearMonthToOrdinal(e.enteredYearMonth), b = yearMonthToOrdinal(e.graduatedYearMonth)
  if (a != null && b != null && a > b) errs.push({ field: 'graduatedYearMonth', message: '卒業年月は入学年月より後にしてください' })
  return errs
}

export function validateResumeWorkExperience(w: ResumeWorkExperienceInput): ResumeValidationError[] {
  const errs: ResumeValidationError[] = []
  const name = trimToNull(w.companyName ?? null)
  if (!name) errs.push({ field: 'companyName', message: '会社名を入力してください' })
  else if (overLimit(name, RESUME_LIMITS.companyName)) errs.push({ field: 'companyName', message: `会社名は${RESUME_LIMITS.companyName}文字以内で入力してください` })
  if (overLimit(trimToNull(w.department ?? null), RESUME_LIMITS.department)) errs.push({ field: 'department', message: `部署は${RESUME_LIMITS.department}文字以内で入力してください` })
  if (overLimit(trimToNull(w.position ?? null), RESUME_LIMITS.position)) errs.push({ field: 'position', message: `役職は${RESUME_LIMITS.position}文字以内で入力してください` })
  if (overLimit(trimToNull(w.employmentType ?? null), RESUME_LIMITS.workEmploymentType)) errs.push({ field: 'employmentType', message: `雇用形態は${RESUME_LIMITS.workEmploymentType}文字以内で入力してください` })
  if (overLimit(trimToNull(w.description ?? null), RESUME_LIMITS.description)) errs.push({ field: 'description', message: `仕事内容は${RESUME_LIMITS.description}文字以内で入力してください` })
  if (!isValidYearMonth(w.joinedYearMonth)) errs.push({ field: 'joinedYearMonth', message: '入社年月は YYYY-MM 形式で入力してください' })
  if (!isValidYearMonth(w.leftYearMonth)) errs.push({ field: 'leftYearMonth', message: '退職年月は YYYY-MM 形式で入力してください' })
  // 在職中なのに退職年月がある → reject
  if (w.isCurrent === true && trimToNull(w.leftYearMonth ?? null) != null)
    errs.push({ field: 'leftYearMonth', message: '在職中の場合は退職年月を入力できません' })
  // joined > left → reject（在職中でない場合）
  if (w.isCurrent !== true) {
    const a = yearMonthToOrdinal(w.joinedYearMonth), b = yearMonthToOrdinal(w.leftYearMonth)
    if (a != null && b != null && a > b) errs.push({ field: 'leftYearMonth', message: '退職年月は入社年月より後にしてください' })
  }
  return errs
}

export function validateResumeLicense(l: ResumeLicenseInput): ResumeValidationError[] {
  const errs: ResumeValidationError[] = []
  const name = trimToNull(l.name ?? null)
  if (!name) errs.push({ field: 'name', message: '資格・免許名を入力してください' })
  else if (overLimit(name, RESUME_LIMITS.licenseName)) errs.push({ field: 'name', message: `資格・免許名は${RESUME_LIMITS.licenseName}文字以内で入力してください` })
  if (!isValidYearMonth(l.acquiredYearMonth)) errs.push({ field: 'acquiredYearMonth', message: '取得年月は YYYY-MM 形式で入力してください' })
  return errs
}

export function validateResumeAddress(a: ResumeAddressInput): ResumeValidationError[] {
  const errs: ResumeValidationError[] = []
  if (a.postalCode != null && String(a.postalCode).trim() !== '' && normalizePostalCode(a.postalCode) === null)
    errs.push({ field: 'postalCode', message: '郵便番号は7桁の数字で入力してください' })
  if (overLimit(trimToNull(a.city ?? null), RESUME_LIMITS.city)) errs.push({ field: 'city', message: `市区町村は${RESUME_LIMITS.city}文字以内で入力してください` })
  if (overLimit(trimToNull(a.town ?? null), RESUME_LIMITS.town)) errs.push({ field: 'town', message: `町域は${RESUME_LIMITS.town}文字以内で入力してください` })
  if (overLimit(trimToNull(a.addressLine ?? null), RESUME_LIMITS.addressLine)) errs.push({ field: 'addressLine', message: `番地は${RESUME_LIMITS.addressLine}文字以内で入力してください` })
  if (overLimit(trimToNull(a.building ?? null), RESUME_LIMITS.building)) errs.push({ field: 'building', message: `建物名は${RESUME_LIMITS.building}文字以内で入力してください` })
  return errs
}

// 「完全に空のカード」判定＝全フィールドが空のときだけ除外する。
//   （必須の学校名/会社名/資格名だけ空で他は入力済み、というカードは除外せず validate に載せ、
//     必須未入力エラーとして返す＝入力済みデータを黙って捨てない）。
const allBlank = (...vals: (string | null | undefined)[]) => vals.every((v) => trimToNull(v ?? null) === null)
const isEmptyEducation = (e: ResumeEducationInput) =>
  allBlank(e.schoolType, e.schoolName, e.facultyDepartment, e.enteredYearMonth, e.graduatedYearMonth, e.graduationStatus)
const isEmptyWork = (w: ResumeWorkExperienceInput) =>
  w.isCurrent !== true &&
  allBlank(w.companyName, w.department, w.position, w.employmentType, w.joinedYearMonth, w.leftYearMonth, w.description)
const isEmptyLicense = (l: ResumeLicenseInput) => allBlank(l.name, l.acquiredYearMonth)

const clampText = (s: string | null | undefined, max: number): string | null => {
  const t = trimToNull(s ?? null)
  return t == null ? null : t.slice(0, max)
}

// メイン: 入力 → { normalized, errors }。errors が空でなければ RPC/DB へ渡さない（server route で 4xx）。
//   sort_order は配列順で 0..N-1 に再採番（client 値無視）。空カードは除外。配列上限で切り詰め。
export function normalizeResumeInput(input: ResumeInput | null | undefined): {
  normalized: NormalizedResumeInput
  errors: ResumeValidationError[]
} {
  const errors: ResumeValidationError[] = []
  const src = input ?? {}

  // address
  const addr = src.address ?? {}
  for (const e of validateResumeAddress(addr)) errors.push({ field: `address.${e.field}`, message: e.message })

  // educations（空カード除外 → 上限 → validate → 再採番）
  const eduInputs = (Array.isArray(src.educations) ? src.educations : []).filter((e) => !isEmptyEducation(e))
  if (eduInputs.length > RESUME_LIMITS.maxEducations) errors.push({ field: 'educations', message: `学歴は${RESUME_LIMITS.maxEducations}件までです` })
  const educations = eduInputs.slice(0, RESUME_LIMITS.maxEducations).map((e, i) => {
    for (const err of validateResumeEducation(e)) errors.push({ field: `educations[${i}].${err.field}`, message: err.message })
    return {
      sort_order: i,
      school_type: (isSchoolType(e.schoolType) ? e.schoolType : 'other') as SchoolType,
      school_name: clampText(e.schoolName, RESUME_LIMITS.schoolName) ?? '',
      faculty_department: educationFieldVisibility(e.schoolType).showFacultyDepartment ? clampText(e.facultyDepartment, RESUME_LIMITS.facultyDepartment) : null,
      entered_year_month: normalizeYearMonth(e.enteredYearMonth),
      graduated_year_month: normalizeYearMonth(e.graduatedYearMonth),
      graduation_status: isGraduationStatus(e.graduationStatus) ? e.graduationStatus : null,
    }
  })

  // work_experiences
  const workInputs = (Array.isArray(src.workExperiences) ? src.workExperiences : []).filter((w) => !isEmptyWork(w))
  if (workInputs.length > RESUME_LIMITS.maxWorkExperiences) errors.push({ field: 'workExperiences', message: `職歴は${RESUME_LIMITS.maxWorkExperiences}件までです` })
  const work_experiences = workInputs.slice(0, RESUME_LIMITS.maxWorkExperiences).map((w, i) => {
    for (const err of validateResumeWorkExperience(w)) errors.push({ field: `workExperiences[${i}].${err.field}`, message: err.message })
    const isCurrent = w.isCurrent === true
    return {
      sort_order: i,
      company_name: clampText(w.companyName, RESUME_LIMITS.companyName) ?? '',
      department: clampText(w.department, RESUME_LIMITS.department),
      position: clampText(w.position, RESUME_LIMITS.position),
      employment_type: clampText(w.employmentType, RESUME_LIMITS.workEmploymentType),
      joined_year_month: normalizeYearMonth(w.joinedYearMonth),
      left_year_month: isCurrent ? null : normalizeYearMonth(w.leftYearMonth), // 在職中は退職年月を強制 null
      is_current: isCurrent,
      description: clampText(w.description, RESUME_LIMITS.description),
    }
  })

  // licenses
  const licInputs = (Array.isArray(src.licenses) ? src.licenses : []).filter((l) => !isEmptyLicense(l))
  if (licInputs.length > RESUME_LIMITS.maxLicenses) errors.push({ field: 'licenses', message: `免許・資格は${RESUME_LIMITS.maxLicenses}件までです` })
  const licenses = licInputs.slice(0, RESUME_LIMITS.maxLicenses).map((l, i) => {
    for (const err of validateResumeLicense(l)) errors.push({ field: `licenses[${i}].${err.field}`, message: err.message })
    return {
      sort_order: i,
      name: clampText(l.name, RESUME_LIMITS.licenseName) ?? '',
      acquired_year_month: normalizeYearMonth(l.acquiredYearMonth),
    }
  })

  const normalized: NormalizedResumeInput = {
    address: {
      postal_code: normalizePostalCode(addr.postalCode),
      prefecture: clampText(addr.prefecture, 20),
      city: clampText(addr.city, RESUME_LIMITS.city),
      town: clampText(addr.town, RESUME_LIMITS.town),
      address_line: clampText(addr.addressLine, RESUME_LIMITS.addressLine),
      building: clampText(addr.building, RESUME_LIMITS.building),
    },
    educations,
    work_experiences,
    licenses,
    motivation: clampText(src.motivation, RESUME_LIMITS.motivation),
    self_pr: clampText(src.selfPr, RESUME_LIMITS.selfPr),
    personal_requests: clampText(src.personalRequests, RESUME_LIMITS.personalRequests),
  }
  return { normalized, errors }
}

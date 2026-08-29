import { describe, it, expect } from 'vitest'
import { normalizePostalCode, normalizeYearMonth, isValidYearMonth, computeAge, yearMonthToOrdinal } from './normalize'
import {
  educationFieldVisibility, workRequiresLeftDate,
  validateResumeEducation, validateResumeWorkExperience, validateResumeLicense, validateResumeAddress,
  normalizeResumeInput,
} from './validate'
import { RESUME_LIMITS } from './types'

describe('normalizePostalCode（ハイフン/全角/桁）', () => {
  it('ハイフンあり → 7桁', () => { expect(normalizePostalCode('220-0012')).toBe('2200012') })
  it('ハイフンなし → 7桁', () => { expect(normalizePostalCode('2200012')).toBe('2200012') })
  it('全角 → 半角7桁', () => { expect(normalizePostalCode('２２０００１２')).toBe('2200012') })
  it('桁不足/超過/文字混入 → null', () => {
    expect(normalizePostalCode('12345')).toBeNull()
    expect(normalizePostalCode('22000123')).toBeNull()
    expect(normalizePostalCode('22a0012')).toBeNull()
    expect(normalizePostalCode('')).toBeNull()
    expect(normalizePostalCode(null)).toBeNull()
  })
})

describe('year-month validation', () => {
  it('valid', () => {
    expect(normalizeYearMonth('2026-01')).toBe('2026-01')
    expect(normalizeYearMonth('1998-12')).toBe('1998-12')
    expect(isValidYearMonth('2026-01')).toBe(true)
  })
  it('invalid month/format → null / false', () => {
    for (const bad of ['2026-00', '2026-13', '26-01', '2026-1', 'abcd-01', '2026/01']) {
      expect(normalizeYearMonth(bad)).toBeNull()
      expect(isValidYearMonth(bad)).toBe(false)
    }
  })
  it('未入力（null/空）は許容（任意項目）', () => {
    expect(isValidYearMonth(null)).toBe(true)
    expect(isValidYearMonth('')).toBe(true)
  })
  it('ordinal 比較', () => {
    expect(yearMonthToOrdinal('2020-01')! < yearMonthToOrdinal('2020-02')!).toBe(true)
    expect(yearMonthToOrdinal('2019-12')! < yearMonthToOrdinal('2020-01')!).toBe(true)
  })
})

describe('computeAge（境界・閏年）', () => {
  it('誕生日前 → -1', () => {
    expect(computeAge('2000-06-15', new Date('2026-06-14T00:00:00'))).toBe(25)
  })
  it('誕生日当日 → 満年齢', () => {
    expect(computeAge('2000-06-15', new Date('2026-06-15T00:00:00'))).toBe(26)
  })
  it('誕生日後 → 満年齢', () => {
    expect(computeAge('2000-06-15', new Date('2026-06-16T00:00:00'))).toBe(26)
  })
  it('閏年 2/29 → 平年 3/1 で加齢済み', () => {
    expect(computeAge('2004-02-29', new Date('2027-02-28T00:00:00'))).toBe(22) // 誕生日前日相当
    expect(computeAge('2004-02-29', new Date('2027-03-01T00:00:00'))).toBe(23)
  })
  it('不正/未入力 → null', () => {
    expect(computeAge(null)).toBeNull()
    expect(computeAge('2000/06/15')).toBeNull()
    expect(computeAge('2000-13-15')).toBeNull()
  })
})

describe('field visibility / current', () => {
  it('学校区分ごとの学部・学科', () => {
    expect(educationFieldVisibility('university').showFacultyDepartment).toBe(true)
    expect(educationFieldVisibility('graduate_school').showFacultyDepartment).toBe(true)
    expect(educationFieldVisibility('vocational').showFacultyDepartment).toBe(true)
    expect(educationFieldVisibility('junior_high').showFacultyDepartment).toBe(false)
    expect(educationFieldVisibility('high_school').showFacultyDepartment).toBe(false)
    expect(educationFieldVisibility('other').showFacultyDepartment).toBe(false)
  })
  it('在職中は退職年月不要', () => {
    expect(workRequiresLeftDate(true)).toBe(false)
    expect(workRequiresLeftDate(false)).toBe(true)
    expect(workRequiresLeftDate(null)).toBe(true)
  })
})

describe('education validation', () => {
  it('valid', () => {
    expect(validateResumeEducation({ schoolType: 'university', schoolName: 'A大学', enteredYearMonth: '2018-04', graduatedYearMonth: '2022-03', graduationStatus: 'graduated' })).toEqual([])
  })
  it('school_type 未選択 → error', () => {
    expect(validateResumeEducation({ schoolName: 'A' }).some((e) => e.field === 'schoolType')).toBe(true)
  })
  it('入学>卒業 逆転 → error', () => {
    expect(validateResumeEducation({ schoolType: 'university', schoolName: 'A', enteredYearMonth: '2022-04', graduatedYearMonth: '2018-03' }).some((e) => e.field === 'graduatedYearMonth')).toBe(true)
  })
})

describe('work validation', () => {
  it('valid', () => {
    expect(validateResumeWorkExperience({ companyName: 'X社', joinedYearMonth: '2020-04', leftYearMonth: '2023-03' })).toEqual([])
  })
  it('is_current + 退職年月 → reject', () => {
    expect(validateResumeWorkExperience({ companyName: 'X社', isCurrent: true, leftYearMonth: '2023-03' }).some((e) => e.field === 'leftYearMonth')).toBe(true)
  })
  it('入社>退職 逆転 → reject', () => {
    expect(validateResumeWorkExperience({ companyName: 'X社', joinedYearMonth: '2023-04', leftYearMonth: '2020-03' }).some((e) => e.field === 'leftYearMonth')).toBe(true)
  })
  it('会社名必須', () => {
    expect(validateResumeWorkExperience({ companyName: '  ' }).some((e) => e.field === 'companyName')).toBe(true)
  })
})

describe('license / address validation', () => {
  it('license valid / name 必須 / month', () => {
    expect(validateResumeLicense({ name: 'TOEIC', acquiredYearMonth: '2024-06' })).toEqual([])
    expect(validateResumeLicense({ name: '' }).some((e) => e.field === 'name')).toBe(true)
    expect(validateResumeLicense({ name: 'X', acquiredYearMonth: '2024-13' }).some((e) => e.field === 'acquiredYearMonth')).toBe(true)
  })
  it('address postal 不正', () => {
    expect(validateResumeAddress({ postalCode: '123' }).some((e) => e.field === 'postalCode')).toBe(true)
    expect(validateResumeAddress({ postalCode: '220-0012' })).toEqual([])
  })
})

describe('normalizeResumeInput（sort_order 再採番 / 空カード除外 / 限度 / 正規化）', () => {
  it('sort_order を配列順で 0..N-1 に再採番（client 値無視）', () => {
    const { normalized } = normalizeResumeInput({
      educations: [
        { schoolType: 'high_school', schoolName: 'B高校' },
        { schoolType: 'university', schoolName: 'A大学', facultyDepartment: '工学部' },
      ],
    })
    expect(normalized.educations.map((e) => e.sort_order)).toEqual([0, 1])
    // high_school は学部・学科を保存しない（visibility）
    expect(normalized.educations[0].faculty_department).toBeNull()
    expect(normalized.educations[1].faculty_department).toBe('工学部')
  })
  it('空カードは除外', () => {
    const { normalized } = normalizeResumeInput({
      educations: [{ schoolName: '' }, { schoolType: 'university', schoolName: 'A大学' }],
      workExperiences: [{ companyName: '  ' }, { companyName: 'X社' }],
      licenses: [{ name: '' }, { name: '普通自動車第一種運転免許' }],
    })
    expect(normalized.educations.length).toBe(1)
    expect(normalized.work_experiences.length).toBe(1)
    expect(normalized.licenses.length).toBe(1)
  })
  it('在職中は left_year_month を強制 null に正規化', () => {
    const { normalized } = normalizeResumeInput({ workExperiences: [{ companyName: 'X社', isCurrent: true, leftYearMonth: '2023-03' }] })
    expect(normalized.work_experiences[0].is_current).toBe(true)
    expect(normalized.work_experiences[0].left_year_month).toBeNull()
  })
  it('postal 正規化 / 長文は上限で切り詰め', () => {
    const long = 'あ'.repeat(RESUME_LIMITS.selfPr + 500)
    const { normalized } = normalizeResumeInput({ address: { postalCode: '220-0012' }, selfPr: long })
    expect(normalized.address.postal_code).toBe('2200012')
    expect(normalized.self_pr!.length).toBe(RESUME_LIMITS.selfPr)
  })
  it('配列上限超過 → error＋切り詰め', () => {
    const many = Array.from({ length: RESUME_LIMITS.maxLicenses + 3 }, (_, i) => ({ name: `資格${i}` }))
    const { normalized, errors } = normalizeResumeInput({ licenses: many })
    expect(normalized.licenses.length).toBe(RESUME_LIMITS.maxLicenses)
    expect(errors.some((e) => e.field === 'licenses')).toBe(true)
  })
  it('不正入力は index 付き field で errors に集約', () => {
    const { errors } = normalizeResumeInput({
      educations: [{ schoolType: 'university', schoolName: 'A', enteredYearMonth: '2022-04', graduatedYearMonth: '2018-03' }],
    })
    expect(errors.some((e) => e.field === 'educations[0].graduatedYearMonth')).toBe(true)
  })
})

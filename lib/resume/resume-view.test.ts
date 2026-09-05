import { describe, it, expect } from 'vitest'
import {
  genderLabel, employmentTypeLabel, industryExperienceLabel, schoolTypeLabel, graduationStatusLabel,
  legacyEducationLabel,
  formatYearMonth, formatBirthDate, formatPostalCode, joinResumeAddress, resumeSectionMode, resolveDisplayAge,
} from './resume-view'

describe('日本語ラベル変換', () => {
  it('性別', () => {
    expect(genderLabel('male')).toBe('男性')
    expect(genderLabel('female')).toBe('女性')
    expect(genderLabel('other')).toBe('その他')
    expect(genderLabel('no_answer')).toBe('未回答')
  })
  it('就業形態 / 業界経験', () => {
    expect(employmentTypeLabel('new_graduate')).toBe('新卒')
    expect(employmentTypeLabel('mid_career')).toBe('中途採用')
    expect(industryExperienceLabel('experienced')).toBe('経験あり')
    expect(industryExperienceLabel('inexperienced')).toBe('未経験')
  })
  it('学校区分', () => {
    expect(schoolTypeLabel('junior_high')).toBe('中学校')
    expect(schoolTypeLabel('high_school')).toBe('高等学校')
    expect(schoolTypeLabel('vocational')).toBe('専門学校')
    expect(schoolTypeLabel('junior_college')).toBe('短期大学')
    expect(schoolTypeLabel('university')).toBe('大学')
    expect(schoolTypeLabel('graduate_school')).toBe('大学院')
    expect(schoolTypeLabel('other')).toBe('その他')
  })
  it('卒業状況', () => {
    expect(graduationStatusLabel('graduated')).toBe('卒業')
    expect(graduationStatusLabel('expected')).toBe('卒業見込み')
    expect(graduationStatusLabel('withdrawn')).toBe('中退')
    expect(graduationStatusLabel('enrolled')).toBe('在学中')
  })
  it('legacy education コード → 日本語（graduate=大学院卒業・EDUCATION_LABELS と一致）', () => {
    expect(legacyEducationLabel('graduate')).toBe('大学院卒業')
    expect(legacyEducationLabel('university')).toBe('大学卒業')
    expect(legacyEducationLabel('junior_high')).toBe('中学校卒業')
    expect(legacyEducationLabel('high_school')).toBe('高校卒業')
    expect(legacyEducationLabel('vocational')).toBe('専門学校卒業')
    expect(legacyEducationLabel('junior_college')).toBe('短期大学卒業')
    expect(legacyEducationLabel('other')).toBe('その他')
    expect(legacyEducationLabel('unknown_code')).toBe('unknown_code') // 未知は生値
    expect(legacyEducationLabel(null)).toBe('')
  })
  it('未知コードは生値・null/空は空文字（クラッシュしない）', () => {
    expect(genderLabel('xyz')).toBe('xyz')
    expect(schoolTypeLabel('unknown_type')).toBe('unknown_type')
    expect(graduationStatusLabel(null)).toBe('')
    expect(genderLabel(undefined)).toBe('')
    expect(employmentTypeLabel('')).toBe('')
  })
})

describe('formatYearMonth', () => {
  it('YYYY-MM → YYYY年M月', () => {
    expect(formatYearMonth('2020-04')).toBe('2020年4月')
    expect(formatYearMonth('1998-12')).toBe('1998年12月')
  })
  it('空/null は空、不正は生値（throw しない）', () => {
    expect(formatYearMonth('')).toBe('')
    expect(formatYearMonth(null)).toBe('')
    expect(formatYearMonth(undefined)).toBe('')
    expect(formatYearMonth('2020-13')).toBe('2020-13')
    expect(formatYearMonth('bad')).toBe('bad')
  })
})

describe('formatBirthDate', () => {
  it('YYYY-MM-DD → YYYY年M月D日', () => {
    expect(formatBirthDate('2000-06-15')).toBe('2000年6月15日')
    expect(formatBirthDate('1990-01-01')).toBe('1990年1月1日')
  })
  it('空/不正は安全にフォールバック', () => {
    expect(formatBirthDate(null)).toBe('')
    expect(formatBirthDate('')).toBe('')
    expect(formatBirthDate('2000/06/15')).toBe('2000/06/15')
    expect(formatBirthDate('2000-13-40')).toBe('2000-13-40')
  })
})

describe('formatPostalCode', () => {
  it('7桁 → 〒123-4567（ハイフン/全角混在も digits 抽出）', () => {
    expect(formatPostalCode('1234567')).toBe('〒123-4567')
    expect(formatPostalCode('123-4567')).toBe('〒123-4567')
  })
  it('空は空・7桁でなければ生値', () => {
    expect(formatPostalCode('')).toBe('')
    expect(formatPostalCode(null)).toBe('')
    expect(formatPostalCode('123')).toBe('123')
  })
})

describe('joinResumeAddress', () => {
  it('都道府県+市区町村+町域+番地（建物は前スペース）', () => {
    expect(joinResumeAddress({ prefecture: '神奈川県', city: '横浜市西区', town: 'みなとみらい', address_line: '1-2-3', building: 'Aマンション101' }))
      .toBe('神奈川県横浜市西区みなとみらい1-2-3 Aマンション101')
  })
  it('欠損は詰めて連結・全空は空', () => {
    expect(joinResumeAddress({ prefecture: '東京都', city: '千代田区', address_line: '1-1' })).toBe('東京都千代田区1-1')
    expect(joinResumeAddress({})).toBe('')
    expect(joinResumeAddress({ building: 'B棟' })).toBe('B棟')
  })
})

describe('resolveDisplayAge（birth_date 都度計算・age 列を SoT にしない）', () => {
  const now = new Date('2026-09-03T00:00:00')
  it('birth_date があれば都度計算（age 列より優先）', () => {
    expect(resolveDisplayAge('2000-06-15', null, now)).toBe(26)
    expect(resolveDisplayAge('2000-06-15', 99, now)).toBe(26) // legacy age を無視して birth_date 優先
  })
  it('birth_date 無し＋legacy age → legacy age にフォールバック', () => {
    expect(resolveDisplayAge(null, 28, now)).toBe(28)
    expect(resolveDisplayAge('', 28, now)).toBe(28)
    expect(resolveDisplayAge(undefined, 0, now)).toBe(0)
  })
  it('birth_date 不正＋legacy age → legacy age', () => {
    expect(resolveDisplayAge('2000/06/15', 30, now)).toBe(30)
  })
  it('どちらも無ければ null（クラッシュしない）', () => {
    expect(resolveDisplayAge(null, null, now)).toBeNull()
    expect(resolveDisplayAge('bad', undefined, now)).toBeNull()
  })
})

describe('resumeSectionMode（error≠empty / structured 優先 / legacy fallback）', () => {
  it('構造化1件以上は structured（legacy より優先）', () => {
    expect(resumeSectionMode('ready', 1, true)).toBe('structured')
    expect(resumeSectionMode('ready', 3, false)).toBe('structured')
  })
  it('0件かつ legacy あり → legacy / legacy なし → empty', () => {
    expect(resumeSectionMode('ready', 0, true)).toBe('legacy')
    expect(resumeSectionMode('ready', 0, false)).toBe('empty')
  })
  it('取得エラーは error（未入力/legacy と偽装しない）', () => {
    expect(resumeSectionMode('error', 0, true)).toBe('error')
    expect(resumeSectionMode('error', 5, true)).toBe('error')
  })
  it('loading は loading', () => {
    expect(resumeSectionMode('loading', 0, false)).toBe('loading')
  })
})

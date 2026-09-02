// デジタル履歴書 v1 — 企業側「履歴書」タブ表示用の pure formatter / label（DB/HTTP 非依存）。
//   - DB コードを日本語ラベルへ変換。未知コードはクラッシュせず生値へフォールバック。
//   - 欠損/不正値でも throw しない（表示は空文字 '' に寄せ、呼び出し側が「未入力」を出す）。
import { computeAge } from './normalize'

// 表示用の年齢を解決。birth_date があれば都度計算（age 列を SoT にしない）。
//   birth_date が無い legacy 応募者は legacy age 列へフォールバック。どちらも無ければ null。
export function resolveDisplayAge(
  birthDate: string | null | undefined,
  legacyAge: number | null | undefined,
  now: Date = new Date(),
): number | null {
  const fromBirth = computeAge(birthDate, now)
  if (fromBirth != null) return fromBirth
  if (typeof legacyAge === 'number' && Number.isFinite(legacyAge) && legacyAge >= 0) return legacyAge
  return null
}

// ── 子テーブル行の表示用型（SELECT する列のみ・snake_case は DB 由来） ──
export interface ResumeEducationView {
  school_type: string | null
  school_name: string | null
  faculty_department: string | null
  entered_year_month: string | null
  graduated_year_month: string | null
  graduation_status: string | null
  sort_order?: number | null
}
export interface ResumeWorkView {
  company_name: string | null
  department: string | null
  position: string | null
  employment_type: string | null
  joined_year_month: string | null
  left_year_month: string | null
  is_current: boolean | null
  description: string | null
  sort_order?: number | null
}
export interface ResumeLicenseView {
  name: string | null
  acquired_year_month: string | null
  sort_order?: number | null
}

// ── 日本語ラベル ──
const GENDER_LABELS: Record<string, string> = { male: '男性', female: '女性', other: 'その他', no_answer: '未回答' }
const EMPLOYMENT_TYPE_LABELS: Record<string, string> = { new_graduate: '新卒', mid_career: '中途採用' }
const INDUSTRY_EXP_LABELS: Record<string, string> = { experienced: '経験あり', inexperienced: '未経験' }
const SCHOOL_TYPE_LABELS: Record<string, string> = {
  junior_high: '中学校', high_school: '高等学校', vocational: '専門学校',
  junior_college: '短期大学', university: '大学', graduate_school: '大学院', other: 'その他',
}
const GRADUATION_STATUS_LABELS: Record<string, string> = {
  graduated: '卒業', expected: '卒業見込み', withdrawn: '中退', enrolled: '在学中',
}

// 未知コードは生値、null/空は '' を返す共通 label 変換。
function labelFrom(map: Record<string, string>, code: string | null | undefined): string {
  if (code == null) return ''
  const s = String(code).trim()
  if (s === '') return ''
  return map[s] ?? s
}

export const genderLabel = (v: string | null | undefined) => labelFrom(GENDER_LABELS, v)
export const employmentTypeLabel = (v: string | null | undefined) => labelFrom(EMPLOYMENT_TYPE_LABELS, v)
export const industryExperienceLabel = (v: string | null | undefined) => labelFrom(INDUSTRY_EXP_LABELS, v)
export const schoolTypeLabel = (v: string | null | undefined) => labelFrom(SCHOOL_TYPE_LABELS, v)
export const graduationStatusLabel = (v: string | null | undefined) => labelFrom(GRADUATION_STATUS_LABELS, v)

// 'YYYY-MM' → 'YYYY年M月'。空は ''、形式不正は生値（trim）を返す（throw しない）。
export function formatYearMonth(v: string | null | undefined): string {
  if (v == null) return ''
  const s = String(v).trim()
  if (s === '') return ''
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) return s
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return s
  return `${m[1]}年${month}月`
}

// 'YYYY-MM-DD' → 'YYYY年M月D日'。空は ''、形式不正は生値を返す。
export function formatBirthDate(v: string | null | undefined): string {
  if (v == null) return ''
  const s = String(v).trim()
  if (s === '') return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return s
  const mm = parseInt(m[2], 10), dd = parseInt(m[3], 10)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return s
  return `${m[1]}年${mm}月${dd}日`
}

// 郵便番号 → '〒123-4567'。7桁化できれば整形、できなければ生値（trim）、空は ''。
export function formatPostalCode(v: string | null | undefined): string {
  if (v == null) return ''
  const s = String(v).trim()
  if (s === '') return ''
  const digits = s.replace(/[^0-9]/g, '')
  if (digits.length === 7) return `〒${digits.slice(0, 3)}-${digits.slice(3)}`
  return s
}

// 住所を「都道府県+市区町村+町域+番地」＋（建物名は前スペース）で自然連結。全空は ''。
export function joinResumeAddress(a: {
  prefecture?: string | null
  city?: string | null
  town?: string | null
  address_line?: string | null
  building?: string | null
}): string {
  const t = (x: string | null | undefined) => (x == null ? '' : String(x).trim())
  const head = [t(a.prefecture), t(a.city), t(a.town), t(a.address_line)].filter((x) => x !== '').join('')
  const building = t(a.building)
  if (head === '' && building === '') return ''
  return building === '' ? head : (head === '' ? building : `${head} ${building}`)
}

// 履歴書セクション（学歴/職歴/資格）の表示モード判定。
//   error を「未入力/legacy」と偽装しない。構造化1件以上は legacy より優先。0件は legacy 有無で分岐。
export type ResumeChildStatus = 'loading' | 'ready' | 'error'
export function resumeSectionMode(
  status: ResumeChildStatus,
  rowCount: number,
  hasLegacy: boolean,
): 'loading' | 'error' | 'structured' | 'legacy' | 'empty' {
  if (status === 'loading') return 'loading'
  if (status === 'error') return 'error'
  if (rowCount > 0) return 'structured'
  return hasLegacy ? 'legacy' : 'empty'
}

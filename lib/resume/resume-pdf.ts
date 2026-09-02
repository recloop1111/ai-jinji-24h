import { readFileSync } from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import {
  genderLabel, graduationStatusLabel,
  formatBirthDate, formatPostalCode, formatYearMonth, joinResumeAddress, resolveDisplayAge, resumeSectionMode,
  type ResumeEducationView, type ResumeWorkView, type ResumeLicenseView, type ResumeChildStatus,
} from './resume-view'

// デジタル履歴書 v1 — 応募者履歴書 PDF ビルダー（A4 縦・日本語・白背景/黒文字）。
//   ※ invoice-pdf.ts の安全パターンを流用: font:'' で .afm を読まず IPAexGothic を埋め込み、
//     stream→Buffer で Promise<Buffer> を返す。フロー API 中心で長文は自動改ページ。
//   ※ 取得元は applicants + jobs(title) + 子3テーブルのみ。面接評価・選考・課金・内部フラグ・写真は扱わない。
const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'IPAexGothic.ttf')

// PDF に載せる応募者情報（許可された列のみ・内部管理/AI/写真は含めない）。
export interface ResumePdfApplicant {
  last_name: string | null
  first_name: string | null
  last_name_kana: string | null
  first_name_kana: string | null
  birth_date: string | null
  age: number | null // legacy fallback のみ（SoT にしない）
  gender: string | null
  postal_code: string | null
  prefecture: string | null
  city: string | null
  town: string | null
  address_line: string | null
  building: string | null
  phone_number: string | null
  email: string | null
  job_title: string | null // jobs.title（応募職種）
  education: string | null // legacy TEXT fallback
  work_history: string | null // legacy TEXT fallback
  qualifications: string | null // legacy TEXT fallback
  motivation: string | null
  self_pr: string | null
  personal_requests: string | null
}

export interface ResumePdfInput {
  applicant: ResumePdfApplicant
  educations: ResumeEducationView[]
  workExperiences: ResumeWorkView[]
  licenses: ResumeLicenseView[]
  childStatus: ResumeChildStatus // 子3テーブル取得状態（error≠empty を区別）
  generatedAt?: Date // 「YYYY年M月D日現在」（既定 = 生成時刻）
}

const t = (v: string | null | undefined) => (v == null ? '' : String(v).trim())

export function buildResumePdf(input: ResumePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50, font: '' })
      doc.registerFont('jp', readFileSync(FONT_PATH))
      doc.font('jp')

      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const contentWidth = right - left
      const LINE = 16
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom

      // 残り高さが足りなければ改ページ（セクションタイトルや行の孤立を防ぐ）。
      const ensureSpace = (needed: number) => {
        if (doc.y + needed > bottomLimit()) doc.addPage()
      }

      const sectionTitle = (title: string) => {
        ensureSpace(46)
        doc.moveDown(0.5)
        doc.fillColor('#000').fontSize(12).text(title, left, doc.y)
        const ly = doc.y + 2
        doc.moveTo(left, ly).lineTo(right, ly).lineWidth(1).strokeColor('#333').stroke()
        doc.y = ly + 6
        doc.fontSize(10).fillColor('#000')
      }

      const LABEL_W = 100
      const kvRow = (label: string, value: string) => {
        const v = value.trim() ? value : '未入力'
        const valX = left + LABEL_W
        const valW = right - valX
        doc.fontSize(10)
        const h = Math.max(doc.heightOfString(v, { width: valW }), LINE)
        ensureSpace(h + 8)
        const y = doc.y
        doc.fontSize(9).fillColor('#555').text(label, left, y + 1, { width: LABEL_W - 8 })
        doc.fontSize(10).fillColor(value.trim() ? '#000' : '#888').text(v, valX, y, { width: valW })
        const rowBottom = Math.max(y + h, doc.y)
        doc.moveTo(left, rowBottom + 3).lineTo(right, rowBottom + 3).lineWidth(0.5).strokeColor('#dddddd').stroke()
        doc.y = rowBottom + 8
        doc.fillColor('#000')
      }

      const DATE_W = 92
      // 年月（左）＋ 内容（右・折返し）。年月と内容を同一ブロックで扱い、孤立を防ぐ。
      const entryRow = (dateStr: string, content: string) => {
        const contentX = left + DATE_W
        const contentW = right - contentX
        const c = content || ''
        doc.fontSize(10)
        const h = Math.max(doc.heightOfString(c || ' ', { width: contentW }), LINE)
        ensureSpace(h + 4)
        const y = doc.y
        if (dateStr) doc.fillColor('#000').text(dateStr, left, y, { width: DATE_W })
        doc.fillColor('#000').text(c, contentX, y, { width: contentW })
        doc.y = Math.max(y + h, doc.y)
        doc.moveDown(0.2)
      }

      const paragraph = (text: string | null | undefined) => {
        const v = t(text) ? String(text) : '未入力'
        doc.fontSize(10)
        ensureSpace(LINE + 8) // 開始位置のみ確保。長文は pdfkit が自動改ページ
        doc.fillColor(t(text) ? '#000' : '#888').text(v, left, doc.y, { width: contentWidth })
        doc.fillColor('#000').moveDown(0.5)
      }

      const errorNote = () => entryRow('', '（履歴書情報を取得できませんでした）')

      // ── ヘッダー ─────────────────────────────────────────────
      const g = input.generatedAt ?? new Date()
      const genLabel = `${g.getFullYear()}年${g.getMonth() + 1}月${g.getDate()}日現在`
      doc.fontSize(10).fillColor('#000').text(genLabel, left, doc.y, { width: contentWidth, align: 'right' })
      doc.moveDown(0.2)
      doc.fontSize(20).text('履 歴 書', { align: 'center' })
      doc.moveDown(0.8)
      doc.fontSize(10)

      const a = input.applicant
      const name = `${t(a.last_name)} ${t(a.first_name)}`.trim()
      const kana = `${t(a.last_name_kana)} ${t(a.first_name_kana)}`.trim()
      const birthJp = formatBirthDate(a.birth_date)
      const age = resolveDisplayAge(a.birth_date, a.age, g)
      const birthLine = birthJp
        ? `${birthJp}${age != null ? `（${age}歳）` : ''}`
        : age != null ? `${age}歳` : ''
      const address = joinResumeAddress({
        prefecture: a.prefecture, city: a.city, town: a.town, address_line: a.address_line, building: a.building,
      })

      // ── 基本情報 ─────────────────────────────────────────────
      sectionTitle('基本情報')
      kvRow('フリガナ', kana)
      kvRow('氏名', name)
      kvRow('生年月日', birthLine)
      kvRow('性別', genderLabel(a.gender))
      kvRow('郵便番号', formatPostalCode(a.postal_code))
      kvRow('住所', address)
      kvRow('電話番号', t(a.phone_number))
      kvRow('メールアドレス', t(a.email))

      // ── 応募情報（応募職種のみ） ───────────────────────────────
      sectionTitle('応募情報')
      kvRow('応募職種', t(a.job_title))

      const hasLegacyEdu = !!t(a.education)
      const hasLegacyWork = !!t(a.work_history)
      const hasLegacyLic = !!t(a.qualifications)
      const eduMode = resumeSectionMode(input.childStatus, input.educations.length, hasLegacyEdu)
      const workMode = resumeSectionMode(input.childStatus, input.workExperiences.length, hasLegacyWork)
      const licMode = resumeSectionMode(input.childStatus, input.licenses.length, hasLegacyLic)

      // ── 学歴 ─────────────────────────────────────────────────
      sectionTitle('学歴')
      if (eduMode === 'error') errorNote()
      else if (eduMode === 'empty') entryRow('', '未入力')
      else if (eduMode === 'legacy') entryRow('', String(a.education))
      else {
        for (const e of input.educations) {
          const base = [t(e.school_name), t(e.faculty_department)].filter((x) => x).join('　')
          const enteredJp = formatYearMonth(e.entered_year_month)
          const gradJp = formatYearMonth(e.graduated_year_month)
          const status = graduationStatusLabel(e.graduation_status)
          if (enteredJp) entryRow(enteredJp, `${base} 入学`.trim())
          if (gradJp) entryRow(gradJp, `${base} ${status || '卒業'}`.trim())
          if (!enteredJp && !gradJp) entryRow('', base || '未入力')
          else if (!gradJp && status && enteredJp) entryRow('', `${base} ${status}`.trim()) // 在学中等（卒業年月なし）
        }
      }

      // ── 職歴 ─────────────────────────────────────────────────
      sectionTitle('職歴')
      if (workMode === 'error') errorNote()
      else if (workMode === 'empty') entryRow('', '職歴なし')
      else if (workMode === 'legacy') entryRow('', String(a.work_history))
      else {
        for (const w of input.workExperiences) {
          const company = t(w.company_name)
          const joinedJp = formatYearMonth(w.joined_year_month)
          if (joinedJp) entryRow(joinedJp, `${company} 入社`.trim())
          else entryRow('', company || '未入力')
          const sub = [t(w.employment_type), t(w.department), t(w.position)].filter((x) => x).join('　')
          if (sub) entryRow('', sub)
          if (t(w.description)) entryRow('', String(w.description))
          if (w.is_current) entryRow('', '現在に至る')
          else {
            const leftJp = formatYearMonth(w.left_year_month)
            if (leftJp) entryRow(leftJp, '退職')
          }
        }
        // 「以上」を右下に自然配置
        ensureSpace(LINE + 4)
        doc.fontSize(10).fillColor('#000').text('以上', left, doc.y, { width: contentWidth, align: 'right' })
        doc.moveDown(0.3)
      }

      // ── 免許・資格 ───────────────────────────────────────────
      sectionTitle('免許・資格')
      if (licMode === 'error') errorNote()
      else if (licMode === 'empty') entryRow('', '未入力')
      else if (licMode === 'legacy') entryRow('', String(a.qualifications))
      else {
        for (const l of input.licenses) {
          entryRow(formatYearMonth(l.acquired_year_month), t(l.name) || '未入力')
        }
      }

      // ── 自由記述 ─────────────────────────────────────────────
      sectionTitle('志望動機')
      paragraph(a.motivation)
      sectionTitle('自己PR')
      paragraph(a.self_pr)
      sectionTitle('本人希望欄')
      paragraph(a.personal_requests)

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

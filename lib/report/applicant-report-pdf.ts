import { readFileSync } from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import {
  genderLabel, graduationStatusLabel, legacyEducationLabel,
  formatBirthDate, formatPostalCode, formatYearMonth, joinResumeAddress, resolveDisplayAge, resumeSectionMode,
  type ResumeEducationView, type ResumeWorkView, type ResumeLicenseView, type ResumeChildStatus,
} from '@/lib/resume/resume-view'
import {
  resolveEvaluationDisplayState, sortAxesForDisplay, confidenceText, CONFIDENCE_DISPLAY_LABEL,
  type DisplayAxis,
} from '@/lib/evaluation/evaluation-view'
import type { ResumePdfApplicant } from '@/lib/resume/resume-pdf'
import type { ReportPdfEvaluation } from '@/lib/report/report-pdf'

// 応募者総合レポート PDF ビルダー（A4 縦・日本語・白背景/黒文字）。
//   ※ 1つの PDFDocument に「① 応募者・履歴書情報」→ 明示改ページ →「② AI面接評価」を描画（PDF binary 結合はしない）。
//   ※ 既存 resume-pdf.ts / report-pdf.ts は変更せず、実証済みの描画パターンと pure helper（resume-view / evaluation-view）を再利用。
//   ※ SoT: 履歴書=applicants+子3（resumeSectionMode で structured/legacy/empty/error）／評価=interview_results+evaluation-view。
//   ※ 面接評価専用の別スキーマ・選考情報・会話ログ・録画・課金・内部フラグは扱わない。null score を 0 にしない。
const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'IPAexGothic.ttf')

// 入力型は既存の型を再利用（ResumePdfApplicant / ReportPdfEvaluation / View 型）。
export interface ApplicantReportPdfInput {
  applicant: ResumePdfApplicant
  educations: ResumeEducationView[]
  workExperiences: ResumeWorkView[]
  licenses: ResumeLicenseView[]
  childStatus: ResumeChildStatus
  interviewDate: string | null
  statusLabel: string
  evaluation: ReportPdfEvaluation
  generatedAt?: Date
}

const t = (v: string | null | undefined) => (v == null ? '' : String(v).trim())

// 現在位置に needed の高さが収まらなければ改ページが必要（pure・adaptive page boundary の判定）。
export function willOverflow(currentY: number, needed: number, pageBottom: number): boolean {
  return currentY + needed > pageBottom
}
// AI評価を同一ページで開始するのに必要な最小高さ（見出し＋面接情報＋総合評価の主要部）。
//   これ未満なら履歴書ページに見出しだけ残さず、改ページして AI評価を新ページ先頭から始める。
export const AI_SECTION_MIN_HEIGHT = 190

export function buildApplicantReportPdf(input: ApplicantReportPdfInput): Promise<Buffer> {
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
      const ensureSpace = (needed: number) => { if (doc.y + needed > bottomLimit()) doc.addPage() }

      const sectionTitle = (title: string) => {
        ensureSpace(44)
        doc.moveDown(0.4)
        doc.fillColor('#000').fontSize(12).text(title, left, doc.y)
        const ly = doc.y + 2
        doc.moveTo(left, ly).lineTo(right, ly).lineWidth(1).strokeColor('#333').stroke()
        doc.y = ly + 5
        doc.fontSize(10).fillColor('#000')
      }

      const LABEL_W = 110
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
        doc.y = rowBottom + 6
        doc.fillColor('#000')
      }

      const DATE_W = 92
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
        ensureSpace(LINE + 8)
        doc.fillColor(t(text) ? '#000' : '#888').text(v, left, doc.y, { width: contentWidth })
        doc.fillColor('#000').moveDown(0.5)
      }

      const labeledText = (label: string, text: string | null | undefined) => {
        if (!t(text)) return
        ensureSpace(LINE + 8)
        doc.fontSize(9).fillColor('#555').text(label, left, doc.y)
        doc.fontSize(10).fillColor('#000').text(String(text), left, doc.y, { width: contentWidth })
        doc.moveDown(0.4)
      }

      const bulletList = (items: string[]) => {
        for (const item of items) {
          const s = t(item)
          if (!s) continue
          const bx = left + 12
          const bw = right - bx
          doc.fontSize(10)
          const h = Math.max(doc.heightOfString(s, { width: bw }), LINE)
          ensureSpace(h + 2)
          const y = doc.y
          doc.fillColor('#000').text('・', left, y, { width: 12 })
          doc.text(s, bx, y, { width: bw })
          doc.y = Math.max(y + h, doc.y)
        }
      }

      const errorNote = () => entryRow('', '（履歴書情報を取得できませんでした）')

      const g = input.generatedAt ?? new Date()

      // ══════════════════ ① 応募者・履歴書情報（1ページ目〜） ══════════════════
      doc.fontSize(10).fillColor('#000').text(`出力日：${g.getFullYear()}年${g.getMonth() + 1}月${g.getDate()}日`, left, doc.y, { width: contentWidth, align: 'right' })
      doc.moveDown(0.2)
      doc.fontSize(18).text('応募者総合レポート', { align: 'center' })
      doc.moveDown(0.8)
      doc.fontSize(10)

      const a = input.applicant
      const name = `${t(a.last_name)} ${t(a.first_name)}`.trim()
      const kana = `${t(a.last_name_kana)} ${t(a.first_name_kana)}`.trim()
      const birthJp = formatBirthDate(a.birth_date)
      const age = resolveDisplayAge(a.birth_date, a.age, g)
      const birthLine = birthJp ? `${birthJp}${age != null ? `（${age}歳）` : ''}` : age != null ? `${age}歳` : ''
      const address = joinResumeAddress({ prefecture: a.prefecture, city: a.city, town: a.town, address_line: a.address_line, building: a.building })

      sectionTitle('基本情報')
      kvRow('フリガナ', kana)
      kvRow('氏名', name)
      kvRow('生年月日', birthLine)
      kvRow('性別', genderLabel(a.gender))
      kvRow('郵便番号', formatPostalCode(a.postal_code))
      kvRow('住所', address)
      kvRow('電話番号', t(a.phone_number))
      kvRow('メールアドレス', t(a.email))

      sectionTitle('応募情報')
      kvRow('応募職種', t(a.job_title))

      const eduMode = resumeSectionMode(input.childStatus, input.educations.length, !!t(a.education))
      const workMode = resumeSectionMode(input.childStatus, input.workExperiences.length, !!t(a.work_history))
      const licMode = resumeSectionMode(input.childStatus, input.licenses.length, !!t(a.qualifications))

      sectionTitle('学歴')
      if (eduMode === 'error') errorNote()
      else if (eduMode === 'empty') entryRow('', '未入力')
      else if (eduMode === 'legacy') entryRow('', legacyEducationLabel(a.education)) // 内部コード(graduate等)を日本語へ
      else {
        for (const e of input.educations) {
          const base = [t(e.school_name), t(e.faculty_department)].filter((x) => x).join('　')
          const enteredJp = formatYearMonth(e.entered_year_month)
          const gradJp = formatYearMonth(e.graduated_year_month)
          const status = graduationStatusLabel(e.graduation_status)
          if (enteredJp) entryRow(enteredJp, `${base} 入学`.trim())
          if (gradJp) entryRow(gradJp, `${base} ${status || '卒業'}`.trim())
          if (!enteredJp && !gradJp) entryRow('', base || '未入力')
          else if (!gradJp && status && enteredJp) entryRow('', `${base} ${status}`.trim())
        }
      }

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
        ensureSpace(LINE + 4)
        doc.fontSize(10).fillColor('#000').text('以上', left, doc.y, { width: contentWidth, align: 'right' })
        doc.moveDown(0.3)
      }

      sectionTitle('免許・資格')
      if (licMode === 'error') errorNote()
      else if (licMode === 'empty') entryRow('', '未入力')
      else if (licMode === 'legacy') entryRow('', String(a.qualifications))
      else {
        for (const l of input.licenses) entryRow(formatYearMonth(l.acquired_year_month), t(l.name) || '未入力')
      }

      // 自由記述（学歴・職歴・資格のあと・順序は履歴書PDFと同一）。長文は自然に次ページへ flow。
      sectionTitle('志望動機')
      paragraph(a.motivation)
      sectionTitle('自己PR')
      paragraph(a.self_pr)
      sectionTitle('本人希望欄')
      paragraph(a.personal_requests)

      // ══════════════════ ② AI面接評価（adaptive page boundary） ══════════════════
      //   履歴書終端で残り高さを確認。AI評価の開始ブロック（見出し＋面接情報＋総合評価主要部）が
      //   入る十分な余白があれば同一ページで開始（1ページ目の余白を活用）。
      //   足りなければ改ページ（見出しだけ前ページ末尾に孤立させない）。
      if (willOverflow(doc.y, AI_SECTION_MIN_HEIGHT, bottomLimit())) {
        doc.addPage()
        // 新ページ時のみ小さな page header（大タイトルは再掲しない）。
        doc.fontSize(8).fillColor('#999').text('応募者総合レポート', left, doc.y, { width: contentWidth, align: 'right' })
        doc.moveDown(0.2)
      } else {
        // 同一ページ継続時は履歴書とAI評価の間に区切りの余白。
        doc.moveDown(1.2)
      }
      doc.fillColor('#000').fontSize(15).text('AI面接評価', left, doc.y)
      const hy = doc.y + 3
      doc.moveTo(left, hy).lineTo(right, hy).lineWidth(1.2).strokeColor('#333').stroke()
      doc.y = hy + 8
      doc.fontSize(10).fillColor('#000')

      const ev = input.evaluation

      // 面接情報（氏名・応募職種は1ページ目に既出のため再掲しない）
      kvRow('面接日時', t(input.interviewDate))
      kvRow('面接ステータス', t(input.statusLabel))

      sectionTitle('総合評価')
      if (ev.total_score != null) kvRow('総合スコア', `${ev.total_score} / 100`)
      if (t(ev.recommendation_rank)) kvRow('評価ランク', String(ev.recommendation_rank))
      const summaryMain = t(ev.profile_persona) || t(ev.summary_text)
      if (summaryMain) labeledText('総評', summaryMain)
      if (t(ev.feedback_text) && t(ev.feedback_text) !== summaryMain) labeledText('フィードバック', ev.feedback_text)

      const hasProfile = !!(t(ev.profile_career) || t(ev.profile_interviewer_notes) || t(ev.personality_type) || t(ev.personality_description))
      if (hasProfile) {
        sectionTitle('人物・評価サマリー')
        labeledText('経歴・キャリア', ev.profile_career)
        labeledText('面接官所見', ev.profile_interviewer_notes)
        const persona = [t(ev.personality_type), t(ev.personality_description)].filter((x) => x).join(' — ')
        if (persona) labeledText('性格タイプ', persona)
      }

      // 評価軸: 総合レポートでは軸の強制分割は行わず、6軸を連続描画（ensureSpace＋PDFKit flow で自然改ページ）。
      const hasLegacyEvaluation = !!(t(ev.personality_type) || t(ev.personality_description))
      const state = resolveEvaluationDisplayState({ evaluationAxes: ev.evaluation_axes, hasLegacyEvaluation })
      const axes = sortAxesForDisplay(state.axes)
      const renderAxis = (ax: DisplayAxis) => {
        const scoreStr = ax.score == null ? '判断材料不足' : `${ax.score} / 20`
        const parts = [scoreStr]
        if (t(ax.rank)) parts.push(`評価: ${ax.rank}`)
        const conf = confidenceText(ax.confidence)
        if (conf) parts.push(`${CONFIDENCE_DISPLAY_LABEL}: ${conf}`)
        kvRow(ax.label, parts.join('　'))
        if (ax.score == null && t(ax.insufficientReason)) labeledText('判断材料不足の理由', ax.insufficientReason)
        if (ax.evidence.length > 0) {
          for (const e of ax.evidence) {
            const q = e.seq != null ? `（発話#${e.seq}）${e.quote}` : e.quote
            bulletList([q])
          }
        }
        doc.moveDown(0.3)
      }
      if (axes.length > 0) {
        sectionTitle('評価軸スコア')
        for (const ax of axes) renderAxis(ax)
      }

      const strengths = Array.isArray(ev.strengths) ? ev.strengths.filter((s) => t(s)) : []
      if (strengths.length > 0) {
        sectionTitle('強み')
        bulletList(strengths)
      }

      const improvements = Array.isArray(ev.improvement_points) ? ev.improvement_points.filter((s) => t(s)) : []
      if (improvements.length > 0) {
        sectionTitle('改善ポイント')
        bulletList(improvements)
      }

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

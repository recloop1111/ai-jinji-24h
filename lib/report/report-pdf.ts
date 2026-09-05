import { readFileSync } from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import {
  resolveEvaluationDisplayState, sortAxesForDisplay, confidenceText, CONFIDENCE_DISPLAY_LABEL,
  type DisplayAxis,
} from '@/lib/evaluation/evaluation-view'

// AI面接結果レポート PDF ビルダー（A4 縦・日本語・白背景/黒文字）。
//   ※ SoT = interview_results ＋ lib/evaluation/evaluation-view.ts（詳細評価タブと同じ評価解釈）。
//     面接レポート専用の別スキーマは使わない。人間の選考情報（採用判断/内部メモ）・会話ログ・録画・履歴書は含めない。
//   ※ invoice/resume PDF と同じ安全パターン（font:'' + IPAexGothic 埋め込み + stream→Buffer）。
//   ※ 評価ロジックは PDF 独自に作らず evaluation-view を再利用。null score を 0 として表示しない。
const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'IPAexGothic.ttf')

// interview_results 由来の評価（route が detail_json を展開して渡す。許可された表示値のみ）。
export interface ReportPdfEvaluation {
  total_score: number | null
  recommendation_rank: string | null
  summary_text: string | null
  feedback_text: string | null
  personality_type: string | null
  personality_description: string | null
  profile_persona: string | null
  profile_career: string | null
  profile_interviewer_notes: string | null
  strengths: string[] | null
  improvement_points: string[] | null
  evaluation_axes: unknown // raw（evaluation-view で正規化）
}

export interface ReportPdfInput {
  applicantName: string
  jobTitle: string | null
  interviewDate: string | null // 表示用（route が整形）
  statusLabel: string // 面接ステータス（deriveCurrentStatus 由来）
  evaluation: ReportPdfEvaluation
  generatedAt?: Date
}

const t = (v: string | null | undefined) => (v == null ? '' : String(v).trim())

// 評価軸を「意図的な2ページ構成」用に前半/後半へ分割する（pure・軸数非依存）。
//   - 4軸以上のときだけ 2ページへ分割（前半 = ceil(n/2)）。3軸以下は分割せず全て前半（強制改ページしない）。
//   - array index を hard-code せず ceil(n/2) で算出＝将来の軸数変更でも壊れない。並び順は呼び出し側 sortAxesForDisplay を維持。
export function splitEvaluationAxesForPdf<T>(axes: readonly T[]): { first: T[]; second: T[] } {
  if (axes.length < 4) return { first: [...axes], second: [] }
  const half = Math.ceil(axes.length / 2)
  return { first: axes.slice(0, half), second: axes.slice(half) }
}

export function buildReportPdf(input: ReportPdfInput): Promise<Buffer> {
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

      // 意図的な改ページ後（2ページ目以降）の小さなヘッダー。大タイトルは再掲しない。
      const pageHeader = () => {
        doc.fontSize(8).fillColor('#999').text('AI面接結果レポート', left, doc.y, { width: contentWidth, align: 'right' })
        doc.fillColor('#000').fontSize(10)
        doc.moveDown(0.4)
      }

      const sectionTitle = (title: string) => {
        ensureSpace(48)
        doc.moveDown(0.8)
        doc.fillColor('#000').fontSize(12).text(title, left, doc.y)
        const ly = doc.y + 3
        doc.moveTo(left, ly).lineTo(right, ly).lineWidth(1).strokeColor('#333').stroke()
        doc.y = ly + 8
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
        doc.moveTo(left, rowBottom + 4).lineTo(right, rowBottom + 4).lineWidth(0.5).strokeColor('#dddddd').stroke()
        doc.y = rowBottom + 11
        doc.fillColor('#000')
      }

      // 小見出し＋本文（本文が空なら描画しない＝巨大な空欄を作らない）
      const labeledText = (label: string, text: string | null | undefined) => {
        if (!t(text)) return
        ensureSpace(LINE + 8)
        doc.fontSize(9).fillColor('#555').text(label, left, doc.y)
        doc.fontSize(10).fillColor('#000').text(String(text), left, doc.y, { width: contentWidth })
        doc.moveDown(0.7)
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

      // ── ヘッダー ──
      const g = input.generatedAt ?? new Date()
      doc.fontSize(10).fillColor('#000').text(`出力日：${g.getFullYear()}年${g.getMonth() + 1}月${g.getDate()}日`, left, doc.y, { width: contentWidth, align: 'right' })
      doc.moveDown(0.2)
      doc.fontSize(18).text('AI面接結果レポート', { align: 'center' })
      doc.moveDown(0.8)
      doc.fontSize(10)

      const ev = input.evaluation

      // ── 基本情報（最小限） ──
      sectionTitle('基本情報')
      kvRow('応募者氏名', t(input.applicantName))
      kvRow('応募職種', t(input.jobTitle))
      kvRow('面接日時', t(input.interviewDate))
      kvRow('面接ステータス', t(input.statusLabel))

      // ── 総合評価 ──
      sectionTitle('総合評価')
      if (ev.total_score != null) kvRow('総合スコア', `${ev.total_score} / 100`)
      if (t(ev.recommendation_rank)) kvRow('評価ランク', String(ev.recommendation_rank))
      // 総評（人物概要の persona → 無ければ summary_text）。詳細評価タブの優先順位に合わせる。
      const summaryMain = t(ev.profile_persona) || t(ev.summary_text)
      if (summaryMain) labeledText('総評', summaryMain)
      if (t(ev.feedback_text) && t(ev.feedback_text) !== summaryMain) labeledText('フィードバック', ev.feedback_text)

      // ── 人物・評価サマリー（存在するものだけ） ──
      const hasProfile = !!(t(ev.profile_career) || t(ev.profile_interviewer_notes) || t(ev.personality_type) || t(ev.personality_description))
      if (hasProfile) {
        sectionTitle('人物・評価サマリー')
        labeledText('経歴・キャリア', ev.profile_career)
        labeledText('面接官所見', ev.profile_interviewer_notes)
        const persona = [t(ev.personality_type), t(ev.personality_description)].filter((x) => x).join(' — ')
        if (persona) labeledText('性格タイプ', persona)
      }

      // ── 評価軸スコア（EBCA・evaluation-view を再利用。null score を 0 にしない） ──
      //   標準（4軸以上）は「意図した2ページ構成」: 前半をページ1、明示改ページ後に後半＋強み＋改善をページ2へ。
      //   3軸以下は分割せず flow（無理な改ページを作らない）。長文で軸自体が溢れる場合は PDFKit の自然な flow を優先。
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
        doc.moveDown(0.5)
      }
      if (axes.length > 0) {
        const { first, second } = splitEvaluationAxesForPdf(axes)
        sectionTitle('評価軸スコア')
        for (const ax of first) renderAxis(ax)
        if (second.length > 0) {
          // 明示的な改ページ＝ページ2を「意図した続き」として開始（見出しで何の続きか分かる）。
          doc.addPage()
          pageHeader()
          sectionTitle('評価軸スコア（続き）')
          for (const ax of second) renderAxis(ax)
        }
      }

      // ── 強み（配列・空なら描画しない） ──
      const strengths = Array.isArray(ev.strengths) ? ev.strengths.filter((s) => t(s)) : []
      if (strengths.length > 0) {
        sectionTitle('強み')
        bulletList(strengths)
      }

      // ── 改善ポイント（DB の improvement_points を忠実に。意味変換しない） ──
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

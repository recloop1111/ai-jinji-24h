import { readFileSync } from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
// taxRate / numberPrefix はロジック定数のため config のまま。発行者/振込先/payment_note は
// billing_issuer_settings(DB)→config の resolver 経由で受け取る（issuer-settings.ts）。
import { BILLING_TERMS } from '@/lib/config/billing'
import {
  resolveIssuer,
  resolveBank,
  resolvePaymentNote,
  type InvoiceIssuer,
  type InvoiceBank,
  type BillingIssuerSettingsDbRow,
} from '@/lib/billing/issuer-settings'
// 宛名（bill-to）の型・解決は pdfkit 非依存の純モジュールへ分離（writer と共有）。
import { resolveBillTo, type InvoiceBillTo, type BillToProfileRow } from '@/lib/billing/bill-to'
import { jstDueDate } from '@/lib/billing/dueDate'

// 請求書PDFのビルダー（client/admin の invoice API が共有する純関数）。
// 金額は billing_records の確定値（subtotal/tax/total）をそのまま使用し再計算しない。
// pdfkit の標準フォント(.afm)を一切読まないよう font:'' で生成し、日本語TTFを埋め込む
// （serverless での .afm 同梱漏れ回避）。フォントは outputFileTracingIncludes で各ルートに同梱必須。

export type InvoiceInput = {
  invoiceNumber: string // INV-YYYYMM-<id8>
  issueDate: string // 請求日（JST YYYY/MM/DD）
  dueDate: string | null // 支払期限（JST YYYY-MM-DD）
  billingMonth: string // 請求対象月（YYYY年MM月）
  billTo: InvoiceBillTo
  issuer: InvoiceIssuer // 発行者（snapshot→DB→config で解決済み）
  bank: InvoiceBank // 振込先（同上）
  paymentNote: string // 支払案内文/備考（同上）
  interviewCount: number
  unitPrice: number // 表示用（amount_jpy / interview_count）
  subtotal: number // amount_jpy（税抜・確定値）
  tax: number // tax_jpy（確定値）
  total: number // total_jpy（確定値）
}

// billing_records.invoice_snapshot（確定時に凍結する請求先・発行者・振込先・支払案内文）。
// snapshot の各部があれば最優先で使用する（確定済み請求書の不変性）。
// ※ snapshot を書き込む writer（monthly-billing）は別フェーズ。現状は通常 null。
export type InvoiceSnapshot = {
  bill_to?: Partial<InvoiceBillTo> | null
  issuer?: Partial<InvoiceIssuer> | null
  bank?: Partial<InvoiceBank> | null
  payment_note?: string | null
} | null

const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'IPAexGothic.ttf')

function yen(n: number): string {
  return `¥${(n ?? 0).toLocaleString('ja-JP')}`
}

// client/admin の invoice API が共有する、billing_records 行 + companies から InvoiceInput を組み立てる。
// 金額は確定値（amount/tax/total_jpy）をそのまま使用。invoiceNumber は INV-YYYYMM-<id8>。
export type BillingRecordRow = {
  id: string
  billing_month: string | null
  interview_count: number | null
  amount_jpy: number | null
  tax_jpy: number | null
  total_jpy: number | null
  created_at: string | null
}

function jstDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const jst = new Date(t + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')}`
}

export function toInvoiceInput(
  record: BillingRecordRow,
  company: { name: string | null; contact_person: string | null },
  profile: BillToProfileRow = null,
  snapshot: InvoiceSnapshot = null,
  issuerSettings: BillingIssuerSettingsDbRow = null,
): InvoiceInput {
  const ym = record.billing_month ? String(record.billing_month).slice(0, 7) : '' // YYYY-MM
  const [y, m] = ym.split('-')
  const billingMonthLabel = y && m ? `${y}年${m}月` : ym
  const invoiceNumber = `${BILLING_TERMS.numberPrefix}-${ym.replace('-', '')}-${record.id.slice(0, 8)}`
  const count = record.interview_count ?? 0
  const subtotal = record.amount_jpy ?? 0
  const unitPrice = count > 0 ? Math.round(subtotal / count) : 0
  return {
    invoiceNumber,
    issueDate: jstDate(record.created_at),
    dueDate: jstDueDate(record.created_at),
    billingMonth: billingMonthLabel,
    billTo: resolveBillTo(company, profile, snapshot?.bill_to),
    // 発行者/振込先/支払案内文: snapshot（凍結）→ billing_issuer_settings(DB) → config fallback。
    issuer: resolveIssuer(issuerSettings, snapshot?.issuer),
    bank: resolveBank(issuerSettings, snapshot?.bank),
    paymentNote: resolvePaymentNote(issuerSettings, snapshot?.payment_note),
    interviewCount: count,
    unitPrice,
    subtotal,
    tax: record.tax_jpy ?? 0,
    total: record.total_jpy ?? 0,
  }
}

export function buildInvoicePdf(input: InvoiceInput): Promise<Buffer> {
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

      // タイトル
      doc.fontSize(22).text('請求書', { align: 'center' })
      doc.moveDown(1)

      // 請求書番号・請求日・支払期限（右寄せ）
      doc.fontSize(10)
      doc.text(`請求書番号: ${input.invoiceNumber}`, { align: 'right' })
      doc.text(`請求日: ${input.issueDate}`, { align: 'right' })
      doc.text(`支払期限: ${input.dueDate ?? '—'}`, { align: 'right' })
      doc.moveDown(1)

      // 請求先（左ブロック）。宛名は resolveBillTo（snapshot→profile→companies）の確定値。
      // 右の発行者ブロックと重ならないよう幅を contentWidth/2 に制限。
      const billToY = doc.y
      const billToW = contentWidth / 2
      const bt = input.billTo
      doc.fontSize(12).text(`${bt.companyName}　御中`, left, billToY, { width: billToW })
      doc.fontSize(10)
      if (bt.department) doc.text(bt.department, left, doc.y, { width: billToW })
      if (bt.contactName) doc.text(`${bt.contactName} 様`, left, doc.y, { width: billToW })
      if (bt.postalCode) doc.text(`〒${bt.postalCode}`, left, doc.y, { width: billToW })
      if (bt.address) {
        doc.text(`${bt.address}${bt.building ? ' ' + bt.building : ''}`, left, doc.y, { width: billToW })
      }
      if (bt.phone) doc.text(`TEL: ${bt.phone}`, left, doc.y, { width: billToW })
      const billToBottom = doc.y

      // 発行者（右ブロック）。billing_issuer_settings(DB)→config で解決済みの input.issuer。
      const issuer = input.issuer
      const issuerTop = billToY
      const issuerX = left + contentWidth / 2
      const issuerW = contentWidth / 2
      doc.fontSize(10)
      doc.text(issuer.name, issuerX, issuerTop, { width: issuerW, align: 'right' })
      doc.text(`〒${issuer.postalCode}`, issuerX, doc.y, { width: issuerW, align: 'right' })
      doc.text(
        `${issuer.address}${issuer.building ? ' ' + issuer.building : ''}`,
        issuerX,
        doc.y,
        { width: issuerW, align: 'right' },
      )
      doc.text(`TEL: ${issuer.tel}`, issuerX, doc.y, { width: issuerW, align: 'right' })
      // 登録番号は設定されている場合のみ表示（インボイス未登録時に「未登録」等を出さない）。
      if (issuer.registrationNumber) {
        doc.text(`登録番号: ${issuer.registrationNumber}`, issuerX, doc.y, {
          width: issuerW,
          align: 'right',
        })
      }

      // 請求先・発行者のうち下端が低い方へ移動してから次セクションへ（重なり防止）。
      doc.y = Math.max(billToBottom, doc.y)
      doc.moveDown(2)

      // 件名（請求対象月）
      doc.fontSize(11).fillColor('#000').text(`件名: ${input.billingMonth} 分 AI面接利用料`, left, doc.y)
      doc.moveDown(0.5)

      // 合計（大きく）
      doc.fontSize(14).text(`ご請求金額（税込）: ${yen(input.total)}`, { align: 'left' })
      doc.moveDown(1)

      // 明細テーブル（簡易）
      const tableTop = doc.y
      const colItem = left
      const colQty = left + contentWidth * 0.5
      const colUnit = left + contentWidth * 0.65
      const colAmount = left + contentWidth * 0.82
      doc.fontSize(10)
      doc.text('内容', colItem, tableTop)
      doc.text('数量', colQty, tableTop, { width: contentWidth * 0.13, align: 'right' })
      doc.text('単価', colUnit, tableTop, { width: contentWidth * 0.15, align: 'right' })
      doc.text('金額(税抜)', colAmount, tableTop, { width: contentWidth * 0.18, align: 'right' })
      doc
        .moveTo(left, doc.y + 2)
        .lineTo(right, doc.y + 2)
        .stroke()
      doc.moveDown(0.5)

      const rowY = doc.y
      doc.text(`${input.billingMonth} AI面接`, colItem, rowY, { width: contentWidth * 0.5 })
      doc.text(`${input.interviewCount}`, colQty, rowY, { width: contentWidth * 0.13, align: 'right' })
      doc.text(`${yen(input.unitPrice)}`, colUnit, rowY, { width: contentWidth * 0.15, align: 'right' })
      doc.text(`${yen(input.subtotal)}`, colAmount, rowY, { width: contentWidth * 0.18, align: 'right' })
      doc.moveDown(1)

      // 小計・消費税・合計（右寄せ）
      const sumX = left + contentWidth * 0.55
      const sumW = contentWidth * 0.45
      doc.text(`小計（税抜）: ${yen(input.subtotal)}`, sumX, doc.y, { width: sumW, align: 'right' })
      doc.text(
        `消費税（${Math.round(BILLING_TERMS.taxRate * 100)}%）: ${yen(input.tax)}`,
        sumX,
        doc.y,
        { width: sumW, align: 'right' },
      )
      doc.fontSize(12).text(`合計（税込）: ${yen(input.total)}`, sumX, doc.y, { width: sumW, align: 'right' })
      doc.moveDown(2)

      // 振込先（billing_issuer_settings(DB)→config で解決済みの input.bank）
      const bank = input.bank
      doc.fontSize(11).text('お振込先', left, doc.y)
      doc.fontSize(10)
      doc.text(`${bank.bankName} ${bank.branchName}`)
      doc.text(`${bank.accountType} ${bank.accountNumber}`)
      doc.text(`口座名義: ${bank.accountHolder}`)
      doc.moveDown(1)

      // 備考（支払案内文・解決済みの input.paymentNote）
      doc.fontSize(9).fillColor('#444').text(input.paymentNote, left, doc.y, { width: contentWidth })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

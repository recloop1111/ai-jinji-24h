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

// AIMEN24 ブランドパレット（請求書PDF）。主要ブランドカラー = Navy #06182F。
// 濃色は帯・見出し・強調のみに使い、地は白/薄グレー/薄ブルーグレーで視認性を優先する。
const C = {
  navy: '#06182F', // AIMEN24 Navy（帯・表ヘッダー・合計強調）
  navyMid: '#13294a', // 帯アクセント（斜めカットの中間色）
  blueLt: '#aebfd6', // 帯アクセント（明るいブルーグレー）／INVOICE サブ文字
  ink: '#1f2937', // 本文（slate-800）
  sub: '#6b7280', // 補助文字（slate-500）
  line: '#e2e8f0', // 罫線（slate-200）
  soft: '#f1f5f9', // 情報ブロック背景（slate-100）
  navySoft: '#eaeef5', // 合計金額右ボックス・小見出し背景（薄ネイビー）
  white: '#ffffff',
} as const

function yen(n: number): string {
  return `¥${(n ?? 0).toLocaleString('ja-JP')}`
}

// 表示用の日付整形（YYYY-MM-DD → YYYY/MM/DD）。resolver（jstDueDate）の値は変えない。
function slashDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, '/') : '—'
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
      // margin:0 でページ全域に描画可能にし、コンテンツは MX の内側で管理（帯は全幅ブリード）。
      const doc = new PDFDocument({ size: 'A4', margin: 0, font: '' })
      doc.registerFont('jp', readFileSync(FONT_PATH))
      doc.font('jp')

      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const W = doc.page.width
      const H = doc.page.height
      const MX = 45 // 左右の内容マージン（十分な余白）
      const left = MX
      const right = W - MX
      const cw = right - left // コンテンツ幅

      // ── 描画ヘルパ（絶対座標・1ページ完結レイアウト） ──────────────────
      const fill = (color: string) => doc.fillColor(color)
      // 縦中央寄せの1行テキスト（行高 rowH のセル内）。
      const cellText = (
        str: string,
        x: number,
        rowY: number,
        w: number,
        rowH: number,
        opt: { align?: 'left' | 'center' | 'right'; size?: number; color?: string; pad?: number } = {},
      ) => {
        const size = opt.size ?? 10
        const align = opt.align ?? 'left'
        const pad = opt.pad ?? 10
        const tx = align === 'left' ? x + pad : x
        const tw = align === 'left' ? w - pad : align === 'right' ? w - pad : w
        fill(opt.color ?? C.ink).fontSize(size)
        doc.text(str, tx, rowY + (rowH - size) / 2 - 1, { width: tw, align })
      }
      // セクション見出し（ナビーの縦バー＋ラベル）。戻り値は見出し下端の y。
      const sectionMark = (label: string, x: number, y: number, width: number): number => {
        doc.rect(x, y + 1, 3.5, 15).fill(C.navy)
        fill(C.navy).fontSize(12).text(label, x + 10, y, { width: width - 10, characterSpacing: 0.5 })
        return y + 20
      }

      // ── 1. ヘッダー帯（AIMEN24 Navy・斜めカットアクセント） ───────────────
      const bandH = 120
      // 主帯（左〜中央・右端を斜めに）
      doc.polygon([0, 0], [W * 0.6, 0], [W * 0.5, bandH], [0, bandH]).fill(C.navy)
      // 中間色アクセント（斜めの層）
      doc.polygon([W * 0.6, 0], [W * 0.68, 0], [W * 0.58, bandH], [W * 0.5, bandH]).fill(C.navyMid)
      // 明るいブルーグレーの細アクセント
      doc.polygon([W * 0.68, 0], [W * 0.71, 0], [W * 0.61, bandH], [W * 0.58, bandH]).fill(C.blueLt)

      // 御請求書（白・字間広め）＋ INVOICE
      fill(C.white).fontSize(29).text('御 請 求 書', MX, 34, { characterSpacing: 4 })
      fill(C.blueLt).fontSize(11).text('I N V O I C E', MX + 2, 76, { characterSpacing: 5 })

      // AIMEN24 テキストロゴ（帯の白側・右上）＋ タグライン
      fill(C.navy).fontSize(23).text('AIMEN24', right - 240, 30, { width: 240, align: 'right', characterSpacing: 0.5 })
      fill(C.sub).fontSize(8.5).text('AIで、採用をもっとシンプルに。', right - 240, 62, { width: 240, align: 'right' })

      // 発行日 / 請求書番号（帯下・右寄せ・コロン揃え）
      const metaW = 260
      const metaX = right - metaW
      fill(C.ink).fontSize(10)
      doc.text(`発行日　　：${input.issueDate}`, metaX, 134, { width: metaW, align: 'right' })
      doc.text(`請求書番号：${input.invoiceNumber}`, metaX, 151, { width: metaW, align: 'right' })

      // ── 2. 請求先（左） / 発行者（右） ─────────────────────────────────
      const blockY = 178
      const colW = cw * 0.46
      const rightColX = left + cw * 0.54

      // 請求先
      let by = sectionMark('請求先', left, blockY, colW)
      doc.moveTo(left, by).lineTo(left + colW, by).lineWidth(1).stroke(C.navy)
      by += 12
      const bt = input.billTo
      fill(C.ink).fontSize(15).text(`${bt.companyName}　御中`, left, by, { width: colW })
      by = doc.y + 4
      fill(C.ink).fontSize(10.5)
      if (bt.department) { doc.text(bt.department, left, by, { width: colW }); by = doc.y }
      if (bt.contactName) { doc.text(`${bt.contactName} 様`, left, by, { width: colW }); by = doc.y }
      if (bt.postalCode) { doc.text(`〒${bt.postalCode}`, left, by, { width: colW }); by = doc.y }
      if (bt.address) {
        doc.text(`${bt.address}${bt.building ? ' ' + bt.building : ''}`, left, by, { width: colW })
        by = doc.y
      }
      if (bt.phone) { doc.text(`TEL：${bt.phone}`, left, by, { width: colW }); by = doc.y }
      const billToBottom = by

      // 発行者
      const issuer = input.issuer
      let iy = sectionMark('発行者', rightColX, blockY, colW)
      doc.moveTo(rightColX, iy).lineTo(rightColX + colW, iy).lineWidth(1).stroke(C.navy)
      iy += 12
      fill(C.ink).fontSize(12.5).text(issuer.name, rightColX, iy, { width: colW })
      iy = doc.y + 4
      fill(C.ink).fontSize(10.5)
      doc.text(`〒${issuer.postalCode}`, rightColX, iy, { width: colW }); iy = doc.y
      doc.text(`${issuer.address}${issuer.building ? ' ' + issuer.building : ''}`, rightColX, iy, { width: colW }); iy = doc.y
      // 登録番号は設定されている場合のみ表示（未登録時に「未登録」等を出さない）。
      if (issuer.registrationNumber) {
        doc.text(`登録番号：${issuer.registrationNumber}`, rightColX, iy, { width: colW }); iy = doc.y
      }
      doc.text(`TEL：${issuer.tel}`, rightColX, iy, { width: colW }); iy = doc.y
      const issuerBottom = iy

      // ── 3. 案内文 ────────────────────────────────────────────────
      let y = Math.max(billToBottom, issuerBottom) + 14
      fill(C.ink).fontSize(10.5).text('下記の通り、御請求申し上げます。', left, y)
      y = doc.y + 8

      // ── 4. 請求情報ブロック（薄背景） ──────────────────────────────
      const infoH = 82
      doc.roundedRect(left, y, cw, infoH, 8).fill(C.soft)
      sectionMark('請求情報', left + 18, y + infoH / 2 - 9, 100)
      const labelX = left + 150
      const infoRows: [string, string][] = [
        ['件名　', `${input.billingMonth}分 AI面接利用料`],
        ['支払期限', slashDate(input.dueDate)],
        ['振込先', `${input.bank.bankName} ${input.bank.branchName} ${input.bank.accountType} ${input.bank.accountNumber}`],
      ]
      let ry = y + 16
      for (const [label, value] of infoRows) {
        fill(C.sub).fontSize(10).text(label, labelX, ry, { width: 64 })
        fill(C.navy).fontSize(10).text('：', labelX + 64, ry)
        fill(C.ink).fontSize(10).text(value, labelX + 80, ry, { width: right - (labelX + 80) - 16 })
        ry += 20
      }
      y += infoH + 16

      // ── 5. 合計金額ボックス ──────────────────────────────────────
      const totalBoxH = 56
      const totLabelW = cw * 0.28
      doc.rect(left, y, totLabelW, totalBoxH).fill(C.navy)
      fill(C.white).fontSize(16).text('合計金額', left, y + (totalBoxH - 16) / 2, { width: totLabelW, align: 'center' })
      const totValX = left + totLabelW
      const totValW = cw - totLabelW
      doc.rect(totValX, y, totValW, totalBoxH).fill(C.navySoft)
      const totalStr = yen(input.total)
      const suffix = '（税込）'
      doc.fontSize(30); const tW = doc.widthOfString(totalStr)
      doc.fontSize(11); const sW = doc.widthOfString(suffix)
      const groupX = totValX + (totValW - (tW + 8 + sW)) / 2
      fill(C.navy).fontSize(30).text(totalStr, groupX, y + (totalBoxH - 30) / 2 - 1)
      fill(C.sub).fontSize(11).text(suffix, groupX + tW + 8, y + totalBoxH / 2 - 2)
      y += totalBoxH + 16

      // ── 6. 明細テーブル ──────────────────────────────────────────
      const cols = [
        { label: '内容', w: 0.40, align: 'left' as const },
        { label: '数量', w: 0.09, align: 'center' as const },
        { label: '単位', w: 0.09, align: 'center' as const },
        { label: '単価（税抜）', w: 0.15, align: 'right' as const },
        { label: '税率', w: 0.10, align: 'center' as const },
        { label: '金額（税抜）', w: 0.17, align: 'right' as const },
      ]
      const colX: number[] = []
      const colWidth: number[] = []
      { let acc = left; for (const c of cols) { colX.push(acc); colWidth.push(cw * c.w); acc += cw * c.w } }
      const headH = 26
      // ヘッダー行（ナビー背景・白文字）
      doc.rect(left, y, cw, headH).fill(C.navy)
      cols.forEach((c, i) => cellText(c.label, colX[i], y, colWidth[i], headH, { align: c.align, size: 9.5, color: C.white, pad: 10 }))
      // データ行 ＋ 空行（合計 3 行）
      const rowH = 28
      const dataVals = [
        `${input.billingMonth} AI面接利用料`,
        `${input.interviewCount}`,
        '件',
        yen(input.unitPrice),
        `${Math.round(BILLING_TERMS.taxRate * 100)}%`,
        yen(input.subtotal),
      ]
      const bodyRows = 3
      for (let r = 0; r < bodyRows; r++) {
        const rowTop = y + headH + r * rowH
        if (r === 0) {
          cols.forEach((c, i) => cellText(dataVals[i], colX[i], rowTop, colWidth[i], rowH, { align: c.align, size: 10, color: C.ink, pad: 10 }))
        }
        doc.moveTo(left, rowTop + rowH).lineTo(right, rowTop + rowH).lineWidth(0.7).stroke(C.line)
      }
      // 外枠（下端＋左右）を薄い罫線で締める
      const tableBottom = y + headH + bodyRows * rowH
      doc.moveTo(left, y).lineTo(left, tableBottom).lineWidth(0.7).stroke(C.line)
      doc.moveTo(right, y).lineTo(right, tableBottom).lineWidth(0.7).stroke(C.line)
      y = tableBottom + 18

      // ── 7. 税別内訳（左） / 合計サマリー（右） ────────────────────────
      const rate = `${Math.round(BILLING_TERMS.taxRate * 100)}%`
      // 税別内訳
      const bkX = left
      const bkW = cw * 0.5
      const bkTop = sectionMark('税別内訳', bkX, y, bkW)
      const brCols = [
        { label: '税率', w: 0.30, align: 'center' as const },
        { label: '対象金額（税抜）', w: 0.4, align: 'right' as const },
        { label: '消費税額', w: 0.30, align: 'right' as const },
      ]
      const brX: number[] = []
      const brW: number[] = []
      { let acc = bkX; for (const c of brCols) { brX.push(acc); brW.push(bkW * c.w); acc += bkW * c.w } }
      const brHeadH = 23
      const brHeadY = bkTop + 4
      doc.rect(bkX, brHeadY, bkW, brHeadH).fill(C.navySoft)
      brCols.forEach((c, i) => cellText(c.label, brX[i], brHeadY, brW[i], brHeadH, { align: c.align, size: 8.5, color: C.navy, pad: 8 }))
      const brRowH = 24
      const brRowY = brHeadY + brHeadH
      const brVals = [`${rate}対象分`, yen(input.subtotal), yen(input.tax)]
      brCols.forEach((c, i) => cellText(brVals[i], brX[i], brRowY, brW[i], brRowH, { align: c.align, size: 9.5, color: C.ink, pad: 8 }))
      doc.rect(bkX, brHeadY, bkW, brHeadH + brRowH).lineWidth(0.7).stroke(C.line)
      const brBottom = brRowY + brRowH

      // 合計サマリー（右・小計/消費税/合計）
      const smX = left + cw * 0.55
      const smW = cw * 0.45
      const smRowH = 28
      const smTotalH = 34
      let smY = y + 4
      const summary: [string, string][] = [
        ['小計（税抜）', yen(input.subtotal)],
        [`消費税（${rate}）`, yen(input.tax)],
      ]
      for (const [label, value] of summary) {
        doc.rect(smX, smY, smW, smRowH).lineWidth(0.7).stroke(C.line)
        cellText(label, smX, smY, smW * 0.55, smRowH, { align: 'left', size: 10, color: C.sub, pad: 12 })
        cellText(value, smX + smW * 0.45, smY, smW * 0.55, smRowH, { align: 'right', size: 10.5, color: C.ink, pad: 12 })
        smY += smRowH
      }
      // 合計行（ナビー背景・白）
      doc.rect(smX, smY, smW, smTotalH).fill(C.navy)
      cellText('合計（税込）', smX, smY, smW * 0.5, smTotalH, { align: 'left', size: 11, color: C.white, pad: 12 })
      cellText(yen(input.total), smX + smW * 0.5, smY, smW * 0.5, smTotalH, { align: 'right', size: 15, color: C.white, pad: 12 })
      const smBottom = smY + smTotalH

      y = Math.max(brBottom, smBottom) + 16

      // ── 8. 備考（枠付き） ────────────────────────────────────────
      const noteTop = sectionMark('備考', left, y, cw)
      const notePadX = 14
      const notePadY = 12
      fill(C.ink).fontSize(9.5)
      const noteTextH = doc.heightOfString(input.paymentNote, { width: cw - notePadX * 2 })
      const noteBoxH = Math.max(50, noteTextH + notePadY * 2)
      doc.roundedRect(left, noteTop + 4, cw, noteBoxH, 6).lineWidth(0.7).stroke(C.line)
      fill(C.ink).fontSize(9.5).text(input.paymentNote, left + notePadX, noteTop + 4 + notePadY, { width: cw - notePadX * 2 })

      // ── 9. フッター（ページ下部固定） ─────────────────────────────
      const footY = H - 46
      doc.moveTo(left, footY).lineTo(right, footY).lineWidth(0.7).stroke(C.line)
      fill(C.navy).fontSize(11).text('AIMEN24', left, footY + 12, { continued: true, characterSpacing: 0.5 })
      fill(C.sub).fontSize(8.5).text('　AIで、採用をもっとシンプルに。')
      fill(C.sub).fontSize(8.5).text('｜  https://aimen24.jp', left, footY + 14, { width: cw, align: 'right' })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

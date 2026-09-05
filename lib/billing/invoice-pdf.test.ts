import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildInvoicePdf, toInvoiceInput, type InvoiceInput } from './invoice-pdf'
import { resolveBillTo } from './bill-to'

// Billing B-6: 請求書PDFデザイン刷新。金額ロジック・resolver は不変のまま、
// 描画が壊れない（throw しない・実PDFを返す）ことと unitPrice 計算を検証する。
// レイアウトの pixel-perfect 検証はしない（section 18 方針どおり）。

const baseInput = (over: Partial<InvoiceInput> = {}): InvoiceInput => ({
  invoiceNumber: 'INV-202608-1027b9fb',
  issueDate: '2026/09/01',
  dueDate: '2026-10-31',
  billingMonth: '2026年08月',
  billTo: {
    companyName: 'テスト株式会社',
    department: '経理部',
    contactName: '請求テスト担当',
    postalCode: '100-0000',
    address: '東京都千代田区テスト1-1-1',
    building: 'テストビル101',
    phone: '03-0000-0000',
  },
  issuer: {
    name: 'AIMEN24運営会社（仮）',
    postalCode: '000-0000',
    address: '東京都○○区○○ 0-0-0',
    building: '○○ビル 2階',
    tel: '00-0000-0000',
    registrationNumber: 'T0123456789012',
  },
  bank: {
    bankName: '○○銀行',
    branchName: '○○支店',
    accountType: '普通',
    accountNumber: '0000000',
    accountHolder: 'カ）エーアイメン',
  },
  paymentNote: 'お支払いは本請求書記載の振込先へ、支払期限までにお振込みをお願いいたします。',
  interviewCount: 1,
  unitPrice: 4000,
  subtotal: 4000,
  tax: 400,
  total: 4400,
  ...over,
})

const isPdf = (buf: Buffer) => buf.length > 800 && buf.subarray(0, 5).toString('latin1') === '%PDF-'
// pdfkit は Pages ノードに総ページ数 /Count を書く。MediaBox はページごとに1つ。
// 追加の重量級 library を入れずにページ数を安定検証する。
const pdfPageCount = (buf: Buffer): number => {
  const s = buf.toString('latin1')
  const m = s.match(/\/Count (\d+)/)
  if (m) return Number(m[1])
  return (s.match(/\/MediaBox/g) ?? []).length
}

describe('toInvoiceInput（金額ロジック無変更）', () => {
  const record = {
    id: '1027b9fb-419e-4e6d-9933-70aca922693f',
    billing_month: '2026-08-01',
    interview_count: 1,
    amount_jpy: 4000,
    tax_jpy: 400,
    total_jpy: 4400,
    created_at: '2026-09-01T00:00:00Z',
  }
  const company = { name: 'テスト株式会社', contact_person: '担当 太郎' }

  it('確定値（subtotal/tax/total）をそのまま使い再計算しない', () => {
    const input = toInvoiceInput(record, company)
    expect(input.subtotal).toBe(4000)
    expect(input.tax).toBe(400)
    expect(input.total).toBe(4400)
  })

  it('invoice number は INV-YYYYMM-<id先頭8> のまま', () => {
    expect(toInvoiceInput(record, company).invoiceNumber).toBe('INV-202608-1027b9fb')
  })

  it('1件時 unitPrice = amount / count', () => {
    expect(toInvoiceInput(record, company).unitPrice).toBe(4000)
  })

  it('0件時 unitPrice = 0（0除算しない）', () => {
    const input = toInvoiceInput({ ...record, interview_count: 0, amount_jpy: 0 }, company)
    expect(input.unitPrice).toBe(0)
  })

  it('複数件時 unitPrice = amount / count（四捨五入）', () => {
    const input = toInvoiceInput({ ...record, interview_count: 3, amount_jpy: 12000, tax_jpy: 1200, total_jpy: 13200 }, company)
    expect(input.unitPrice).toBe(4000)
    expect(input.subtotal).toBe(12000)
    expect(input.total).toBe(13200)
  })
})

describe('buildInvoicePdf（デザイン刷新・描画堅牢性）', () => {
  it('通常入力で有効な PDF Buffer を返す', async () => {
    const pdf = await buildInvoicePdf(baseInput())
    expect(isPdf(pdf)).toBe(true)
  })

  it('registrationNumber 空でも throw せず PDF を返す（登録番号行は非表示）', async () => {
    const pdf = await buildInvoicePdf(
      baseInput({ issuer: { ...baseInput().issuer, registrationNumber: '' } }),
    )
    expect(isPdf(pdf)).toBe(true)
  })

  it('billTo が長文でも throw しない', async () => {
    const long = 'あ'.repeat(300)
    const pdf = await buildInvoicePdf(
      baseInput({
        billTo: {
          companyName: `非常に長い会社名${long}`,
          department: `部署${long}`,
          contactName: `担当${long}`,
          postalCode: '100-0000',
          address: `東京都${long}`,
          building: `ビル${long}`,
          phone: '03-0000-0000',
        },
      }),
    )
    expect(isPdf(pdf)).toBe(true)
  })

  it('paymentNote が長文でも throw しない', async () => {
    const pdf = await buildInvoicePdf(baseInput({ paymentNote: 'お支払いのお願い。'.repeat(200) }))
    expect(isPdf(pdf)).toBe(true)
  })

  it('任意項目（department/contactName/postalCode/building/phone）が空でも throw しない', async () => {
    const pdf = await buildInvoicePdf(
      baseInput({
        billTo: {
          companyName: 'テスト株式会社',
          department: null,
          contactName: null,
          postalCode: null,
          address: null,
          building: null,
          phone: null,
        },
      }),
    )
    expect(isPdf(pdf)).toBe(true)
  })

  it('dueDate が null でも throw しない', async () => {
    const pdf = await buildInvoicePdf(baseInput({ dueDate: null }))
    expect(isPdf(pdf)).toBe(true)
  })
})

// Billing B-6.2: 請求先名は DB/snapshot（SoT）をそのまま表示する。renderer は「請求先」等の
// 付与・除去を一切しない。ブロック余白調整後も A4 縦1ページを維持する。
describe('B-6.2 請求先名 SoT passthrough / 1ページ維持', () => {
  it('A: companyName=ABC株式会社 → 有効な1ページPDF', async () => {
    const pdf = await buildInvoicePdf(baseInput({ billTo: { ...baseInput().billTo, companyName: 'ABC株式会社' } }))
    expect(isPdf(pdf)).toBe(true)
    expect(pdfPageCount(pdf)).toBe(1)
  })

  it('B: companyName に「請求先」を含んでも renderer/resolver が勝手に削除しない（SoT そのまま）', async () => {
    // resolver は入力値を改変しない（付与も除去もしない）。
    const resolved = resolveBillTo({ name: 'テスト株式会社 請求先', contact_person: null }, null, null)
    expect(resolved.companyName).toBe('テスト株式会社 請求先')
    const input = toInvoiceInput(
      { id: 'abcdef12-0000-0000-0000-000000000000', billing_month: '2026-08-01', interview_count: 1, amount_jpy: 4000, tax_jpy: 400, total_jpy: 4400, created_at: '2026-09-01T00:00:00Z' },
      { name: 'テスト株式会社 請求先', contact_person: null },
    )
    expect(input.billTo.companyName).toBe('テスト株式会社 請求先') // 改変なし
    const pdf = await buildInvoicePdf(baseInput({ billTo: { ...baseInput().billTo, companyName: 'ABC株式会社 請求先' } }))
    expect(isPdf(pdf)).toBe(true)
  })

  it('B(source): renderer に「請求先」を除去する文字列 hack が存在しない', () => {
    const src = readFileSync(path.join(process.cwd(), 'lib/billing/invoice-pdf.ts'), 'utf8')
    expect(src).not.toContain(".replace('請求先'")
    expect(src).not.toContain('.replace("請求先"')
    expect(src).not.toContain('.replaceAll')
  })

  it('C: 長い会社名でも1ページPDFを生成', async () => {
    const pdf = await buildInvoicePdf(baseInput({ billTo: { ...baseInput().billTo, companyName: '株式会社' + 'あ'.repeat(24) } }))
    expect(isPdf(pdf)).toBe(true)
    expect(pdfPageCount(pdf)).toBe(1)
  })

  it('D: 長い住所でも1ページPDFを生成', async () => {
    const pdf = await buildInvoicePdf(baseInput({ billTo: { ...baseInput().billTo, address: '東京都千代田区' + 'テスト町'.repeat(10) + '1-2-3', building: '' + 'ビル'.repeat(8) } }))
    expect(isPdf(pdf)).toBe(true)
    expect(pdfPageCount(pdf)).toBe(1)
  })

  it('E: 長い発行者名でも1ページPDFを生成', async () => {
    const pdf = await buildInvoicePdf(baseInput({ issuer: { ...baseInput().issuer, name: 'AIMEN24運営会社' + 'ながい名称'.repeat(8) } }))
    expect(isPdf(pdf)).toBe(true)
    expect(pdfPageCount(pdf)).toBe(1)
  })

  it('F: registrationNumber 空でも1ページPDFを生成', async () => {
    const pdf = await buildInvoicePdf(baseInput({ issuer: { ...baseInput().issuer, registrationNumber: '' } }))
    expect(isPdf(pdf)).toBe(true)
    expect(pdfPageCount(pdf)).toBe(1)
  })

  it('G: 通常入力（demo fixture相当）は1ページ', async () => {
    expect(pdfPageCount(await buildInvoicePdf(baseInput()))).toBe(1)
  })
})

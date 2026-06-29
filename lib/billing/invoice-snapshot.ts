// 請求確定時に billing_records.invoice_snapshot へ凍結するスナップショットの組み立て。
// pdfkit 非依存（monthly-billing writer から import するため）。
// 既存の resolver を snapshot=null（live）で呼ぶことで、確定時点のライブ値を解決して固める。
// → 後で請求先/発行者/振込先を変更しても、確定済み請求書PDFの内容は変わらない。
//
// 解決優先順位（確定時のライブ値）:
//   - bill_to:      company_billing_profiles → companies fallback
//   - issuer/bank/payment_note: billing_issuer_settings → lib/config/billing.ts fallback
// PDF側は invoice_snapshot を最優先で読むため、ここで固めた値がそのまま使われる。

import { resolveBillTo, type InvoiceBillTo, type BillToProfileRow } from '@/lib/billing/bill-to'
import {
  resolveIssuer,
  resolveBank,
  resolvePaymentNote,
  type InvoiceIssuer,
  type InvoiceBank,
  type BillingIssuerSettingsDbRow,
} from '@/lib/billing/issuer-settings'

export type InvoiceSnapshotData = {
  bill_to: InvoiceBillTo
  issuer: InvoiceIssuer
  bank: InvoiceBank
  payment_note: string
  snapshot_at: string // ISO8601（確定/再計算でこのスナップショットを固めた時刻）
}

export function buildInvoiceSnapshot(
  company: { name: string | null; contact_person: string | null },
  profile: BillToProfileRow,
  issuerRow: BillingIssuerSettingsDbRow,
): InvoiceSnapshotData {
  return {
    bill_to: resolveBillTo(company, profile, null),
    issuer: resolveIssuer(issuerRow, null),
    bank: resolveBank(issuerRow, null),
    payment_note: resolvePaymentNote(issuerRow, null),
    snapshot_at: new Date().toISOString(),
  }
}

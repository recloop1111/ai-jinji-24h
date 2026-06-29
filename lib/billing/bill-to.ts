// 請求書の宛名（bill-to）解決ロジック。pdfkit 非依存の純モジュール。
// invoice-pdf.ts（PDF描画）と invoice-snapshot.ts（writer の凍結）が共有する。
// 解決優先順位: invoice_snapshot.bill_to（凍結）→ company_billing_profiles（live）→ companies fallback。

// 請求先（宛名）の表示用フィールド。companyName は 御中、contactName は 様 で表示。
export type InvoiceBillTo = {
  companyName: string
  department: string | null
  contactName: string | null
  postalCode: string | null
  address: string | null
  building: string | null
  phone: string | null
}

// 請求先情報（company_billing_profiles）の宛名関連列。contact_email/note はPDF不使用。
export type BillToProfileRow = {
  billing_name: string | null
  department: string | null
  contact_name: string | null
  postal_code: string | null
  address: string | null
  building: string | null
  phone: string | null
} | null

// 請求先（宛名）の解決優先順位:
//   1. snapshot（確定時に凍結された値。過去請求書は不変）
//   2. company_billing_profiles（企業/運営が登録した請求先情報・live）
//   3. companies.name / contact_person（未登録時の fallback）
// companyName（御中）は常に何か表示されるよう company.name へ最終 fallback する。
export function resolveBillTo(
  company: { name: string | null; contact_person: string | null },
  profile: BillToProfileRow,
  snapshot: Partial<InvoiceBillTo> | null | undefined,
): InvoiceBillTo {
  if (snapshot) {
    return {
      companyName: snapshot.companyName ?? company.name ?? '',
      department: snapshot.department ?? null,
      contactName: snapshot.contactName ?? null,
      postalCode: snapshot.postalCode ?? null,
      address: snapshot.address ?? null,
      building: snapshot.building ?? null,
      phone: snapshot.phone ?? null,
    }
  }
  if (profile) {
    return {
      companyName: profile.billing_name || company.name || '',
      department: profile.department ?? null,
      contactName: profile.contact_name ?? company.contact_person ?? null,
      postalCode: profile.postal_code ?? null,
      address: profile.address ?? null,
      building: profile.building ?? null,
      phone: profile.phone ?? null,
    }
  }
  return {
    companyName: company.name ?? '',
    department: null,
    contactName: company.contact_person ?? null,
    postalCode: null,
    address: null,
    building: null,
    phone: null,
  }
}

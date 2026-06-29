import { type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { successJson, apiError } from '@/lib/api/response'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { jstPreviousMonthRange } from '@/lib/companies/applyNextMonthLimit'
import { PRICE_PER_INTERVIEW } from '@/types/database'
import { buildInvoiceSnapshot } from '@/lib/billing/invoice-snapshot'

// node:crypto（timing-safe比較）を使うため Node runtime を明示
export const runtime = 'nodejs'

// 月次請求の自前確定バッチ（Stripe不使用・銀行振込）。
// 前月（JST）の is_billable=true 面接を company ごとに集計し billing_records を確定（pending）する。
// 冪等: (company_id, billing_month) UNIQUE。再実行は payment_status='pending' のみ再計算更新、paid/failed/refunded は不変。
// 認証: INTERNAL_BATCH_SECRET の Bearer（service-role で実行）。secret はログ/レスポンスへ出さない。

function bearerOk(authHeader: string, secret: string | undefined): boolean {
  if (!secret) return false // 未設定は fail-closed
  const expected = `Bearer ${secret}`
  const a = Buffer.from(authHeader)
  const b = Buffer.from(expected)
  // 長さが違うと timingSafeEqual が投げるため先に長さ比較（不一致は即 false）
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') ?? ''
    if (!bearerOk(authHeader, process.env.INTERNAL_BATCH_SECRET)) {
      return apiError('UNAUTHORIZED', '認証に失敗しました')
    }

    const supabase = createServiceRoleClient()

    // 確定対象＝JST 前月（半開区間 [startIso, endIso) で created_at を絞る）。billing_month は前月1日。
    const { startIso, endIso, billingMonth } = jstPreviousMonthRange()

    // 対象企業（確定に必要な列のみ）。name/contact_person は invoice_snapshot の bill_to fallback 用。
    // PostgREST の1ページ上限（通常1000行）で後続テナントが請求漏れしないよう range() で全件ページング取得する。
    const PAGE_SIZE = 1000
    const companies: {
      id: string
      name: string | null
      contact_person: string | null
      plan: string | null
      price_per_interview: number | null
    }[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error: compError } = await supabase
        .from('companies')
        .select('id, name, contact_person, plan, price_per_interview')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (compError) {
        return apiError('INTERNAL_ERROR', '企業情報の取得に失敗しました')
      }
      if (!page || page.length === 0) break
      companies.push(...page)
      if (page.length < PAGE_SIZE) break
    }

    // 発行者/振込先/支払案内文は全社共通の単一設定（id='default'）。ループ前に1回だけ取得し
    // 各社の invoice_snapshot.issuer/bank/payment_note を固める（空項目は config fallback）。
    // 未作成/未設定なら null → snapshot は config 値で固まる。
    const { data: issuerRow } = await supabase
      .from('billing_issuer_settings')
      .select('issuer_name, postal_code, address, building, tel, registration_number, bank_name, branch_name, account_type, account_number, account_holder, payment_note')
      .eq('id', 'default')
      .maybeSingle()

    let created = 0
    let updated = 0
    let skipped = 0
    let errors = 0

    for (const company of companies) {
      try {
        // 前月の課金対象（is_billable=true）件数
        const { count, error: countError } = await supabase
          .from('interviews')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .eq('is_billable', true)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
        if (countError) {
          errors++
          continue
        }

        const interviewCount = count ?? 0
        // 0件企業は請求レコードを作らない
        if (interviewCount === 0) {
          skipped++
          continue
        }

        const price = company.price_per_interview ?? PRICE_PER_INTERVIEW
        const amountJpy = interviewCount * price
        const taxJpy = Math.round(amountJpy * 0.1)
        const totalJpy = amountJpy + taxJpy

        // 既存（同 company × billing_month）の有無と支払状況で分岐（冪等）
        const { data: existing, error: selError } = await supabase
          .from('billing_records')
          .select('id, payment_status')
          .eq('company_id', company.id)
          .eq('billing_month', billingMonth)
          .maybeSingle()
        if (selError) {
          errors++
          continue
        }

        // 新規確定 or pending 再計算の時だけ snapshot を組む（paid/failed/refunded の skip では作らない＝余計な取得をしない）。
        // snapshot は確定時点のライブ値を凍結: bill_to=profile→companies、issuer/bank/note=billing_issuer_settings→config。
        const willWrite = !existing || existing.payment_status === 'pending'
        let invoiceSnapshot: ReturnType<typeof buildInvoiceSnapshot> | null = null
        if (willWrite) {
          const { data: profile } = await supabase
            .from('company_billing_profiles')
            .select('billing_name, department, contact_name, postal_code, address, building, phone')
            .eq('company_id', company.id)
            .maybeSingle()
          invoiceSnapshot = buildInvoiceSnapshot(
            { name: company.name, contact_person: company.contact_person },
            profile ?? null,
            issuerRow ?? null,
          )
        }

        if (!existing) {
          // 新規確定
          const { error: insError } = await supabase.from('billing_records').insert({
            company_id: company.id,
            billing_month: billingMonth,
            interview_count: interviewCount,
            amount_jpy: amountJpy,
            tax_jpy: taxJpy,
            total_jpy: totalJpy,
            plan_at_billing: company.plan,
            auto_upgrade_applied: false,
            payment_status: 'pending',
            paid_at: null,
            stripe_invoice_id: null,
            invoice_pdf_url: null,
            invoice_snapshot: invoiceSnapshot, // 確定時点を凍結
          })
          if (insError) {
            errors++
            continue
          }
          created++
        } else if (existing.payment_status === 'pending') {
          // 未入金のみ再計算更新（遅延 finalize を反映）。paid/failed/refunded は上書きしない。
          // snapshot も再計算時点で更新（pending は未確定のため許容）。
          const { error: updError } = await supabase
            .from('billing_records')
            .update({
              interview_count: interviewCount,
              amount_jpy: amountJpy,
              tax_jpy: taxJpy,
              total_jpy: totalJpy,
              plan_at_billing: company.plan,
              invoice_snapshot: invoiceSnapshot,
            })
            .eq('id', existing.id)
            .eq('payment_status', 'pending') // ← paid/failed/refunded への二重ガード（snapshot も含め上書きしない）
          if (updError) {
            errors++
            continue
          }
          updated++
        } else {
          // paid / failed / refunded は確定済みとして保護（invoice_snapshot を含め一切 UPDATE しない）
          skipped++
        }
      } catch {
        errors++
      }
    }

    return successJson({
      billing_month: billingMonth,
      processed_companies: companies.length,
      created,
      updated,
      skipped,
      errors,
    })
  } catch {
    return apiError('INTERNAL_ERROR')
  }
}

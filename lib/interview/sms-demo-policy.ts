// 応募者フローの SMS 認証における「固定コード（1234）を許可してよいか」の判定ポリシー。
//
// 設計方針（重要）:
// - Source of Truth は「server が slug から解決した companies.is_demo」だけ。
//   client から渡る companyId / is_demo は一切信用しない（呼び出し側で slug→company を service-role 解決する）。
// - 固定コードを許可するのは is_demo=true の企業のみ。「Preview だから全企業 1234」は禁止であり、
//   本関数は NODE_ENV/ホスト名では判定しない（＝環境一律の bypass を作らない）。
// - is_demo は本番/Preview/dev いずれでも有効。ops が admin で明示的に demo 指定した企業だけが対象。
// - 後方互換: SMS_FIXED_CODE_COMPANY_ID が設定されている場合、その company_id も明示許可（env override）。
//   これは「特定 1 社を明示指定」する既存の仕組みで、全企業許可にはならない。
// - 通常企業（is_demo=false かつ env 未指定/不一致）は絶対に固定コードを通さない。

export type FixedCodeCompany = {
  id: string
  is_demo: boolean | null
}

export function isFixedSmsCodeAllowed(
  company: FixedCodeCompany,
  env: Record<string, string | undefined> = process.env,
): boolean {
  // 主判定: server 解決の is_demo（DB 由来）。
  if (company.is_demo === true) return true
  // 副判定: 特定 company_id の明示的 env override（任意）。
  const explicitId = env.SMS_FIXED_CODE_COMPANY_ID
  return typeof explicitId === 'string' && explicitId.length > 0 && company.id === explicitId
}

// 応募者に提示する固定コード。demo 企業のみ有効。
export const DEMO_FIXED_SMS_CODE = '1234'

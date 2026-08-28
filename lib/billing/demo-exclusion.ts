// DB-authoritative な demo 除外（純ロジック）。
//   正式仕様: companies.is_demo=true の企業は、実請求件数 / billing usage / 月間利用件数 / プラン上限消費 /
//   請求金額 に **絶対に含めない**。判定の Source of Truth は **必ず DB の companies.is_demo**。
//   client の is_demo / query param / mode='mock' 等は信用しない（呼び出し側で DB 値のみを渡すこと）。
//
//   ※ interviews.is_billable 自体は既存フロー互換のため変更しない（demo 面接も is_billable が付き得る）。
//     除外は「billing 集計・利用上限側」で company.is_demo により行う（本ヘルパー）。

// 課金/利用量の集計対象とする企業か（demo は対象外）。
export function isBillableCompany(isDemo: boolean | null | undefined): boolean {
  return isDemo !== true
}

// 課金対象としてカウントする件数。demo 企業は常に 0（利用量・上限・請求から除外）。
export function billableUsageCount(rawCount: number | null | undefined, isDemo: boolean | null | undefined): number {
  if (isDemo === true) return 0
  const n = typeof rawCount === 'number' && Number.isFinite(rawCount) ? Math.floor(rawCount) : 0
  return Math.max(0, n)
}

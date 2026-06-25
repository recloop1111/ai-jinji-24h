import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * 翌月上限予約の「月初昇格」処理（遅延適用）。
 *
 * companies.next_month_interview_limit / next_month_limit_effective_month が設定済みで、
 * 現在日付（JST）が effective_month 以降になっていたら、
 *   - monthly_interview_limit = next_month_interview_limit に反映
 *   - next_month_interview_limit / next_month_limit_effective_month を null にクリア
 * する。company の取得系API（GET）から呼び、戻り値の実効値を表示に使う。
 *
 * - 反映は service role（RLSバイパス）で UPDATE するため、呼び出し元クライアント種別に依存しない。
 * - 二重反映防止: 予約が残っている行のみ更新（WHERE ... IS NOT NULL）。並行リクエストでも1回だけ昇格。
 * - price_per_interview / plan / company_setting_password_hash は変更しない。
 * - 反映失敗時は API 全体を壊さず、昇格前の値をそのまま返す（背景処理のため握りつぶす。
 *   ※ console は本番コード禁止のため出力しない。重大化する場合は Sentry 等の導入を別途検討）。
 */

export type NextMonthLimitInput = {
  id: string
  monthly_interview_limit: number | null
  next_month_interview_limit: number | null
  next_month_limit_effective_month: string | null
}

export type NextMonthLimitResult = {
  monthly_interview_limit: number | null
  next_month_interview_limit: number | null
  next_month_limit_effective_month: string | null
  promoted: boolean
}

const MIN_LIMIT = 5

// 今日（JST, YYYY-MM-DD）が effective_month（YYYY-MM-DD）以降か。
// date型の文字列比較は YYYY-MM-DD なら辞書順＝日付順で正しい。
function isTodayOnOrAfterJst(effectiveMonth: string): boolean {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000) // UTC+9
  const todayJst = jstNow.toISOString().slice(0, 10) // YYYY-MM-DD（JST基準）
  return todayJst >= effectiveMonth.slice(0, 10)
}

/**
 * 当月（JST）の月初 00:00 JST を、UTC インスタントの ISO 文字列で返す。
 * interviews.created_at（UTC timestamptz）との `>=` 比較に使う。JST = UTC+9。
 *
 * 月初昇格（isTodayOnOrAfterJst）と同じ JST 基準（Date.now()+9h）で当月の年月を導出するため、
 * 「上限が翌月分へ昇格済みなのに当月カウントは先月分（UTC月）」というズレを起こさない。
 * Vercel(UTC) でも JST 月初の最初の9時間で当月カウントが先月へずれない。
 */
export function jstCurrentMonthStartIso(now: number = Date.now()): string {
  const jstNow = new Date(now + 9 * 60 * 60 * 1000)
  const y = jstNow.getUTCFullYear()
  const m = jstNow.getUTCMonth()
  // JST の y-m-01 00:00 を UTC インスタントに直すと 9時間前（= 前日 15:00 UTC）。
  return new Date(Date.UTC(y, m, 1) - 9 * 60 * 60 * 1000).toISOString()
}

/**
 * 翌月1日（JST基準）を `YYYY-MM-01` で返す。翌月上限予約の effective_month の算出に使う。
 *
 * isTodayOnOrAfterJst / jstCurrentMonthStartIso と同じ JST 基準（Date.now()+9h）で当月を導出してから +1 月する。
 * これにより「Vercel(UTC) で JST 月初の最初の9時間に予約すると effective_month が当月になり即時昇格してしまう」
 * というズレ（適用は必ず翌月1日、の仕様違反）を防ぐ。
 */
export function jstFirstOfNextMonthDate(now: number = Date.now()): string {
  const jstNow = new Date(now + 9 * 60 * 60 * 1000)
  const y = jstNow.getUTCFullYear()
  const m = jstNow.getUTCMonth() // 0-indexed（JST基準の当月）
  // 翌月の1日。Date.UTC は m+1=12（翌年1月）でも年繰り上げを正しく処理する。
  const next = new Date(Date.UTC(y, m + 1, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export async function applyNextMonthLimit(company: NextMonthLimitInput): Promise<NextMonthLimitResult> {
  const nextLimit = company.next_month_interview_limit
  const effMonth = company.next_month_limit_effective_month

  const unchanged: NextMonthLimitResult = {
    monthly_interview_limit: company.monthly_interview_limit,
    next_month_interview_limit: nextLimit,
    next_month_limit_effective_month: effMonth,
    promoted: false,
  }

  // 昇格条件: 予約値が5以上の整数 / 適用月あり / 今日(JST)が適用月以降
  if (
    typeof nextLimit !== 'number' ||
    !Number.isInteger(nextLimit) ||
    nextLimit < MIN_LIMIT ||
    typeof effMonth !== 'string' ||
    effMonth.length === 0 ||
    !isTodayOnOrAfterJst(effMonth)
  ) {
    return unchanged
  }

  try {
    const supabase = createServiceRoleClient()
    const { error } = await supabase
      .from('companies')
      .update({
        monthly_interview_limit: nextLimit,
        next_month_interview_limit: null,
        next_month_limit_effective_month: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', company.id)
      // 二重反映防止: まだ予約が残っている行だけ更新する
      .not('next_month_limit_effective_month', 'is', null)

    if (error) {
      // 背景処理の失敗は API を壊さない。昇格前の値を返す。
      return unchanged
    }

    return {
      monthly_interview_limit: nextLimit,
      next_month_interview_limit: null,
      next_month_limit_effective_month: null,
      promoted: true,
    }
  } catch {
    return unchanged
  }
}

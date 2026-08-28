// 企業向け「面接情報」の表示用 純ロジック（UI/DOM 非依存＝単体テスト可能）。
//   途中離脱応募者の詳細画面で、面接時間 / 回答進捗 / 終了理由 / 利用計上 を honest に表示するための整形。
//   DB raw 値は変更しない（presentation のみ）。null と 0 を必ず区別する。

import { classifyTermination } from '@/lib/billing/interview-eligibility'

// 面接時間の表示。SoT 優先: (1) duration_seconds（/end が server 算出）→ (2) started_at/ended_at 差分（旧データ fallback）。
//   0秒と null を区別（0秒 → "0秒"、取得不能 → null＝呼び出し側で "—"）。
export function formatInterviewDuration(input: {
  durationSeconds?: number | null
  startedAt?: string | null
  endedAt?: string | null
}): string | null {
  let secs: number | null = null
  if (typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds) && input.durationSeconds >= 0) {
    secs = Math.floor(input.durationSeconds)
  } else if (input.startedAt && input.endedAt) {
    const start = new Date(input.startedAt).getTime()
    const end = new Date(input.endedAt).getTime()
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      secs = Math.floor((end - start) / 1000)
    }
  }
  if (secs === null) return null
  const minutes = Math.floor(secs / 60)
  const seconds = secs % 60
  return `${minutes}分${String(seconds).padStart(2, '0')}秒`
}

// 回答進捗の表示。null（取得不能）と 0（0問回答）を必ず区別する。null を 0 に変換しない。
//   answered=5,total=10 → "5 / 10問" / answered=0,total=10 → "0 / 10問" /
//   answered=null,total=10 → "— / 10問" / answered=null,total=null → "—" / answered=0,total=null → "0問"
export function formatAnsweredProgress(input: {
  answered?: number | null
  total?: number | null
}): string {
  const a = typeof input.answered === 'number' && Number.isFinite(input.answered) ? Math.max(0, Math.floor(input.answered)) : null
  const t = typeof input.total === 'number' && Number.isFinite(input.total) ? Math.max(0, Math.floor(input.total)) : null
  if (t !== null) {
    return `${a === null ? '—' : a} / ${t}問`
  }
  // total 不明
  if (a === null) return '—'
  return `${a}問`
}

// 回答進捗データが取得できているか（未取得なら補足文を出すため）。
export function isAnsweredProgressAvailable(input: { answered?: number | null; total?: number | null }): boolean {
  const aOk = typeof input.answered === 'number' && Number.isFinite(input.answered)
  const tOk = typeof input.total === 'number' && Number.isFinite(input.total)
  return aOk || tOk
}

// end_reason（DB raw）→ 企業担当者向けの自然な日本語（presentation mapping）。DB 値は変更しない。
//   本人都合（自主終了）と技術エラー（disconnected）を明確に区別する。
export function endReasonLabel(endReason: string | null | undefined): string {
  switch ((endReason ?? '').trim()) {
    case 'completed':
    case '全質問完了':
      return '面接完了'
    case 'timeout':
    case '時間切れ':
      return '面接時間終了'
    case 'user_ended':
    case '自主終了':
      return '応募者による途中終了'
    case 'browser_closed':
      return '応募者が画面を閉じて終了'
    case 'disconnected':
      return '接続エラーにより終了'
    case 'silence':
      return '応答がないため終了'
    case 'inappropriate':
      return 'システムにより終了'
    default:
      return '終了理由不明'
  }
}

// 利用計上（月間利用件数として計上される面接か）。金額は出さない。
//   demo 企業（DB 権威 company.is_demo=true）は billing 集計から除外されるため「対象外（デモ企業）」。
//   通常企業: is_billable=true→"1件" / false→"対象外" / null→"—"。
export function interviewBillingLabel(isBillable: boolean | null | undefined, isDemo: boolean | null | undefined): string {
  if (isDemo === true) return '対象外（デモ企業）'
  if (isBillable === true) return '1件'
  if (isBillable === false) return '対象外'
  return '—'
}

// 途中離脱時の「AI 評価未実施」文言。technical failure と本人都合を区別（本人が途中でやめたと断定しない）。
export function aiEvaluationAbsenceMessage(status: string | null | undefined, endReason: string | null | undefined): string {
  const finalStatus = status === 'completed' ? 'completed' : 'cancelled'
  const category = classifyTermination({ finalStatus, endReason })
  if (category === 'technical_failure') {
    return '接続上の問題により面接が完了しなかったため、通常のAI評価は実施されていません。'
  }
  return '面接が途中で終了したため、通常のAI評価は実施されていません。'
}

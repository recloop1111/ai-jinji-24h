// 面接終了トリガー → {DB end_reason, final_status, 正常完了か} の一貫した解決（純ロジック・UI/DB 非依存）。
//   表示トリガーと DB reason・課金カテゴリを一貫させ、session 側の分岐を SoT 化する。
//   課金カテゴリの最終判定は lib/billing/interview-eligibility.ts の classifyTermination（{final_status,end_reason}）が担う。
//
// 分類（正式仕様）:
//   A. 全質問完了            → completed（正常完了・complete フロー）
//   B. 時間切れ/timeout      → completed（面接時間の上限まで提供＝正常完了。全質問未消化でも completed・課金対象）
//   C. 自主終了/browser_closed/silence → cancelled（applicant_exit・課金は duration/回答率ゲート）
//   D. disconnected（Realtime/接続の技術的失敗）→ cancelled（technical_failure・非課金）
//
// end_reason は既存 CHECK 許可値のみ使用（新しい DB enum/value は増やさない）:
//   completed/user_ended/timeout/silence/inappropriate/disconnected/browser_closed/全質問完了/時間切れ/自主終了

// interviews.end_reason の正式 allow-list（実 DB CHECK `interviews_end_reason_check` と一致させること）。
//   docs/MIGRATION_SQL.md 参照。ここに無い値は API 側で 4xx にし、DB CHECK 違反（500）を未然に防ぐ。
//   新しい値をここに勝手に足さない（DB CHECK を先に更新すること）。
export const ALLOWED_END_REASONS = [
  'completed',
  'user_ended',
  'timeout',
  'silence',
  'inappropriate',
  'disconnected',
  'browser_closed',
  '全質問完了',
  '時間切れ',
  '自主終了',
] as const
export type AllowedEndReason = (typeof ALLOWED_END_REASONS)[number]

// end_reason が正式 allow-list に含まれるか（null/undefined は「未指定」として別扱い＝呼び出し側で許容）。
export function isAllowedEndReason(reason: string | null | undefined): reason is AllowedEndReason {
  return typeof reason === 'string' && (ALLOWED_END_REASONS as readonly string[]).includes(reason)
}

// time_limit（時間切れ/timeout）を主張する end_reason か（server duration での検証対象）。
export function claimsTimeLimit(reason: string | null | undefined): boolean {
  return reason === '時間切れ' || reason === 'timeout'
}

// session が発火する終了トリガー（表示/意味づけの単位）。
export type EndTrigger = '全質問完了' | '時間切れ' | '自主終了' | 'disconnected'

export interface EndOutcome {
  endReason: string // DB interviews.end_reason（CHECK 許可値）
  finalStatus: 'completed' | 'cancelled'
  isNormalCompletion: boolean // true = complete フロー（uploading→complete）／false = /ended（中断/technical）
}

export function resolveEndOutcome(trigger: EndTrigger): EndOutcome {
  switch (trigger) {
    case '全質問完了':
      return { endReason: '全質問完了', finalStatus: 'completed', isNormalCompletion: true }
    case '時間切れ':
      // 面接時間の上限まで正常に提供＝正常完了（途中離脱ではない）。全質問未消化でも completed。
      return { endReason: '時間切れ', finalStatus: 'completed', isNormalCompletion: true }
    case 'disconnected':
      // Realtime/接続の技術的失敗（provider terminal error・切断）。応募者の自主終了ではない＝非課金。
      return { endReason: 'disconnected', finalStatus: 'cancelled', isNormalCompletion: false }
    case '自主終了':
    default:
      // 応募者本人が明示的に面接をやめた（終了ボタン/明示的なタブ閉じ等）。applicant_exit。
      return { endReason: '自主終了', finalStatus: 'cancelled', isNormalCompletion: false }
  }
}

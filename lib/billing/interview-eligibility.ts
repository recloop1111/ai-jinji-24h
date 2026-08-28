// 面接1件の課金判定（純ロジック・DB/HTTP 非依存＝単体テスト可能）。**server-side でのみ使用**すること。
//   client 申告の is_billable は信用せず、server 権威の duration（started_at 由来）＋終了理由分類で判定する。
//
// 正式仕様（旧「開始後10分超で課金」は廃止・superseded）:
//   1 interview = 最大 1 billing unit。
//   A. 正常完了（completed）… 面接時間・質問数に関係なく必ず billable=true。
//   B. 応募者本人の途中離脱（applicant_exit）… duration>=180s かつ（main質問50%以上回答 or duration>=480s）。
//   C. それ以外（technical/system/forced/network/未確定）… billable=false。

// 終了理由の論理分類（既存 end_reason 値からの mapping。新しい DB enum は増やさない）。
export type TerminationCategory =
  | 'completed' // 正常完了（全質問完了）
  | 'time_limit' // 設定面接時間の上限まで正常に面接を提供した（時間切れ/timeout）＝サービス提供済み
  | 'applicant_exit' // 応募者本人による途中離脱（本人が途中でやめた）。課金は duration/回答率で別途判定
  | 'technical_failure' // 切断など技術的失敗
  | 'system_failure' // サーバ/システム失敗
  | 'forced_termination' // 不適切行為等による system 側強制終了
  | 'unknown' // 分類不能（安全側で非課金）

// {final_status, end_reason} → 分類。end_reason は既存 CHECK 許可値
//   （completed/user_ended/timeout/silence/inappropriate/disconnected/browser_closed/全質問完了/時間切れ/自主終了）。
//   ※ 時間切れ/timeout は「面接時間の上限まで提供」＝time_limit（サービス提供済み＝課金）。applicant_exit とは区別する。
export function classifyTermination(input: { finalStatus: string | null | undefined; endReason: string | null | undefined }): TerminationCategory {
  if (input.finalStatus === 'completed') return 'completed'
  const r = (input.endReason ?? '').trim()
  if (['時間切れ', 'timeout'].includes(r)) return 'time_limit' // 面接時間を最後まで提供＝正常提供
  // 応募者本人が途中でやめた（present していて離脱）。課金は duration/回答率ゲートで別途判定。
  if (['自主終了', 'user_ended', 'browser_closed', 'silence'].includes(r)) return 'applicant_exit'
  if (r === 'inappropriate') return 'forced_termination'
  if (r === 'disconnected') return 'technical_failure'
  // final_status='cancelled' で理由が null/不明 → 本人利用の確証がないため unknown（非課金）。
  return 'unknown'
}

// しきい値（調整可能な pure constants）。
export const BILLING_MIN_DURATION_SECONDS = 180 // 途中離脱で課金する最低利用時間（3分）
export const BILLING_ALT_DURATION_SECONDS = 480 // 50%未回答でも課金する利用時間（8分）

// main 質問の 50% ライン（必ず ceil）。total<=0 は null（判定不可）。
export function mainQuestionThreshold(totalMainQuestions: number | null | undefined): number | null {
  if (typeof totalMainQuestions !== 'number' || !Number.isFinite(totalMainQuestions) || totalMainQuestions <= 0) return null
  return Math.ceil(totalMainQuestions * 0.5)
}

// 課金可否（server-side 判定）。answered/total は「企業設定の main 質問のみ」（AI 深掘り/follow-up/turn は含めない）。
//   total 不明時は 50%ルールを適用せず、duration>=480s の applicant_exit のみ課金（固定値を推測しない）。
export function computeIsBillable(input: {
  category: TerminationCategory
  durationSeconds: number
  answeredMainQuestions: number | null | undefined
  totalMainQuestions: number | null | undefined
}): boolean {
  // A. 正常完了／面接時間の上限まで提供（time_limit）は、面接時間・質問数に関係なく必ず課金。
  if (input.category === 'completed' || input.category === 'time_limit') return true
  // C. 応募者本人の途中離脱以外（technical/system/forced/unknown）は課金しない。
  if (input.category !== 'applicant_exit') return false

  // B. 応募者本人の途中離脱: server 権威の duration で判定。
  const dur = Number.isFinite(input.durationSeconds) ? input.durationSeconds : 0
  if (dur < BILLING_MIN_DURATION_SECONDS) return false // 3分未満は非課金
  if (dur >= BILLING_ALT_DURATION_SECONDS) return true // 8分以上は回答率に依らず課金

  // 3〜8分: main質問 50%以上回答で課金。total 不明/answered 不明なら（8分未満のため）非課金。
  const threshold = mainQuestionThreshold(input.totalMainQuestions)
  if (threshold === null) return false
  const answered = input.answeredMainQuestions
  if (typeof answered !== 'number' || !Number.isFinite(answered)) return false
  return Math.floor(answered) >= threshold
}

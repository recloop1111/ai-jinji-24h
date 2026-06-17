// 応募者の表示用「現在状況」を導出する。
// DBの applicants.status は CHECK 制約により '準備中' / '完了' / '途中離脱' の3値のみ。
// 「面接中」は DB に保存せず、in_progress な interview が存在する場合に表示側で導出する。
//
// 優先順位:
//   applicants.status='完了'     → completed
//   applicants.status='途中離脱' → abandoned
//   applicants.status='準備中' かつ in_progress interview あり → in_progress（面接中）
//   それ以外（準備中・in_progress なし）→ preparing（準備中）

export type CurrentStatusKey = 'preparing' | 'in_progress' | 'completed' | 'abandoned'

export function deriveCurrentStatus(
  applicantStatus: string | null | undefined,
  hasInProgressInterview: boolean,
): CurrentStatusKey {
  if (applicantStatus === '完了') return 'completed'
  if (applicantStatus === '途中離脱') return 'abandoned'
  if (applicantStatus === '準備中' && hasInProgressInterview) return 'in_progress'
  return 'preparing'
}

export const CURRENT_STATUS_LABEL: Record<CurrentStatusKey, string> = {
  preparing: '準備中',
  in_progress: '面接中',
  completed: '完了',
  abandoned: '途中離脱',
}

// applicants.status（日本語）＋ in_progress 有無 から表示用の日本語ラベルを返す（admin 等の日本語ベース画面用）
export function deriveDisplayStatusJa(
  applicantStatus: string | null | undefined,
  hasInProgressInterview: boolean,
): string {
  return CURRENT_STATUS_LABEL[deriveCurrentStatus(applicantStatus, hasInProgressInterview)]
}

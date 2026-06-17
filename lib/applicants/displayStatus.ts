// 応募者の表示用「現在状況」を導出する。
// DBの applicants.status は CHECK 制約により '準備中' / '完了' / '途中離脱' の3値のみ。
// 「面接中」は DB に保存せず、最新 interview.status を正として表示側で導出する。
//
// 公開面接フローは anon で動作し、applicants.status を UPDATE できない（RLSで anon_update なし）。
// そのため公開フローの応募者では applicants.status は '準備中' のまま固定される。
// 進行状況の真の source は interviews.status（in_progress / completed / cancelled）であり、
// 当該応募者の「最新 interview」の status を用いて導出する（古い in_progress 孤児行に引っ張られない）。
//
// 優先順位:
//   applicants.status='完了'     → completed（seed/確定データを最優先）
//   applicants.status='途中離脱' → abandoned
//   最新 interview.status='in_progress' → in_progress（面接中）
//   最新 interview.status='completed'   → completed（正常完了）
//   最新 interview.status='cancelled'   → abandoned（途中離脱）
//   interview なし                      → preparing（準備中）

export type CurrentStatusKey = 'preparing' | 'in_progress' | 'completed' | 'abandoned'

export function deriveCurrentStatus(
  applicantStatus: string | null | undefined,
  latestInterviewStatus: string | null | undefined,
): CurrentStatusKey {
  if (applicantStatus === '完了') return 'completed'
  if (applicantStatus === '途中離脱') return 'abandoned'
  if (latestInterviewStatus === 'in_progress') return 'in_progress'
  if (latestInterviewStatus === 'completed') return 'completed'
  if (latestInterviewStatus === 'cancelled') return 'abandoned'
  return 'preparing'
}

export const CURRENT_STATUS_LABEL: Record<CurrentStatusKey, string> = {
  preparing: '準備中',
  in_progress: '面接中',
  completed: '完了',
  abandoned: '途中離脱',
}

// applicants.status（日本語）＋ 最新 interview.status から表示用の日本語ラベルを返す（admin等の日本語ベース画面用）
export function deriveDisplayStatusJa(
  applicantStatus: string | null | undefined,
  latestInterviewStatus: string | null | undefined,
): string {
  return CURRENT_STATUS_LABEL[deriveCurrentStatus(applicantStatus, latestInterviewStatus)]
}

// 選考結果（client portal の SoT）= applicants.result。
//   DB CHECK: result IN ('未対応','検討中','二次通過','不採用') DEFAULT '未対応'。
//   ※ 運営(admin)画面が使う applicants.selection_status（pending/considering/second_pass/rejected/hired）とは
//     別カラム・別体系（監査で確定）。client 側は list/dashboard/detail/CSV すべて result を参照する。
//   UI 内部キー（null/considering/second_pass/rejected）と DB 値の相互変換を1箇所に集約し、
//   画面ごとの直書きマッピングのドリフトを防ぐ。

export const SELECTION_RESULT_VALUES = ['未対応', '検討中', '二次通過', '不採用'] as const
export type SelectionResultValue = (typeof SELECTION_RESULT_VALUES)[number]

// UI 内部キー（null = 未対応）。既存 list/dashboard/detail が使ってきた表現。
export type SelectionResultKey = 'considering' | 'second_pass' | 'rejected' | null

export function isSelectionResultValue(v: unknown): v is SelectionResultValue {
  return typeof v === 'string' && (SELECTION_RESULT_VALUES as readonly string[]).includes(v)
}

// UI キー → DB 値（保存時に使用）。
export function resultKeyToValue(key: SelectionResultKey): SelectionResultValue {
  switch (key) {
    case 'considering': return '検討中'
    case 'second_pass': return '二次通過'
    case 'rejected': return '不採用'
    default: return '未対応' // null（未対応）
  }
}

// DB 値 → UI キー（読み込み時に使用）。未知値/未対応/null は null（未対応）。
export function resultValueToKey(value: string | null | undefined): SelectionResultKey {
  switch (value) {
    case '検討中': return 'considering'
    case '二次通過': return 'second_pass'
    case '不採用': return 'rejected'
    default: return null // '未対応' / null / 未知値
  }
}

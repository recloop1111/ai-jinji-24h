// 面接完了画面の表示用 純ロジック（UI/DOM 非依存＝単体テスト可能）。
//   会社名の解決（demo フォールバック）と、満足度送信の可否（二重送信防止）を提供する。
//   面接時間/質問数の表示値は completeSummary.ts（durationToMinutes / questionCountDisplay）を使用。

// demo / 会社名未取得時のフォールバック表示名（他の応募者画面と統一）。
export const DEMO_COMPANY_NAME = 'テスト株式会社'

// ヘッダー左上に出す会社名。未取得/空文字は demo 名にフォールバック（AIMEN24 は出さない）。
export function resolveCompanyName(name: string | null | undefined): string {
  const t = (name ?? '').trim()
  return t.length > 0 ? t : DEMO_COMPANY_NAME
}

// 満足度（1〜5）送信の可否。未選択/送信中/送信済みは不可＝二重送信を防止。
export function canSubmitRating(input: { rating: number; submitting: boolean; submitted: boolean }): boolean {
  return input.rating >= 1 && input.rating <= 5 && !input.submitting && !input.submitted
}

// ── 正常完了 / 中断 / 検証エラー の分岐（backend の interviews.status を「完了」の唯一の権威にする） ──
//   normal complete UI は「backend で completed を確認できた」ときだけ表示する。
//   sessionStorage summary は表示データの cache/fallback であって、「完了した事実」の Source of Truth にしない。
export type CompleteState = 'loading' | 'completed' | 'interrupted' | 'verification_error' | 'summary_error'
export type BackendStatusClass = 'completed' | 'other' | 'unknown'

// backend summary API 応答を分類。ok かつ status==='completed' のときだけ completed。
//   ok だが completed 以外（cancelled/in_progress/error/waiting）→ other。未取得/失敗 → unknown。
export function classifyBackendStatus(input: { ok: boolean; status: string | null | undefined }): BackendStatusClass {
  if (!input.ok) return 'unknown'
  return input.status === 'completed' ? 'completed' : 'other'
}

// 表示すべき状態を決定（backend 権威）。
//   - backend completed → 完了。ただし表示できるサマリーが皆無なら summary_error（中断とは区別する）。
//   - backend other（明示的に completed 以外の terminal/進行中）→ 中断（/ended）。
//   - backend unknown（通信失敗/未確認）→ verification_error（完了ともみなさず /ended へも飛ばさない・再確認）。
//     ※ local summary があっても unknown で「面接が完了しました」を表示しない（完了は backend でのみ確定）。
export function resolveCompleteState(input: {
  backendStatus: BackendStatusClass
  hasDisplayableSummary: boolean
}): CompleteState {
  if (input.backendStatus === 'completed') {
    return input.hasDisplayableSummary ? 'completed' : 'summary_error'
  }
  if (input.backendStatus === 'other') return 'interrupted'
  return 'verification_error'
}

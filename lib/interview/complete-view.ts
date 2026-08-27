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

// ── 正常完了 / 中断の分岐（backend の interviews.status を最優先） ──────────────
//   normal complete UI は「正式に completion が成立した」ときだけ表示する。
//   「面接画面を離れた」だけでは表示しない。sessionStorage を唯一の真実にしない（refresh/直アクセスで消える）。
export type CompleteState = 'loading' | 'completed' | 'interrupted'
export type BackendStatusClass = 'completed' | 'other' | 'unknown'

// backend summary API 応答を分類。ok かつ status==='completed' のときだけ completed。
//   ok だが completed 以外（cancelled/in_progress/error/waiting）→ other。未取得/失敗 → unknown。
export function classifyBackendStatus(input: { ok: boolean; status: string | null | undefined }): BackendStatusClass {
  if (!input.ok) return 'unknown'
  return input.status === 'completed' ? 'completed' : 'other'
}

// 表示すべき状態を決定。
//   - backend が completed → 完了（backend が唯一の権威）。
//   - backend が other（明示的に未完了）→ 中断（正常完了 UI を出さない）。
//   - backend unknown（ネットワーク不能/未確認）→ ローカル summary があれば完了扱い、無ければ中断。
//   さらに完了でも表示できるサマリー（面接時間・質問数のいずれか）が全く無い場合は中断へ倒す
//   （空の正常完了画面を出さない）。
export function resolveCompleteState(input: {
  backendStatus: BackendStatusClass
  hasLocalSummary: boolean
  hasDisplayableSummary: boolean
}): CompleteState {
  const completed =
    input.backendStatus === 'completed' || (input.backendStatus === 'unknown' && input.hasLocalSummary)
  if (!completed) return 'interrupted'
  // 正常完了でも表示できるサマリーが皆無なら、空の完了画面を出さず中断（safe）へ。
  return input.hasDisplayableSummary ? 'completed' : 'interrupted'
}

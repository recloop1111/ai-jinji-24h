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

// 面接の固定運用ポリシー（クライアント・サーバー双方から参照可能な共通定数）。
// 秘密情報・環境変数は入れない。'use client' は付けない（汎用 import 可）。
//
// 確定仕様:
//   - 面接最大時間 60分 / 残り時間警告 開始50分時点
//   - 全質問合計（icebreaker + evaluation + closing）最大15問
//   - evaluation 単体の最大10問は維持
//   - 録画保存期間 180日（※ R2 未接続。現状は「適用予定値」）
//   - 深掘り質問 最大1回/質問 は設計仕様だが未実装（実装済みとして扱わない）

export const MAX_INTERVIEW_MINUTES = 60
export const INTERVIEW_WARNING_MINUTES = 50

// 派生（秒）。session タイマー等で使用。
export const MAX_INTERVIEW_SECONDS = MAX_INTERVIEW_MINUTES * 60
export const INTERVIEW_WARNING_SECONDS = INTERVIEW_WARNING_MINUTES * 60
// 警告時点からの残り分数（表示文言用）。
export const INTERVIEW_WARNING_REMAINING_MINUTES = MAX_INTERVIEW_MINUTES - INTERVIEW_WARNING_MINUTES

// カテゴリ別の質問数上限。
export const MAX_ICEBREAKER_QUESTIONS = 2   // アイスブレイク
export const MAX_EVALUATION_QUESTIONS = 13  // 評価質問（evaluation）
export const MAX_CLOSING_QUESTIONS = 1      // クロージング
// 全質問合計の上限（icebreaker + evaluation + closing）。
export const MAX_TOTAL_QUESTIONS = 16

// 録画保存期間（日）。R2 未接続のため現状は適用予定値。
export const RECORDING_RETENTION_DAYS = 180

// 深掘り質問の上限（設計仕様）。未実装のため挙動には未反映（表示用の参考値）。
export const DEEP_DIVE_MAX_PER_QUESTION = 1

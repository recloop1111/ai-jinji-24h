// PR-19G: 企業管理画面「会話ログ」の Transcript 読み取りヘルパ（UI/DB 非依存＝単体テスト可能・純ロジック）。
//
// 目的: interview_transcripts の取得結果 → 表示 view への写像を 1 箇所に集約し、
//   ①final のみ・seq 昇順(PR-3 read model 再利用)②本番有効化前(テーブル未作成)は honest empty
//   ③実エラーは error state(DUMMY 補完なし)④UI と evaluation loader で SELECT 列を共有(query 二重定義しない)。
//
// 信頼境界: 実際の会社/応募者/面接スコープは「呼び出し側の取得経路」で担保する
//   （企業 UI = browser Supabase の RLS company_select_interview_transcripts ＋ interview_id 絞り込み、
//    evaluation = service-role loader が interviewId scope）。本モジュールは取得済み結果を写像するだけで、
//   companyId をブラウザ入力から信用しない（scope は取得層の責務）。本文(text)は log しない。

import { buildFinalTranscriptReadModel } from './transcript-view'
import type { TranscriptReadItem } from './transcript-read'

// interview_transcripts の read 用 SELECT 列。企業 UI(browser RLS) と evaluation(server loader) で共有し、
// 同一 query を二重定義してドリフトさせない。normalize が読む全フィールド(snake_case)を含む。
export const TRANSCRIPT_READ_COLUMNS = 'id, interview_id, speaker, text, seq, final, source, dedup_key, language, created_at'

// 「テーブル未作成(migration 未適用)」を error ではなく空として扱うための判定。
//   本番有効化前は interview_transcripts が存在しないため、企業画面で毎回「読み込めませんでした」と
//   誤警告しないよう、undefined_table(42P01) / PostgREST の relation 不在は honest empty に倒す。
export function isMissingTranscriptTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const msg = typeof e.message === 'string' ? e.message : ''
  return code === '42P01' || code === 'PGRST205' || /does not exist|find the table|schema cache/i.test(msg)
}

export interface TranscriptFetchView {
  items: TranscriptReadItem[]
  error: boolean
}

// Supabase 取得結果 → 表示 view。final-only / seq 昇順は buildFinalTranscriptReadModel(PR-3) が担保する。
//   - 実エラー(テーブル未作成を除く) → error state（items 空・DUMMY で埋めない）。
//   - 正常 or テーブル未作成 → read model（data 非配列/未作成は空＝honest empty）。
export function resolveTranscriptFetch(result: { data: unknown; error: unknown }): TranscriptFetchView {
  if (result.error && !isMissingTranscriptTableError(result.error)) {
    return { items: [], error: true }
  }
  return { items: buildFinalTranscriptReadModel(Array.isArray(result.data) ? result.data : []), error: false }
}

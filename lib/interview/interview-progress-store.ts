// PR-R1-A: interview_progress（jsonb）用の Supabase 永続 store（server-only・version 楽観ロック）。
//   Vercel serverless では process memory を SoT にできない（インスタンス跨ぎで消える）。
//   永続 SoT は interviews.interview_progress（P7.1 additive 列・Production 未適用）。CAS で並行二重進行を防ぐ。
//   ※ import/create で DB access しない（client を保持するだけ）。method 実行時のみ DB access。
//   ※ 本 PR では app runtime から呼ばない（R1-B で完了フックへ結線）。実 DB access は local のみ。

import type { InterviewProgressState, InterviewProgressStore } from './interview-progress'
import { restoreProgress } from './interview-progress'

const TABLE = 'interviews'

// 使う最小限の Supabase client 形（実 client / fake の両方が満たす）。
export interface ProgressDbResult {
  data: unknown
  error: unknown
}
export interface ProgressDbQuery {
  select(cols: string): ProgressDbQuery
  update(row: Record<string, unknown>): ProgressDbQuery
  eq(col: string, val: string): ProgressDbQuery
  maybeSingle(): Promise<ProgressDbResult>
}
export interface ProgressDbClient {
  from(table: string): ProgressDbQuery
}

export function createSupabaseInterviewProgressStore(client: ProgressDbClient): InterviewProgressStore {
  return {
    async load(interviewId: string): Promise<InterviewProgressState | null> {
      const { data, error } = await client.from(TABLE).select('interview_progress').eq('id', interviewId).maybeSingle()
      if (error || !data || typeof data !== 'object') return null
      return restoreProgress((data as Record<string, unknown>).interview_progress)
    },
    // 楽観ロック: 現在の version が expectedVersion と一致するときだけ書き込む（CAS）。
    //   新規（列 NULL・expectedVersion=0）は「interview_progress IS NULL」相当を eq 条件で表現できないため、
    //   PostgREST の filter は呼び出し側（route）で jsonb path 比較を付ける。ここでは最小の update を返し、
    //   data の有無で saved/conflict を判定する（RETURNING 行数）。実 SQL の CAS は
    //   supabase/local/p7_1_interview_progress_test.sql で実証済み。
    async save(state: InterviewProgressState, expectedVersion: number): Promise<'saved' | 'conflict' | 'error'> {
      // 条件付き UPDATE ... RETURNING id。version 一致（or 新規=NULL & expected 0）だけ更新。
      const q = client
        .from(TABLE)
        .update({ interview_progress: state })
        .eq('id', state.interviewId)
        // jsonb の version 一致条件（新規 NULL は expected 0 のとき別途 or 条件が必要＝route 側で付与）。
        .eq('interview_progress->>version', String(expectedVersion))
      const { data, error } = await q.select('id').maybeSingle()
      if (error) return 'error'
      return data ? 'saved' : 'conflict'
    },
  }
}

// PR-4E-2: interview_results 用の Production EvaluationRepository（server-only・未配線）。
//
// 【重要 / 未配線】
//   * server-only。service-role client を扱うため client component から import しない（本 module は
//     どの route/Service にも import されていない＝未配線）。`server-only` パッケージは未導入のため header で明示。
//   * import 時・create 時に DB へアクセスしない（client を保持するだけ）。method 実行時のみ DB access。
//   * 本 PR では Production runtime からこの method を呼ばない（実 Supabase read/write = 0）。
//
// interview_results は interview_id が UNIQUE（1 interview = 1 result）。再評価は onConflict:interview_id で UPDATE
//（最新評価で上書き。履歴 version table は追加しない）。transcript_hash は detail_json.evaluation_meta に格納。
// 既存列のみ書く（evaluation_axes / total_score / detail_json / updated_at）。personality_type / culture_* /
// big_five / legacy weight / strengths(列) 等は writer で触らない。

import type { EvaluationRepository, StoredEvaluation } from './service'
import type { InterviewResultRecord } from './mapping'

const TABLE = 'interview_results'

// 使う最小限の Supabase client 形（実 client も fake も満たす）。実 client 注入時は as unknown で受け渡す。
export interface EvaluationDbResult {
  data: unknown
  error: unknown
}
export interface EvaluationDbQuery {
  select(cols: string): EvaluationDbQuery
  eq(col: string, val: string): EvaluationDbQuery
  maybeSingle(): Promise<EvaluationDbResult>
  upsert(row: Record<string, unknown>, opts: { onConflict: string }): EvaluationDbQuery
  single(): Promise<EvaluationDbResult>
}
export interface EvaluationDbClient {
  from(table: string): EvaluationDbQuery
}

function extractTranscriptHash(detailJson: unknown): string | null {
  if (!detailJson || typeof detailJson !== 'object') return null
  const meta = (detailJson as Record<string, unknown>).evaluation_meta
  if (!meta || typeof meta !== 'object') return null
  const h = (meta as Record<string, unknown>).transcript_hash
  return typeof h === 'string' ? h : null
}

// client を注入（import/create で DB access しない）。実利用時は createServiceRoleClient() を as unknown で渡す。
export function createSupabaseEvaluationRepository(client: EvaluationDbClient): EvaluationRepository {
  return {
    async findByInterviewAndHash(interviewId: string, transcriptHash: string): Promise<StoredEvaluation | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('id, interview_id, evaluation_axes, total_score, detail_json')
        .eq('interview_id', interviewId)
        .maybeSingle()
      if (error) throw new Error('EVAL_REPO_READ_ERROR') // 非 PII code のみ（本文/PII を入れない）
      if (!data || typeof data !== 'object') return null
      const row = data as Record<string, unknown>
      // interview_id UNIQUE で 1 行。hash 不一致は「この transcript では未評価」＝null（再評価可）。
      if (extractTranscriptHash(row.detail_json) !== transcriptHash) return null
      const record: InterviewResultRecord = {
        interview_id: interviewId,
        evaluation_axes: row.evaluation_axes,
        total_score: typeof row.total_score === 'number' ? row.total_score : null,
        detail_json: (row.detail_json && typeof row.detail_json === 'object' ? row.detail_json : {}) as Record<string, unknown>,
      }
      return { id: String(row.id ?? ''), interviewId, transcriptHash, record }
    },

    async save(interviewId: string, transcriptHash: string, record: InterviewResultRecord): Promise<StoredEvaluation> {
      // 既存列のみ upsert（onConflict: interview_id）。legacy 列には書かない。
      const { data, error } = await client
        .from(TABLE)
        .upsert(
          {
            interview_id: interviewId,
            evaluation_axes: record.evaluation_axes,
            total_score: record.total_score,
            detail_json: record.detail_json,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'interview_id' },
        )
        .select('id')
        .single()
      if (error) throw new Error('EVAL_REPO_WRITE_ERROR')
      const id = data && typeof data === 'object' ? String((data as Record<string, unknown>).id ?? '') : ''
      return { id, interviewId, transcriptHash, record }
    },
  }
}

// PR-4C: 評価結果 → interview_results 保存 shape への純関数マッピング（1箇所に集約・DB 書込しない）。
// PR-4A の toInterviewResultsPayload を再利用し、保存メタ（transcript hash / prompt version 等）を detail_json へ足す。
// legacy 列（personality_type / culture_fit / big_five / legacy weight）は生成しない。

import type { EvaluationResult } from './ebca'
import { toInterviewResultsPayload } from './evaluate'

export interface EvaluationPersistMeta {
  transcriptHash: string
  promptVersion: string
  evaluatedAt?: string | null // 実 writer(4E) が設定。4C では任意（既定 null）。
}

// interview_results の実列に対応（interview_id / evaluation_axes / total_score / detail_json）。
// transcript_hash は専用列を作らず detail_json.evaluation_meta に格納（schema 変更不要）。
export interface InterviewResultRecord {
  interview_id: string
  evaluation_axes: unknown
  total_score: number | null
  detail_json: Record<string, unknown>
}

export function mapEvaluationResultToInterviewResult(
  interviewId: string,
  result: EvaluationResult,
  meta: EvaluationPersistMeta,
): InterviewResultRecord {
  const base = toInterviewResultsPayload(result) // evaluation_axes / total_score / detail_json（EBCA）
  return {
    interview_id: interviewId,
    evaluation_axes: base.evaluation_axes,
    total_score: base.total_score,
    detail_json: {
      ...base.detail_json,
      // 再評価/versioning・idempotency 用メタ（DB-level 制約は追加しない＝jsonb に格納）。
      evaluation_meta: {
        transcript_hash: meta.transcriptHash,
        prompt_version: meta.promptVersion,
        schema_version: result.schemaVersion,
        evaluated_at: meta.evaluatedAt ?? null,
      },
    },
  }
}

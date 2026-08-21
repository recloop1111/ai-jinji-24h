// PR-4A: EBCA 評価パイプライン（純ロジック・OpenAI/DB/UI 非依存）のオーケストレータと scoring。
//   receive(raw) → parse/validate(structure) → evidence 検証 → score 計算 → insufficient 判定 → 正規化結果。
// AI にはまだ評価させない（本ファイルは「AI が将来返す structured output を安全に受け取る」層）。

import {
  AXIS_SCORE_MAX,
  type EvaluationAxisResult,
  type EvaluationResult,
  type EvaluationTextItem,
  type EvaluationWarning,
  type OverallStatus,
} from './ebca'
import { parseEvaluationOutput } from './validation'
import { buildFinalUtteranceIndex, hasEvaluableTranscript, isValidEvidence, validateAxisEvidence } from './evidence'
import type { TranscriptReadItem } from '../interview/transcript-read'

// 総合点: 判定可能な軸（score!=null）のみを使い 100 点換算。丸めは Math.round に一本化（唯一の丸め箇所）。
// 判定可能軸ゼロ → null（score=null を 0 点として扱わない）。weight は導入しない（各軸等価）。
export function computeTotalScore(axes: readonly EvaluationAxisResult[]): number | null {
  const judged = axes.filter((a) => a.score !== null) as (EvaluationAxisResult & { score: number })[]
  if (judged.length === 0) return null
  const sum = judged.reduce((acc, a) => acc + a.score, 0)
  return Math.round((sum / (AXIS_SCORE_MAX * judged.length)) * 100)
}

// strengths/concerns の evidence も transcript で検証し、無効な evidence を落とす（text は保持）。
function validateTextItemsEvidence(
  items: readonly EvaluationTextItem[],
  index: Map<number, string>,
): EvaluationTextItem[] {
  return items.map((it) => ({ ...it, evidence: it.evidence.filter((ev) => isValidEvidence(ev, index)) }))
}

function dedupeWarnings(warnings: EvaluationWarning[]): EvaluationWarning[] {
  return Array.from(new Set(warnings))
}

// メイン: AI 出力（未検証 unknown）＋ PR-3 public read model（TranscriptReadItem[]・final 推奨）→ 正規化結果。
export function normalizeEvaluation(input: {
  raw: unknown
  transcript: readonly TranscriptReadItem[]
}): EvaluationResult {
  const { raw, transcript } = input
  const { draft, warnings } = parseEvaluationOutput(raw)
  const index = buildFinalUtteranceIndex(transcript ?? [])
  const evaluable = hasEvaluableTranscript(transcript ?? [])

  // strengths/concerns は draft があれば evidence 検証（無効 evidence は破棄）。
  const strengths = draft ? validateTextItemsEvidence(draft.strengths, index) : []
  const concerns = draft ? validateTextItemsEvidence(draft.concerns, index) : []
  const schemaVersion = draft?.schemaVersion ?? ''
  const summary = draft?.summary ?? null

  // 根本的に評価不能: raw が object でない（draft=null） or 評価入力が実質存在しない（final 応募者発話なし）。
  if (!draft || !evaluable) {
    // 評価入力が無いのに軸スコアを信用しない: 全軸を score=null へ正規化（0 化しない）。
    const nulledAxes: EvaluationAxisResult[] = (draft?.axes ?? []).map((a) => ({
      ...a,
      score: null,
      rank: null,
      evidence: [],
      insufficientReason: a.insufficientReason ?? '評価に十分な会話がなかったため判定を保留しました',
    }))
    if (!evaluable && (draft?.axes.length ?? 0) > 0) warnings.push('insufficient_evidence')
    return {
      schemaVersion: schemaVersion || 'ebca-1',
      overall: { status: 'insufficient_data', score: null, recommendation: null, confidence: draft?.overallConfidence ?? null },
      summary,
      axes: nulledAxes,
      strengths,
      concerns,
      warnings: dedupeWarnings(warnings),
    }
  }

  // 各軸に evidence-first を適用（有効 evidence 無しの score は null 化）。
  const axes = draft.axes.map((a) => validateAxisEvidence(a, index, warnings))
  const total = computeTotalScore(axes)
  const judgedCount = axes.filter((a) => a.score !== null).length

  // 面接全体の insufficient 判定は「評価可能軸ゼロ」のみを domain rule にする（明確な条件のみ）。
  // 「判定済み軸 < 2」等の policy threshold は 4B/4C で定数/seam として決める（ここで勝手に確定しない）。
  const status: OverallStatus = judgedCount === 0 ? 'insufficient_data' : 'ok'

  return {
    schemaVersion: draft.schemaVersion,
    overall: {
      status,
      score: status === 'ok' ? total : null,
      recommendation: status === 'ok' ? draft.recommendation : null,
      confidence: draft.overallConfidence,
    },
    summary,
    axes,
    strengths,
    concerns,
    warnings: dedupeWarnings(warnings),
  }
}

// 将来の DB マッピング可能性の確認（本 PR では DB 書込しない・純関数）。
// 既存列 interview_results.{evaluation_axes, total_score, detail_json} へ写像できることを示す。
// personality_type / culture_* 列は生成しない（触らない）。evidence は構造化 {seq,quote}（jsonb）。
export function toInterviewResultsPayload(result: EvaluationResult): {
  evaluation_axes: unknown
  total_score: number | null
  detail_json: Record<string, unknown>
} {
  return {
    evaluation_axes: result.axes.map((a) => ({
      axis: a.axisId,
      score: a.score,
      rank: a.rank,
      confidence: a.confidence,
      insufficient_reason: a.insufficientReason,
      evidence: a.evidence, // [{seq,quote}]（表示側 4D で構造化 evidence 対応が必要）
      comment: a.comment,
    })),
    total_score: result.overall.score,
    detail_json: {
      schema_version: result.schemaVersion,
      overall_status: result.overall.status,
      recommendation: result.overall.recommendation,
      overall_confidence: result.overall.confidence,
      summary: result.summary,
      strengths: result.strengths,
      concerns: result.concerns,
      warnings: result.warnings,
    },
  }
}

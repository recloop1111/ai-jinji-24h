// PR-4A: Evidence-first をコードで保証（純ロジック）。
// AI が返した各 evidence が「実在する final transcript 発話を参照し、quote がその本文に実在する」ことを検証する。
// hallucination（transcript に無い根拠）を弾き、score!=null の軸に有効 evidence が無ければ score を信用しない。
//
// PR-3 境界: transcript の内部 schema（StoredUtterance/dedup_key/source 等）は解釈しない。
//   受け取るのは PR-3 の public read model（TranscriptReadItem: id/speaker/text/seq/final/createdAt）のみ。

import { EVAL_LIMITS, type EvaluationAxisResult, type EvaluationEvidence, type EvaluationWarning } from './ebca'
import type { TranscriptReadItem } from '../interview/transcript-read'

// final 発話の seq → 本文 の索引（evidence の実在検証に使う）。final のみ（partial は根拠にしない）。
export function buildFinalUtteranceIndex(transcript: readonly TranscriptReadItem[]): Map<number, string> {
  const map = new Map<number, string>()
  if (!Array.isArray(transcript)) return map
  for (const it of transcript) {
    if (it && it.final === true && typeof it.text === 'string' && typeof it.seq === 'number') {
      map.set(it.seq, it.text)
    }
  }
  return map
}

// 評価入力が「実質存在する」か。final の応募者発話が1つも無ければ、AI が何を返しても評価しない。
export function hasEvaluableTranscript(transcript: readonly TranscriptReadItem[]): boolean {
  if (!Array.isArray(transcript)) return false
  return transcript.some((it) => it && it.final === true && it.speaker === 'applicant' && typeof it.text === 'string' && it.text.trim().length > 0)
}

// 1件の evidence が有効か（seq が final 発話に存在し、quote がその本文に実在＝部分文字列）。
export function isValidEvidence(ev: EvaluationEvidence, index: Map<number, string>): boolean {
  if (!ev || typeof ev.seq !== 'number' || typeof ev.quote !== 'string') return false
  const text = index.get(ev.seq)
  if (typeof text !== 'string') return false // 参照先 final 発話が存在しない（hallucination）
  const quote = ev.quote.trim()
  if (quote.length === 0 || quote.length > EVAL_LIMITS.quoteMax) return false
  // transcript 全文コピー防止 & 実在確認: quote は発話本文の部分文字列であること。
  return text.includes(quote)
}

// 軸の evidence を transcript で検証し、evidence-first を強制した軸へ正規化する。
//   - 無効 evidence（seq 不存在 / quote 不一致 / 空 / 過大）は破棄。
//   - score!=null かつ 有効 evidence 0件 → score=null / rank=null / insufficient_reason='insufficient_evidence'
//     （evidence 無しの点を信用しない。score=null を 0 化しない）。
export function validateAxisEvidence(
  axis: EvaluationAxisResult,
  index: Map<number, string>,
  warnings: EvaluationWarning[],
): EvaluationAxisResult {
  const validEvidence = axis.evidence.filter((ev) => isValidEvidence(ev, index))
  if (validEvidence.length < axis.evidence.length) {
    pushWarn(warnings, 'malformed_section_dropped') // 一部 evidence を破棄（hallucination/不一致）
  }
  if (axis.score !== null && validEvidence.length === 0) {
    pushWarn(warnings, 'insufficient_evidence')
    return {
      ...axis,
      score: null,
      rank: null,
      evidence: [],
      insufficientReason: axis.insufficientReason ?? 'evidence が不足しているため判定を保留しました',
    }
  }
  return { ...axis, evidence: validEvidence }
}

function pushWarn(warnings: EvaluationWarning[], w: EvaluationWarning) {
  if (!warnings.includes(w)) warnings.push(w)
}

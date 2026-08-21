// PR-4A: AI structured output（EBCA）を「安全に受け取る」防御的 parser（純ロジック・OpenAI/DB 非依存）。
// 方針:
//   - フィールド単位の graceful degradation: 不正な値（score 範囲外/NaN/Infinity/型不正）は crash させず null/破棄へ正規化。
//   - フィールド単位の strict: 6軸 allowlist 外の axis_id は破棄、保護属性/未知キーは domain へ写像しない（strip）。
//     いずれも黙殺せず warning を立てる（safe-ignore + surfaced）。全体 hard-reject にしないのは、実運用の AI 出力が
//     余剰キーを含みがちで、正当な評価を丸ごと失う方が有害なため。「受理するフィールドには strict、crash には robust」。
//   - evidence の transcript 実在検証は evidence.ts（transcript を要するためここでは構造検証のみ）。
// zod は依存に存在するが、上記の field 単位 graceful degradation は hand-rolled の方が明快なため型ガードで実装（新規依存なし）。

import {
  EBCA_AXIS_IDS,
  EBCA_SCHEMA_VERSION,
  EVAL_LIMITS,
  FORBIDDEN_EVAL_KEYS,
  isAxisRank,
  isConfidence,
  isEbcaAxisId,
  isRecommendation,
  isValidAxisScore,
  type EbcaAxisId,
  type EvaluationAxisResult,
  type EvaluationEvidence,
  type EvaluationTextItem,
  type EvaluationWarning,
  type Recommendation,
  type ConfidenceLevel,
} from './ebca'

// 構造検証だけ済んだ下書き（evidence の transcript 実在検証は未実施）。
export interface EvaluationDraft {
  schemaVersion: string
  summary: string | null
  axes: EvaluationAxisResult[]
  strengths: EvaluationTextItem[]
  concerns: EvaluationTextItem[]
  recommendation: Recommendation | null
  overallConfidence: ConfidenceLevel | null
}

export interface ParseOutput {
  // raw が object でない等・根本的に使えない場合は null（呼び出し側で insufficient_data 扱い）。
  draft: EvaluationDraft | null
  warnings: EvaluationWarning[]
}

// 文字列を安全に取り出し上限で切り詰め（超過は warning 用フラグを返す）。
function clampString(v: unknown, max: number): { value: string | null; truncated: boolean } {
  if (typeof v !== 'string') return { value: null, truncated: false }
  const trimmed = v.trim()
  if (trimmed.length === 0) return { value: null, truncated: false }
  if (trimmed.length > max) return { value: trimmed.slice(0, max), truncated: true }
  return { value: trimmed, truncated: false }
}

function pushOnce(warnings: EvaluationWarning[], w: EvaluationWarning) {
  if (!warnings.includes(w)) warnings.push(w)
}

// 任意のネスト構造に保護属性キーが含まれるかを浅く走査（深すぎる探索はしない＝oversized 防御）。
function scanForbiddenKeys(node: unknown, warnings: EvaluationWarning[], depth = 0): void {
  if (depth > 4 || !node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) scanForbiddenKeys(item, warnings, depth + 1)
    return
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (FORBIDDEN_EVAL_KEYS.includes(key.toLowerCase())) {
      pushOnce(warnings, 'protected_content_excluded')
    }
    scanForbiddenKeys((node as Record<string, unknown>)[key], warnings, depth + 1)
  }
}

// evidence 配列の構造検証（seq: int>=1 / quote: 非空 & <= quoteMax）。transcript 実在は evidence.ts。
function parseEvidenceArray(raw: unknown, warnings: EvaluationWarning[]): EvaluationEvidence[] {
  if (!Array.isArray(raw)) return []
  const out: EvaluationEvidence[] = []
  for (const item of raw) {
    if (out.length >= EVAL_LIMITS.evidencePerAxisMax) {
      pushOnce(warnings, 'oversized_content_truncated')
      break
    }
    if (!item || typeof item !== 'object') {
      pushOnce(warnings, 'malformed_section_dropped')
      continue
    }
    const o = item as Record<string, unknown>
    const seq = o.seq
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
      pushOnce(warnings, 'malformed_section_dropped')
      continue
    }
    // quote は「切り詰めず」検証: 空 or 過大（transcript 全文コピー疑い）は破棄する（truncate しない）。
    const quoteRaw = typeof o.quote === 'string' ? o.quote.trim() : ''
    if (quoteRaw.length === 0) {
      pushOnce(warnings, 'malformed_section_dropped')
      continue
    }
    if (quoteRaw.length > EVAL_LIMITS.quoteMax) {
      pushOnce(warnings, 'oversized_content_truncated')
      continue // 過大 quote は破棄（採用しない）
    }
    out.push({ seq, quote: quoteRaw })
  }
  return out
}

function parseAxis(raw: unknown, warnings: EvaluationWarning[]): { axisId: EbcaAxisId; axis: EvaluationAxisResult } | null {
  if (!raw || typeof raw !== 'object') {
    pushOnce(warnings, 'malformed_section_dropped')
    return null
  }
  const o = raw as Record<string, unknown>
  const axisIdRaw = o.axis_id ?? o.axisId ?? o.axis ?? o.key
  if (!isEbcaAxisId(axisIdRaw)) {
    pushOnce(warnings, 'unknown_axis_excluded')
    return null
  }
  const axisId = axisIdRaw

  // score: 0〜20 整数のみ。範囲外/NaN/Infinity/小数/型不正は null 正規化（0 化しない）。
  const score = isValidAxisScore(o.score) ? o.score : null
  // rank / confidence: allowlist のみ。外れは null。
  const rank = isAxisRank(o.rank) ? o.rank : null
  const confidence = isConfidence(o.confidence) ? o.confidence : null
  const { value: insufficientReason } = clampString(o.insufficient_reason ?? o.insufficientReason, EVAL_LIMITS.reasonMax)
  const { value: comment, truncated: cTrunc } = clampString(o.comment, EVAL_LIMITS.commentMax)
  if (cTrunc) pushOnce(warnings, 'oversized_content_truncated')
  const evidence = parseEvidenceArray(o.evidence, warnings)

  return {
    axisId,
    axis: { axisId, score, rank, confidence, insufficientReason, evidence, comment },
  }
}

function parseTextItems(raw: unknown, warnings: EvaluationWarning[]): EvaluationTextItem[] {
  if (!Array.isArray(raw)) return []
  const out: EvaluationTextItem[] = []
  for (const item of raw) {
    if (out.length >= EVAL_LIMITS.listItemsMax) {
      pushOnce(warnings, 'oversized_content_truncated')
      break
    }
    if (typeof item === 'string') {
      const { value, truncated } = clampString(item, EVAL_LIMITS.textItemMax)
      if (truncated) pushOnce(warnings, 'oversized_content_truncated')
      if (value) out.push({ text: value, evidence: [] })
      continue
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const { value, truncated } = clampString(o.text, EVAL_LIMITS.textItemMax)
      if (truncated) pushOnce(warnings, 'oversized_content_truncated')
      if (value) out.push({ text: value, evidence: parseEvidenceArray(o.evidence, warnings) })
      else pushOnce(warnings, 'malformed_section_dropped')
      continue
    }
    pushOnce(warnings, 'malformed_section_dropped')
  }
  return out
}

// AI structured output（未検証の unknown）→ 構造検証済み下書き + warnings。
export function parseEvaluationOutput(raw: unknown): ParseOutput {
  const warnings: EvaluationWarning[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    // 根本的に使えない（object でない）→ draft=null（呼び出し側で insufficient_data）。
    return { draft: null, warnings }
  }
  const o = raw as Record<string, unknown>

  // 保護属性/禁止フィールドの混入を走査（domain へは写像しない＝strip。存在すれば warning）。
  scanForbiddenKeys(o, warnings)

  // 未知トップレベルキー（受理する既知キー以外）を検出（strip + warning）。schema へは既知キーしか読まない。
  const KNOWN_TOP = new Set(['schema_version', 'schemaVersion', 'overall', 'summary', 'axes', 'strengths', 'concerns', 'warnings'])
  for (const key of Object.keys(o)) {
    if (!KNOWN_TOP.has(key) && !FORBIDDEN_EVAL_KEYS.includes(key.toLowerCase())) {
      pushOnce(warnings, 'unknown_fields_excluded')
      break
    }
  }

  // schema_version: 既知でなければ warning（下書きは作るが呼び出し側が判断できるよう記録）。
  const schemaVersionRaw = o.schema_version ?? o.schemaVersion
  const schemaVersion = typeof schemaVersionRaw === 'string' && schemaVersionRaw ? schemaVersionRaw : ''
  if (schemaVersion !== EBCA_SCHEMA_VERSION) pushOnce(warnings, 'unsupported_schema_version')

  // axes（配列のみ・6件超は異常）。同一 axis_id の重複は「後勝ちで統合」＋ warning。
  const axesRaw = Array.isArray(o.axes) ? o.axes : []
  if (Array.isArray(o.axes) && o.axes.length > EVAL_LIMITS.axesMax + 6) {
    // 明らかに過大な軸配列（異常出力）は先頭のみ見る（oversized 防御）。
    pushOnce(warnings, 'oversized_content_truncated')
  }
  const byAxis = new Map<EbcaAxisId, EvaluationAxisResult>()
  for (const a of axesRaw.slice(0, EVAL_LIMITS.axesMax + 6)) {
    const parsed = parseAxis(a, warnings)
    if (!parsed) continue
    if (byAxis.has(parsed.axisId)) pushOnce(warnings, 'duplicate_axis_merged')
    byAxis.set(parsed.axisId, parsed.axis) // 後勝ち統合
  }
  // 固定6軸の順序で整列（存在するものだけ）。
  const axes: EvaluationAxisResult[] = EBCA_AXIS_IDS.filter((id) => byAxis.has(id)).map((id) => byAxis.get(id)!)

  const overall = o.overall && typeof o.overall === 'object' ? (o.overall as Record<string, unknown>) : {}
  const recommendation = isRecommendation(overall.recommendation) ? overall.recommendation : null
  const overallConfidence = isConfidence(overall.confidence) ? overall.confidence : null

  const { value: summary, truncated: sTrunc } = clampString(o.summary, EVAL_LIMITS.summaryMax)
  if (sTrunc) pushOnce(warnings, 'oversized_content_truncated')

  const strengths = parseTextItems(o.strengths, warnings)
  const concerns = parseTextItems(o.concerns, warnings)

  return {
    draft: { schemaVersion: schemaVersion || EBCA_SCHEMA_VERSION, summary, axes, strengths, concerns, recommendation, overallConfidence },
    warnings,
  }
}

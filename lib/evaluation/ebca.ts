// PR-4A: EBCA（Evidence-based Competency Analysis）評価 domain（型 + 定数・LEAF・依存なし）。
// 既存仕様を唯一の権威にする: 固定6軸・質問非依存・各軸0〜20点（合計→100点換算）・score=null は「判断材料不足」。
// 企業別/求人別の軸・weight は導入しない。culture fit / Big Five / personality type を新評価へ復活させない。
// この層は純粋な型/定数のみ。OpenAI/DB/UI に一切依存しない。

export const EBCA_SCHEMA_VERSION = 'ebca-1'

// 固定6軸（唯一の権威。app/.../applicants/[id] の AXIS_LABELS と一致）。
export const EBCA_AXIS_IDS = [
  'communication',
  'logical_thinking',
  'initiative',
  'desire',
  'stress_tolerance',
  'integrity',
] as const
export type EbcaAxisId = (typeof EBCA_AXIS_IDS)[number]

// 軸の日本語表示名（表示 SoT。UI 側で再ハードコードしない＝ここを唯一の権威にする）。
export const EBCA_AXIS_LABELS: Record<EbcaAxisId, string> = {
  communication: 'コミュニケーション',
  logical_thinking: '論理的思考',
  initiative: '主体性・行動力',
  desire: '仕事意欲',
  stress_tolerance: 'ストレス耐性・柔軟性',
  integrity: '誠実性・一貫性',
}

// 採用担当者向けの軸の意味（1行）。過度な断定を避けた説明。表示は任意（情報過多を避ける）。
export const EBCA_AXIS_DEFINITIONS: Record<EbcaAxisId, string> = {
  communication: '相手の意図を汲み、分かりやすく伝える力',
  logical_thinking: '筋道立てて考え、根拠を示して説明する力',
  initiative: '自ら考え、行動を起こす力',
  desire: '仕事への意欲・目的意識',
  stress_tolerance: '困難や変化に柔軟に対応する力',
  integrity: '発言の一貫性・誠実さ',
}

// 軸 id → 表示名（未知 id は id 文字列 or 既定へフォールバック。UI が個別に辞書を持たないための唯一の入口）。
export function getAxisLabel(axisId: string | null | undefined): string {
  if (axisId && (EBCA_AXIS_LABELS as Record<string, string>)[axisId]) return (EBCA_AXIS_LABELS as Record<string, string>)[axisId]
  return axisId || '評価軸'
}

// 軸スコアは 0〜20 の整数 or null（null=判断材料不足。0 として扱わない）。
export const AXIS_SCORE_MIN = 0
export const AXIS_SCORE_MAX = 20

// 軸 rank は A〜E の allowlist。※ 0〜20 → rank の境界は既存仕様に定義が無いため domain では算出しない
//   （AI が返す rank を allowlist 検証のみ。総合 score(0-100)→grade は既存 lib/utils/scoreToGrade を表示側で使う）。
export const AXIS_RANKS = ['A', 'B', 'C', 'D', 'E'] as const
export type AxisRank = (typeof AXIS_RANKS)[number]

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number]

// 採用担当者向けの「推奨度＝判断材料」。AI による最終採否決定ではない（採用/不採用そのものではない）。
export const RECOMMENDATIONS = ['strong_yes', 'yes', 'neutral', 'no'] as const
export type Recommendation = (typeof RECOMMENDATIONS)[number]

export const OVERALL_STATUSES = ['ok', 'insufficient_data'] as const
export type OverallStatus = (typeof OVERALL_STATUSES)[number]

// oversized 出力防御の上限（1箇所に集約）。超過は「切り詰め or 破棄 + warning」で扱う。
export const EVAL_LIMITS = {
  quoteMax: 300, // 1 evidence の quote 上限（transcript 全文コピー防止）
  commentMax: 600,
  summaryMax: 2000,
  reasonMax: 300,
  textItemMax: 600, // strengths/concerns の 1 項目
  evidencePerAxisMax: 8,
  listItemsMax: 12, // strengths/concerns の件数
  axesMax: EBCA_AXIS_IDS.length, // 6 を超える軸配列は異常
} as const

// warnings は「自由文のゴミ箱」にしない。用途を限定した enum（PII/transcript 本文を複製しない）。
export const EVALUATION_WARNINGS = [
  'insufficient_evidence', // score!=null だが有効 evidence が無く null へ正規化した
  'protected_content_excluded', // 保護属性/禁止フィールドが入力に含まれ除外した
  'unknown_fields_excluded', // schema 外のキーを除外した
  'unknown_axis_excluded', // 6軸以外の axis_id を除外した
  'duplicate_axis_merged', // 同一 axis_id が重複したため1件へ統合した
  'malformed_section_dropped', // summary/strengths/concerns 等の壊れた任意セクションを落とした
  'oversized_content_truncated', // 上限超過を切り詰めた
  'unsupported_schema_version', // schema_version が未知
] as const
export type EvaluationWarning = (typeof EVALUATION_WARNINGS)[number]

// ── domain 型（camelCase・UI/評価入力の内部形。DB マッピングは 4C/4D）─────────────────
// 将来のマッピング先: axes → interview_results.evaluation_axes / overall.score → total_score /
//   summary・strengths・concerns・recommendation・warnings・メタ → detail_json。
//   personality_type / culture_* 列は触らない（本 domain に該当フィールドを持たない）。

export interface EvaluationEvidence {
  seq: number // 参照する final transcript 発話の seq（>=1）
  quote: string // その発話本文に実在する短い引用（<= quoteMax）
}

export interface EvaluationAxisResult {
  axisId: EbcaAxisId
  score: number | null // 0〜20 | null（null=判断材料不足。0 化しない）
  rank: AxisRank | null // AI 提供 allowlist のみ（算出しない）
  confidence: ConfidenceLevel | null
  insufficientReason: string | null
  evidence: EvaluationEvidence[]
  comment: string | null
}

export interface EvaluationTextItem {
  text: string
  evidence: EvaluationEvidence[]
}

export interface EvaluationOverall {
  status: OverallStatus
  score: number | null // 0〜100 | null（判定済み軸のみ100換算）
  recommendation: Recommendation | null // 判断材料。採否決定ではない
  confidence: ConfidenceLevel | null
}

export interface EvaluationResult {
  schemaVersion: string
  overall: EvaluationOverall
  summary: string | null
  axes: EvaluationAxisResult[]
  strengths: EvaluationTextItem[]
  concerns: EvaluationTextItem[]
  warnings: EvaluationWarning[]
}

// ── 保護属性/禁止フィールド（新 EBCA 評価フィールドとして受理しない）──────────────────────
// これらのキーが AI 出力に含まれても domain フィールドへ写像しない（strip）＋ warning を立てる。
// culture fit / Big Five / personality type / センシティブ属性を評価へ復活させないための seam。
export const FORBIDDEN_EVAL_KEYS: readonly string[] = [
  'personality_type',
  'personalitytype',
  'culture_fit',
  'culture_fit_score',
  'culture_fit_detail',
  'big_five',
  'big_five_scores',
  'bigfive',
  'age',
  'birthdate',
  'birthplace',
  'gender',
  'sex',
  'nationality',
  'race',
  'ethnicity',
  'religion',
  'disability',
  'family',
  'marital_status',
  'address',
  'photo',
  'appearance',
]

// 型ガード（allowlist）
export function isEbcaAxisId(v: unknown): v is EbcaAxisId {
  return typeof v === 'string' && (EBCA_AXIS_IDS as readonly string[]).includes(v)
}
export function isAxisRank(v: unknown): v is AxisRank {
  return typeof v === 'string' && (AXIS_RANKS as readonly string[]).includes(v)
}
export function isConfidence(v: unknown): v is ConfidenceLevel {
  return typeof v === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(v)
}
export function isRecommendation(v: unknown): v is Recommendation {
  return typeof v === 'string' && (RECOMMENDATIONS as readonly string[]).includes(v)
}
// 軸スコア: 0〜20 の整数のみ有効。NaN/Infinity/小数/範囲外は無効（→ 呼び出し側で null 正規化）。
export function isValidAxisScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= AXIS_SCORE_MIN && v <= AXIS_SCORE_MAX
}

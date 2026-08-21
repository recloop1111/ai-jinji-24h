// PR-4D: EBCA 評価の「表示用モデル」（純ロジック・UI/DB 非依存＝単体テスト可能）。
// interview_results 行（evaluation_axes / total_score / detail_json）→ 画面が安全に描画できる display model へ正規化する。
// PR-4A の構造化 evidence {seq,quote} と legacy string[] evidence の両方を安全に扱う（後方互換）。
// score=null は 0 化しない（「評価材料不足」）。AI の断定的採否ではなく「判断材料」として見せるためのラベルも用意。
// 本文は console/log へ出さない。HTML は生成しない（表示側 React の通常レンダリングのみ）。

import {
  EBCA_AXIS_IDS,
  isEbcaAxisId,
  isRecommendation,
  isConfidence,
  isValidAxisScore,
  type EbcaAxisId,
  type ConfidenceLevel,
  type Recommendation,
} from './ebca'
import { scoreToGrade } from '../utils/scoreToGrade'

// UI ラベル（唯一の真実）。app 側 AXIS_LABELS と一致。
export const EBCA_AXIS_LABELS_JA: Record<EbcaAxisId, string> = {
  communication: 'コミュニケーション',
  logical_thinking: '論理的思考',
  initiative: '主体性・行動力',
  desire: '仕事意欲',
  stress_tolerance: 'ストレス耐性・柔軟性',
  integrity: '誠実性・一貫性',
}

// recommendation は「採用/不採用」ではなく採用担当者向けの判断材料であることが分かる日本語にする。
const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  strong_yes: '非常に前向きな判断材料',
  yes: '前向きな判断材料',
  neutral: '追加確認を推奨',
  no: '慎重な確認を推奨',
}
const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = { high: '高', medium: '中', low: '低' }

export function recommendationDisplay(rec: unknown): string | null {
  return isRecommendation(rec) ? RECOMMENDATION_LABELS[rec] : null
}
export function confidenceDisplay(conf: unknown): string | null {
  return isConfidence(conf) ? CONFIDENCE_LABELS[conf] : null
}
// 軸スコア表示: 0〜20 の整数のみ数値、それ以外（null 含む）は「—」。0 と null を区別する。
export function axisScoreText(score: number | null): string {
  return isValidAxisScore(score) ? String(score) : '—'
}

export interface EvidenceDisplay {
  quote: string
  seq: number | null // 構造化 evidence は会話 #seq、legacy string は null
}
export interface AxisDisplay {
  axisId: EbcaAxisId
  label: string
  score: number | null
  rank: string | null
  confidence: ConfidenceLevel | null
  confidenceText: string | null
  insufficientReason: string | null
  comment: string | null
  evidence: EvidenceDisplay[]
}
export interface TextItemDisplay {
  text: string
  evidence: EvidenceDisplay[]
}
export interface EvaluationDisplayModel {
  status: 'ok' | 'insufficient_data'
  totalScore: number | null // 0〜100 | null（insufficient 時は必ず null）
  grade: string | null // 既存 scoreToGrade（0-100）。score があるときのみ
  recommendation: Recommendation | null
  recommendationText: string | null
  confidence: ConfidenceLevel | null
  confidenceText: string | null
  summary: string | null
  axes: AxisDisplay[]
  strengths: TextItemDisplay[]
  concerns: TextItemDisplay[]
}

const EVIDENCE_MAX = 8
const QUOTE_MAX = 300

function normalizeEvidence(raw: unknown): EvidenceDisplay[] {
  if (!Array.isArray(raw)) return []
  const out: EvidenceDisplay[] = []
  for (const e of raw) {
    if (out.length >= EVIDENCE_MAX) break
    if (typeof e === 'string') {
      const q = e.trim()
      if (q && q.length <= QUOTE_MAX) out.push({ quote: q, seq: null }) // legacy string[]
    } else if (e && typeof e === 'object') {
      const o = e as Record<string, unknown>
      const q = typeof o.quote === 'string' ? o.quote.trim() : ''
      if (!q || q.length > QUOTE_MAX) continue
      const seq = typeof o.seq === 'number' && Number.isInteger(o.seq) && o.seq >= 1 ? o.seq : null
      out.push({ quote: q, seq })
    }
  }
  return out
}

function str(v: unknown, max = 4000): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

function normalizeAxes(raw: unknown): AxisDisplay[] {
  const byId = new Map<EbcaAxisId, AxisDisplay>()
  const items = Array.isArray(raw) ? raw : []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const idRaw = o.axis ?? o.axis_id ?? o.key
    if (!isEbcaAxisId(idRaw)) continue
    const axisId = idRaw
    const score = isValidAxisScore(o.score) ? (o.score as number) : null
    const confidence = isConfidence(o.confidence) ? o.confidence : null
    byId.set(axisId, {
      axisId,
      label: EBCA_AXIS_LABELS_JA[axisId],
      score,
      rank: typeof o.rank === 'string' && o.rank ? o.rank : null,
      confidence,
      confidenceText: confidence ? CONFIDENCE_LABELS[confidence] : null,
      insufficientReason: str(o.insufficient_reason ?? o.insufficientReason, 300),
      comment: str(o.comment, 600),
      evidence: normalizeEvidence(o.evidence),
    })
  }
  // 固定6軸の順に、存在するものだけ。
  return EBCA_AXIS_IDS.filter((id) => byId.has(id)).map((id) => byId.get(id)!)
}

function normalizeTextItems(raw: unknown): TextItemDisplay[] {
  if (!Array.isArray(raw)) return []
  const out: TextItemDisplay[] = []
  for (const item of raw) {
    if (out.length >= 12) break
    if (typeof item === 'string') {
      const t = str(item, 600)
      if (t) out.push({ text: t, evidence: [] })
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const t = str(o.text, 600)
      if (t) out.push({ text: t, evidence: normalizeEvidence(o.evidence) })
    }
  }
  return out
}

// interview_results 行 → display model。評価が実質存在しなければ null（呼び出し側で空状態）。
// row は any DB 形（snake_case）。legacy 列（strengths/improvement_points/summary_text）にも後方互換で対応。
export function buildEvaluationDisplayModel(row: unknown): EvaluationDisplayModel | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const detail = (r.detail_json && typeof r.detail_json === 'object' ? r.detail_json : {}) as Record<string, unknown>

  const axes = normalizeAxes(r.evaluation_axes)
  const summary = str(detail.summary) ?? str(r.summary_text)
  // strengths/concerns: 新 detail_json（{text,evidence}[]）優先、無ければ legacy 列（string[]）。
  const strengths = detail.strengths !== undefined ? normalizeTextItems(detail.strengths) : normalizeTextItems(r.strengths)
  const concerns = detail.concerns !== undefined ? normalizeTextItems(detail.concerns) : normalizeTextItems(r.improvement_points)

  const rawTotal = typeof r.total_score === 'number' && Number.isFinite(r.total_score) ? Math.round(r.total_score) : null
  const judged = axes.filter((a) => a.score !== null).length

  // status: detail_json.overall_status を優先。無ければ導出（判定軸ありなら ok、無ければ insufficient）。
  const declaredStatus = detail.overall_status === 'ok' || detail.overall_status === 'insufficient_data' ? detail.overall_status : null
  const hasAnyContent = axes.length > 0 || rawTotal !== null || summary !== null || strengths.length > 0 || concerns.length > 0
  if (!hasAnyContent) return null // 評価が実質存在しない → 空状態

  const status: 'ok' | 'insufficient_data' = declaredStatus ?? (judged > 0 ? 'ok' : 'insufficient_data')

  // insufficient_data 時は総合点・recommendation を出さない（0 化しない＝null のまま）。
  const totalScore = status === 'ok' ? rawTotal : null
  const grade = totalScore !== null ? scoreToGrade(totalScore) : null
  const recommendation = status === 'ok' && isRecommendation(detail.recommendation) ? detail.recommendation : null
  const confidence = isConfidence(detail.overall_confidence) ? detail.overall_confidence : null

  return {
    status,
    totalScore,
    grade,
    recommendation,
    recommendationText: recommendationDisplay(recommendation),
    confidence,
    confidenceText: confidence ? CONFIDENCE_LABELS[confidence] : null,
    summary,
    axes,
    strengths,
    concerns,
  }
}

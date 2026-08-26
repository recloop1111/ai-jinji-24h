// PR-P6: EBCA 評価結果を企業管理画面で安全に表示するための「表示用 view-model」（純ロジック・UI 非依存）。
//   目的:
//     * P4/P5 の保存形式（evaluation_axes[].evidence = [{seq, quote}]）と、旧 UI/legacy の string[] evidence の
//       両方を読める backward-compatible normalizer を 1 箇所に集約する（UI 側でフォーマット分岐を書かない）。
//     * score=null（判断材料不足）を絶対に 0 点として扱わない（null と 0 を別物として保持）。
//     * 表示名/軸定義は ebca.ts の SoT を利用（UI で再ハードコードしない）。
//     * protected 属性（性別/年齢/住所 等）は入力にあっても view-model に取り込まない（読むキーを限定）。
//   本 module は React/DOM に依存しない純関数のみ（vitest で render logic を検証可能）。

import {
  CONFIDENCE_LEVELS,
  EBCA_AXIS_IDS,
  getAxisLabel,
  isConfidence,
  type ConfidenceLevel,
  type EbcaAxisId,
} from './ebca'

// ── evidence（新旧両形式を吸収した表示用）─────────────────────────────────────────────────────
//   新形式: { seq:number, quote:string } … quote を根拠本文として表示、seq は「発話 #N」の補助表示に使う。
//   旧形式: string … seq を持たない従来の根拠テキスト（{ seq:null, quote:string } へ写像）。
export interface DisplayEvidence {
  seq: number | null
  quote: string
}

// invalid（quote 空 / 型不正 / seq が正整数でない 等）は「捨てる」＝正式な根拠として誤表示しない・crash しない。
export function normalizeEvidence(raw: unknown): DisplayEvidence[] {
  if (!Array.isArray(raw)) return []
  const out: DisplayEvidence[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const q = item.trim()
      if (q.length > 0) out.push({ seq: null, quote: q })
      continue
    }
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const quoteRaw = typeof o.quote === 'string' ? o.quote : typeof o.text === 'string' ? o.text : ''
      const q = quoteRaw.trim()
      if (q.length === 0) continue // quote 無しは根拠として表示しない
      const seq = typeof o.seq === 'number' && Number.isInteger(o.seq) && o.seq >= 1 ? o.seq : null
      out.push({ seq, quote: q })
    }
  }
  return out
}

// ── 軸（表示用）───────────────────────────────────────────────────────────────────────────────
export interface DisplayAxis {
  axisId: string | null // 既知 EbcaAxisId or null（未知/legacy）
  label: string
  score: number | null // 0..20 | null（null=判断材料不足。0 とは別物）
  rank: string | null
  confidence: ConfidenceLevel | null
  insufficientReason: string | null
  evidence: DisplayEvidence[]
  known: boolean // EBCA 6軸 SoT に含まれる id か
}

const KNOWN_AXIS = new Set<string>(EBCA_AXIS_IDS as readonly string[])

function toScore(v: unknown): number | null {
  // 有限数のみ採用（NaN/Infinity/型不正 → null）。0 は正当な値として保持（null と混同しない）。
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function buildAxis(axisId: string | null, labelRaw: unknown, o: {
  score?: unknown; rank?: unknown; evidence?: unknown; confidence?: unknown; insufficientReason?: unknown
}): DisplayAxis {
  const explicitLabel = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : null
  // 既知 id は SoT ラベルを最優先（UI が別辞書を持たない）。未知は explicit label → id → 既定。
  const label = axisId && KNOWN_AXIS.has(axisId) ? getAxisLabel(axisId) : explicitLabel ?? getAxisLabel(axisId)
  const rank = typeof o.rank === 'string' && o.rank.trim() ? o.rank.trim() : null
  return {
    axisId: axisId && KNOWN_AXIS.has(axisId) ? axisId : null,
    label,
    score: toScore(o.score),
    rank,
    confidence: isConfidence(o.confidence) ? o.confidence : null,
    insufficientReason: typeof o.insufficientReason === 'string' && o.insufficientReason.trim() ? o.insufficientReason.trim() : null,
    evidence: normalizeEvidence(o.evidence),
    known: !!(axisId && KNOWN_AXIS.has(axisId)),
  }
}

// interview_results.evaluation_axes を表示用へ正規化。読むキーを限定（protected 属性は取り込まない）。
//   主形式: [{ axis|axis_id|key, label?, score|value, rank, evidence, confidence, insufficient_reason }]
//   旧形式: [{ label, value }] / オブジェクト { key: number }
// 想定外/空/null → []（crash しない・DUMMY 補完しない）。
export function normalizeEvaluationAxesForDisplay(raw: unknown): DisplayAxis[] {
  if (!raw || typeof raw !== 'object') return []
  const out: DisplayAxis[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const axisId =
        typeof o.axis === 'string' ? o.axis : typeof o.axis_id === 'string' ? o.axis_id : typeof o.key === 'string' ? o.key : null
      out.push(
        buildAxis(axisId, o.label ?? o.name, {
          score: o.score ?? o.value,
          rank: o.rank,
          evidence: o.evidence,
          confidence: o.confidence,
          insufficientReason: o.insufficient_reason ?? o.insufficientReason,
        }),
      )
    }
  } else {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      out.push(buildAxis(key, undefined, { score: val }))
    }
  }
  return out
}

// ── confidence（評価確度）: 「評価の確からしさ/根拠量」であり応募者能力の高低ではない ───────────────
export const CONFIDENCE_DISPLAY_LABEL = '評価確度'
export const CONFIDENCE_HINT = '評価確度は根拠の量・確かさを示す指標です（応募者の能力の高低ではありません）。'
const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = { high: '高', medium: '中', low: '低' }
export function confidenceText(c: ConfidenceLevel | null | undefined): string | null {
  return c && isConfidence(c) ? CONFIDENCE_TEXT[c] : null
}
export { CONFIDENCE_LEVELS }

// ── 評価表示の全体状態（Task 8: A 正常 / B 一部不能 / C 全不能 / D 未実施 / E legacy のみ / F malformed）─────
//   企業ユーザーには内部エラーコードを見せない前提で、UI 文言はこの kind から決める。
export type EvaluationDisplayKind =
  | 'normal' // A: 判定済み軸あり・全軸判定済み
  | 'partial' // B: 一部の軸のみ判断材料不足
  | 'all_insufficient' // C: 全軸が判断材料不足
  | 'not_evaluated' // D: まだ評価が無い（空/未実施）
  | 'legacy_only' // E: EBCA 軸は無いが legacy 評価テキストはある
  | 'malformed' // F: データはあるが構造として使えない（UIは中立表現・エラーコードは出さない）

export interface EvaluationDisplayState {
  kind: EvaluationDisplayKind
  axes: DisplayAxis[]
  judgedCount: number // score!=null の軸数
  insufficientCount: number // score==null の軸数
}

// raw が「存在するが軸を1つも生成できない」= malformed 候補（string/number/壊れた配列 等）。空配列/空オブジェクトは未実施扱い。
function rawIsMalformed(raw: unknown, axesLen: number): boolean {
  if (axesLen > 0) return false
  if (raw == null) return false
  if (Array.isArray(raw)) return raw.length > 0 // 要素はあるが全て軸化できない → malformed
  if (typeof raw === 'object') return false // 空/未知オブジェクトは未実施寄り（中立）
  return true // string/number 等が入っている → malformed
}

export function resolveEvaluationDisplayState(input: {
  evaluationAxes: unknown
  hasLegacyEvaluation?: boolean
}): EvaluationDisplayState {
  const axes = normalizeEvaluationAxesForDisplay(input.evaluationAxes)
  const judgedCount = axes.filter((a) => a.score !== null).length
  const insufficientCount = axes.length - judgedCount

  let kind: EvaluationDisplayKind
  if (axes.length === 0) {
    if (rawIsMalformed(input.evaluationAxes, 0)) kind = 'malformed'
    else if (input.hasLegacyEvaluation) kind = 'legacy_only'
    else kind = 'not_evaluated'
  } else if (judgedCount === 0) {
    kind = 'all_insufficient'
  } else if (insufficientCount > 0) {
    kind = 'partial'
  } else {
    kind = 'normal'
  }
  return { kind, axes, judgedCount, insufficientCount }
}

// 表示用の軸並び（既知 6 軸は SoT 順、未知は後ろ）。表示の安定のため。
export function sortAxesForDisplay(axes: readonly DisplayAxis[]): DisplayAxis[] {
  const order = new Map<string, number>(EBCA_AXIS_IDS.map((id, i) => [id, i]))
  return [...axes].sort((a, b) => {
    const ai = a.axisId ? order.get(a.axisId) ?? 100 : 100
    const bi = b.axisId ? order.get(b.axisId) ?? 100 : 100
    return ai - bi
  })
}

// 型 re-export（UI が ebca を直接 import せず済むよう）。
export type { EbcaAxisId, ConfidenceLevel }

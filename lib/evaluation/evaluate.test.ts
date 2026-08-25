import { describe, it, expect } from 'vitest'
import { computeTotalScore, normalizeEvaluation, toInterviewResultsPayload } from './evaluate'
import { EBCA_AXIS_IDS, EVAL_LIMITS, type EvaluationAxisResult } from './ebca'
import type { TranscriptReadItem } from '../interview/transcript-read'

// PR-4A: EBCA パイプライン統合（synthetic のみ・OpenAI/DB なし）。ラベルは仕様の必須シナリオ A〜X に対応。
const T = (over: Partial<TranscriptReadItem>): TranscriptReadItem => ({
  id: 'x', speaker: 'applicant', text: 't', seq: 1, final: true, createdAt: null, ...over,
})
const transcript: TranscriptReadItem[] = [
  T({ id: '1', speaker: 'interviewer', text: '本日はよろしくお願いします。', seq: 1 }),
  T({ id: '2', speaker: 'applicant', text: 'よろしくお願いします。', seq: 2 }),
  T({ id: '3', speaker: 'interviewer', text: '営業で工夫したことは？', seq: 3 }),
  T({ id: '4', speaker: 'applicant', text: '顧客ごとに課題を整理して提案内容を変えていました。', seq: 4 }),
]
const ev = [{ seq: 4, quote: '提案内容を変えていました' }]
const axis = (axis_id: string, score: number | null, extra: Record<string, unknown> = {}) => ({
  axis_id, score, rank: 'B', confidence: 'high', evidence: score === null ? [] : ev, comment: 'c', ...extra,
})
const sixAxes = (score: number) => EBCA_AXIS_IDS.map((id) => axis(id, score))

function run(rawAxes: unknown[], over: Record<string, unknown> = {}, tr: TranscriptReadItem[] = transcript) {
  return normalizeEvaluation({ raw: { schema_version: 'ebca-1', overall: { recommendation: 'yes', confidence: 'medium' }, axes: rawAxes, ...over }, transcript: tr })
}

describe('computeTotalScore (weight なし・判定軸のみ100換算・丸め一本化)', () => {
  it('W: [16,12,18] → round(46/60*100)=77', () => {
    const axes = [16, 12, 18].map((s, i) => ({ axisId: EBCA_AXIS_IDS[i], score: s } as EvaluationAxisResult))
    expect(computeTotalScore(axes)).toBe(77)
  })
  it('V: null は 0 扱いしない（[10,null] → 50 ではなく 50=10/20）', () => {
    const axes = [{ axisId: EBCA_AXIS_IDS[0], score: 10 }, { axisId: EBCA_AXIS_IDS[1], score: null }] as EvaluationAxisResult[]
    expect(computeTotalScore(axes)).toBe(50) // 10/(20*1)*100
  })
  it('境界: score 0/20 は判定軸（[0,20] → 50）', () => {
    const axes = [{ axisId: EBCA_AXIS_IDS[0], score: 0 }, { axisId: EBCA_AXIS_IDS[1], score: 20 }] as EvaluationAxisResult[]
    expect(computeTotalScore(axes)).toBe(50)
  })
  it('X: 判定可能軸ゼロ → null', () => {
    expect(computeTotalScore([{ axisId: EBCA_AXIS_IDS[0], score: null }] as EvaluationAxisResult[])).toBeNull()
  })
})

describe('normalizeEvaluation — 必須シナリオ', () => {
  it('A: 正常6軸 → axes6・status ok・total 計算', () => {
    const r = run(sixAxes(15))
    expect(r.axes).toHaveLength(6)
    expect(r.overall.status).toBe('ok')
    expect(r.overall.score).toBe(75) // 90/120*100
    expect(r.overall.recommendation).toBe('yes')
  })

  it('B: 一部軸 null → total から除外', () => {
    const raw = [axis('communication', 16), axis('logical_thinking', null), axis('initiative', 12)]
    const r = run(raw)
    const judged = r.axes.filter((a) => a.score !== null)
    expect(judged).toHaveLength(2)
    expect(r.overall.score).toBe(70) // (16+12)/40*100
  })

  it('C: 全軸 null → total null・insufficient_data', () => {
    const r = run([axis('communication', null), axis('desire', null)])
    expect(r.overall.score).toBeNull()
    expect(r.overall.status).toBe('insufficient_data')
    expect(r.overall.recommendation).toBeNull()
  })

  it('D: transcript 空 → insufficient・全軸 null（0化しない）', () => {
    const r = run(sixAxes(15), {}, [])
    expect(r.overall.status).toBe('insufficient_data')
    expect(r.overall.score).toBeNull()
    expect(r.axes.every((a) => a.score === null)).toBe(true)
  })

  it('E: 応募者 final 発話なし → insufficient', () => {
    const onlyInterviewer = [T({ speaker: 'interviewer', text: 'q', seq: 1 })]
    const r = run(sixAxes(15), {}, onlyInterviewer)
    expect(r.overall.status).toBe('insufficient_data')
  })

  it('F: evidence seq 不存在 → その score は信用されず null', () => {
    const r = run([axis('communication', 16, { evidence: [{ seq: 99, quote: 'x' }] })])
    expect(r.axes[0].score).toBeNull()
  })

  it('G: evidence quote 不一致 → null', () => {
    const r = run([axis('communication', 16, { evidence: [{ seq: 4, quote: '海外MBAを取得' }] })])
    expect(r.axes[0].score).toBeNull()
  })

  it('H/I: evidence 空 / score あり evidence なし → null + insufficient_evidence', () => {
    const r = run([axis('communication', 16, { evidence: [] })])
    expect(r.axes[0].score).toBeNull()
    expect(r.warnings).toContain('insufficient_evidence')
  })

  it('J: duplicate axis → 1件へ統合', () => {
    const r = run([axis('communication', 10), axis('communication', 18)])
    expect(r.axes.filter((a) => a.axisId === 'communication')).toHaveLength(1)
    expect(r.warnings).toContain('duplicate_axis_merged')
  })

  it('K: unknown axis → 除外', () => {
    const r = run([axis('teamwork', 16), axis('communication', 16)])
    expect(r.axes.map((a) => a.axisId)).toEqual(['communication'])
    expect(r.warnings).toContain('unknown_axis_excluded')
  })

  it('L/M/N/O: score -1/21/NaN/Infinity → null', () => {
    for (const bad of [-1, 21, NaN, Infinity]) {
      const r = run([axis('communication', bad as number)])
      expect(r.axes[0].score).toBeNull()
    }
  })

  it('P: malformed nested → crash せず drop', () => {
    const r = normalizeEvaluation({ raw: { axes: ['x', { evidence: 5 }, axis('communication', 16)] }, transcript })
    expect(r.axes).toHaveLength(1)
  })

  it('Q: oversized quote → evidence 破棄 → score null', () => {
    const r = run([axis('communication', 16, { evidence: [{ seq: 4, quote: 'あ'.repeat(EVAL_LIMITS.quoteMax + 1) }] })])
    expect(r.axes[0].score).toBeNull()
  })

  it('R: oversized summary → 切り詰め', () => {
    const r = run(sixAxes(15), { summary: 'x'.repeat(EVAL_LIMITS.summaryMax + 50) })
    expect((r.summary ?? '').length).toBe(EVAL_LIMITS.summaryMax)
    expect(r.warnings).toContain('oversized_content_truncated')
  })

  it('S: 保護属性/未知フィールド → warning・domain へ非混入', () => {
    const r = run(sixAxes(15), { personality_type: 'INTJ', big_five: {}, age: 20, extra: 1 })
    expect(r.warnings).toContain('protected_content_excluded')
    expect(JSON.stringify(r)).not.toContain('INTJ')
  })

  it('T: partial 発話を evidence 参照 → 無効', () => {
    const tr = [...transcript, T({ id: 'p', speaker: 'applicant', text: '未確定発言', seq: 5, final: false })]
    const r = run([axis('communication', 16, { evidence: [{ seq: 5, quote: '未確定発言' }] })], {}, tr)
    expect(r.axes[0].score).toBeNull()
  })

  it('U: out-of-order transcript でも seq で評価（到着順非依存）', () => {
    const shuffled = [transcript[3], transcript[0], transcript[2], transcript[1]]
    const r = run([axis('communication', 16)], {}, shuffled)
    expect(r.axes[0].score).toBe(16) // seq4 の quote は順序に依らず有効
  })

  it('malformed AI 出力（object でない）→ insufficient・crash しない', () => {
    expect(normalizeEvaluation({ raw: 'garbage', transcript }).overall.status).toBe('insufficient_data')
    expect(normalizeEvaluation({ raw: null, transcript }).overall.status).toBe('insufficient_data')
  })
})

describe('toInterviewResultsPayload (DB マッピング可能性・書込はしない)', () => {
  it('evaluation_axes / total_score / detail_json へ写像・personality_type/culture 列を作らない', () => {
    const r = run(sixAxes(15))
    const p = toInterviewResultsPayload(r)
    expect(p.total_score).toBe(75)
    expect(Array.isArray(p.evaluation_axes)).toBe(true)
    expect((p.evaluation_axes as unknown[]).length).toBe(6)
    expect(p.detail_json.schema_version).toBe('ebca-1')
    // 保護/死蔵列を生成しない
    expect(p.detail_json).not.toHaveProperty('personality_type')
    expect(p.detail_json).not.toHaveProperty('culture_fit_score')
    // evidence は構造化 {seq,quote}
    const firstAxis = (p.evaluation_axes as { evidence: unknown[] }[])[0]
    expect(firstAxis.evidence[0]).toEqual({ seq: 4, quote: '提案内容を変えていました' })
  })
})

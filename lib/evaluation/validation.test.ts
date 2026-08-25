import { describe, it, expect } from 'vitest'
import { parseEvaluationOutput } from './validation'
import { EVAL_LIMITS } from './ebca'

// PR-4A: AI structured output の防御的 parse（構造検証・transcript 非依存）。synthetic のみ。
const okAxis = (over: Record<string, unknown> = {}) => ({
  axis_id: 'communication',
  score: 16,
  rank: 'B',
  confidence: 'high',
  evidence: [{ seq: 4, quote: '提案内容を変えていました' }],
  comment: 'ok',
  ...over,
})

describe('parseEvaluationOutput', () => {
  it('raw が object でない → draft null（crash しない）', () => {
    expect(parseEvaluationOutput(null).draft).toBeNull()
    expect(parseEvaluationOutput('x').draft).toBeNull()
    expect(parseEvaluationOutput([]).draft).toBeNull()
    expect(parseEvaluationOutput(42).draft).toBeNull()
  })

  it('正常 → 軸を固定6軸順に整列', () => {
    const { draft } = parseEvaluationOutput({
      schema_version: 'ebca-1',
      axes: [okAxis({ axis_id: 'integrity' }), okAxis({ axis_id: 'communication' })],
    })
    expect(draft?.axes.map((a) => a.axisId)).toEqual(['communication', 'integrity'])
  })

  it('L/M/N/O: score 範囲外/NaN/Infinity → null（0化しない）', () => {
    for (const bad of [-1, 21, NaN, Infinity, -Infinity, 1.5, '5', null]) {
      const { draft } = parseEvaluationOutput({ axes: [okAxis({ score: bad })] })
      expect(draft?.axes[0].score).toBeNull()
    }
  })
  it('score 0 と 20（境界）は有効', () => {
    expect(parseEvaluationOutput({ axes: [okAxis({ score: 0 })] }).draft?.axes[0].score).toBe(0)
    expect(parseEvaluationOutput({ axes: [okAxis({ score: 20 })] }).draft?.axes[0].score).toBe(20)
  })

  it('rank/confidence/recommendation は allowlist 外 → null', () => {
    const { draft } = parseEvaluationOutput({
      overall: { recommendation: 'HIRE', confidence: 'certain' },
      axes: [okAxis({ rank: 'S', confidence: 'maybe' })],
    })
    expect(draft?.axes[0].rank).toBeNull()
    expect(draft?.axes[0].confidence).toBeNull()
    expect(draft?.recommendation).toBeNull()
    expect(draft?.overallConfidence).toBeNull()
  })

  it('J: duplicate axis → 後勝ち統合 + warning', () => {
    const { draft, warnings } = parseEvaluationOutput({
      axes: [okAxis({ score: 10 }), okAxis({ score: 18 })],
    })
    expect(draft?.axes).toHaveLength(1)
    expect(draft?.axes[0].score).toBe(18)
    expect(warnings).toContain('duplicate_axis_merged')
  })

  it('K: unknown axis → 除外 + warning', () => {
    const { draft, warnings } = parseEvaluationOutput({ axes: [okAxis({ axis_id: 'teamwork' })] })
    expect(draft?.axes).toHaveLength(0)
    expect(warnings).toContain('unknown_axis_excluded')
  })

  it('S: 保護属性/未知トップキー → domain へ写像せず warning', () => {
    const { draft, warnings } = parseEvaluationOutput({
      schema_version: 'ebca-1',
      axes: [okAxis()],
      personality_type: 'INTJ',
      big_five: { o: 5 },
      age: 30,
      random_extra: 'x',
    })
    expect(warnings).toContain('protected_content_excluded')
    expect(warnings).toContain('unknown_fields_excluded')
    // domain 側に保護フィールドは存在しない
    expect(JSON.stringify(draft)).not.toContain('INTJ')
    expect(JSON.stringify(draft)).not.toContain('big_five')
  })

  it('P: malformed nested（軸が object でない / evidence が object でない）→ drop・crash しない', () => {
    const { draft } = parseEvaluationOutput({
      axes: ['nope', 123, okAxis({ evidence: ['bad', { seq: 'x', quote: 'y' }, { seq: 1 }] })],
    })
    expect(draft?.axes).toHaveLength(1)
    expect(draft?.axes[0].evidence).toEqual([]) // 全て無効 → 空
  })

  it('Q/R: oversized quote / summary → 破棄 or 切り詰め + warning', () => {
    const longQuote = 'あ'.repeat(EVAL_LIMITS.quoteMax + 5)
    const r1 = parseEvaluationOutput({ axes: [okAxis({ evidence: [{ seq: 1, quote: longQuote }] })] })
    expect(r1.draft?.axes[0].evidence).toEqual([]) // 過大 quote は破棄
    expect(r1.warnings).toContain('oversized_content_truncated')

    const longSummary = 'x'.repeat(EVAL_LIMITS.summaryMax + 100)
    const r2 = parseEvaluationOutput({ summary: longSummary, axes: [okAxis()] })
    expect(r2.draft?.summary?.length).toBe(EVAL_LIMITS.summaryMax)
    expect(r2.warnings).toContain('oversized_content_truncated')
  })

  it('schema_version 未知 → warning', () => {
    const { warnings } = parseEvaluationOutput({ schema_version: 'ebca-9', axes: [okAxis()] })
    expect(warnings).toContain('unsupported_schema_version')
  })

  it('empty quote / seq<1 の evidence → 破棄', () => {
    const { draft } = parseEvaluationOutput({
      axes: [okAxis({ evidence: [{ seq: 0, quote: 'x' }, { seq: 1, quote: '   ' }, { seq: 2, quote: 'ok' }] })],
    })
    expect(draft?.axes[0].evidence).toEqual([{ seq: 2, quote: 'ok' }])
  })
})

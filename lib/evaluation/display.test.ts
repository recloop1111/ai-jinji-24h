import { describe, it, expect } from 'vitest'
import {
  buildEvaluationDisplayModel,
  recommendationDisplay,
  confidenceDisplay,
  axisScoreText,
} from './display'
import { EBCA_AXIS_IDS } from './ebca'

// PR-4D: 評価表示モデル（純ロジック・synthetic のみ・実応募者データなし）。
const axesRow = (over: Record<string, unknown> = {}) =>
  EBCA_AXIS_IDS.map((id, i) => ({
    axis: id,
    score: [16, 14, 12, 15, 13, 17][i],
    rank: 'B',
    confidence: 'high',
    insufficient_reason: null,
    evidence: [{ seq: 4, quote: '提案内容を変えていました' }],
    comment: 'c',
    ...over,
  }))

describe('label helpers', () => {
  it('recommendation は「判断材料」文言（採用/不採用と断定しない）', () => {
    expect(recommendationDisplay('strong_yes')).toBe('非常に前向きな判断材料')
    expect(recommendationDisplay('yes')).toBe('前向きな判断材料')
    expect(recommendationDisplay('neutral')).toBe('追加確認を推奨')
    expect(recommendationDisplay('no')).toBe('慎重な確認を推奨')
    expect(recommendationDisplay('HIRE')).toBeNull()
    // 「採用」「不採用」という断定語を出さない
    for (const rec of ['strong_yes', 'yes', 'neutral', 'no']) {
      expect(recommendationDisplay(rec)).not.toMatch(/^採用$|^不採用$/)
    }
  })
  it('confidence は 高/中/低', () => {
    expect(confidenceDisplay('high')).toBe('高')
    expect(confidenceDisplay('medium')).toBe('中')
    expect(confidenceDisplay('low')).toBe('低')
    expect(confidenceDisplay('x')).toBeNull()
  })
  it('axisScoreText: null と 0 を区別（null→—, 0→0）', () => {
    expect(axisScoreText(null)).toBe('—')
    expect(axisScoreText(0)).toBe('0')
    expect(axisScoreText(20)).toBe('20')
    expect(axisScoreText(21)).toBe('—')
  })
})

describe('buildEvaluationDisplayModel', () => {
  it('正常: 6軸・total・recommendation・structured evidence', () => {
    const m = buildEvaluationDisplayModel({
      evaluation_axes: axesRow(),
      total_score: 75,
      detail_json: { overall_status: 'ok', recommendation: 'yes', overall_confidence: 'medium', summary: 'ok要約', strengths: [{ text: '顧客志向', evidence: [{ seq: 4, quote: '提案内容を変えていました' }] }], concerns: [] },
    })!
    expect(m.status).toBe('ok')
    expect(m.totalScore).toBe(75)
    expect(m.grade).toBe('B') // scoreToGrade(75)
    expect(m.recommendationText).toBe('前向きな判断材料')
    expect(m.confidenceText).toBe('中')
    expect(m.axes).toHaveLength(6)
    expect(m.axes[0].evidence[0]).toEqual({ quote: '提案内容を変えていました', seq: 4 })
    expect(m.strengths[0].text).toBe('顧客志向')
  })

  it('score=null を 0 化しない（—表示・total から除外）', () => {
    const rows = axesRow()
    rows[1].score = null as unknown as number
    const m = buildEvaluationDisplayModel({ evaluation_axes: rows, total_score: 60, detail_json: { overall_status: 'ok' } })!
    expect(m.axes[1].score).toBeNull()
    expect(axisScoreText(m.axes[1].score)).toBe('—')
  })

  it('insufficient_data: 総合点・recommendation を出さない（null）', () => {
    const m = buildEvaluationDisplayModel({
      evaluation_axes: [],
      total_score: null,
      detail_json: { overall_status: 'insufficient_data', recommendation: 'yes' },
    })
    // 軸も点も無く summary も無い → 空（null）
    expect(m).toBeNull()
  })

  it('insufficient_data だが summary あり → status insufficient・score/recommendation は null', () => {
    const m = buildEvaluationDisplayModel({
      evaluation_axes: [],
      total_score: 40,
      detail_json: { overall_status: 'insufficient_data', recommendation: 'yes', summary: '会話が不足' },
    })!
    expect(m.status).toBe('insufficient_data')
    expect(m.totalScore).toBeNull() // 40 を出さない
    expect(m.recommendation).toBeNull()
    expect(m.summary).toBe('会話が不足')
  })

  it('評価が実質存在しない → null（空状態）', () => {
    expect(buildEvaluationDisplayModel(null)).toBeNull()
    expect(buildEvaluationDisplayModel({})).toBeNull()
    expect(buildEvaluationDisplayModel({ evaluation_axes: [], detail_json: {} })).toBeNull()
  })

  it('legacy string[] evidence を後方互換で表示（seq=null）', () => {
    const rows = axesRow({ evidence: ['過去に営業をしていました'] })
    const m = buildEvaluationDisplayModel({ evaluation_axes: rows, total_score: 70, detail_json: { overall_status: 'ok' } })!
    expect(m.axes[0].evidence[0]).toEqual({ quote: '過去に営業をしていました', seq: null })
  })

  it('legacy strengths/improvement_points（string[]）を後方互換で表示', () => {
    const m = buildEvaluationDisplayModel({
      evaluation_axes: axesRow(),
      total_score: 70,
      strengths: ['具体例が豊富'],
      improvement_points: ['再現性の確認'],
      detail_json: { overall_status: 'ok' },
    })!
    expect(m.strengths[0]).toEqual({ text: '具体例が豊富', evidence: [] })
    expect(m.concerns[0]).toEqual({ text: '再現性の確認', evidence: [] })
  })

  it('status 未宣言 → 判定軸ありで ok / 無しで insufficient に導出', () => {
    const ok = buildEvaluationDisplayModel({ evaluation_axes: axesRow(), total_score: 70, detail_json: {} })!
    expect(ok.status).toBe('ok')
    const insuf = buildEvaluationDisplayModel({ evaluation_axes: axesRow({ score: null, evidence: [] }), total_score: null, detail_json: {}, summary_text: '所見' })!
    expect(insuf.status).toBe('insufficient_data')
    expect(insuf.totalScore).toBeNull()
  })

  it('malformed/oversized で crash しない', () => {
    const m = buildEvaluationDisplayModel({
      evaluation_axes: ['x', 123, { axis: 'unknown', score: 5 }, { axis: 'communication', score: 999, evidence: 'bad', comment: 5 }],
      total_score: 'NaN',
      detail_json: 'not object',
    })
    // communication のみ（score 999 は範囲外→null）
    expect(m?.axes.map((a) => a.axisId)).toEqual(['communication'])
    expect(m?.axes[0].score).toBeNull()
  })

  it('HTML/スクリプト風の本文をそのまま（エスケープ/実行しない・表示側 React が escape）', () => {
    const rows = axesRow({ comment: '<script>alert(1)</script>', evidence: [{ seq: 1, quote: '<b>quote</b>' }] })
    const m = buildEvaluationDisplayModel({ evaluation_axes: rows, total_score: 70, detail_json: { overall_status: 'ok' } })!
    expect(m.axes[0].comment).toBe('<script>alert(1)</script>')
    expect(m.axes[0].evidence[0].quote).toBe('<b>quote</b>')
  })
})

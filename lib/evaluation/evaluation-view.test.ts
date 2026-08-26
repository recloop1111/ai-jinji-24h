import { describe, it, expect } from 'vitest'
import {
  normalizeEvidence,
  normalizeEvaluationAxesForDisplay,
  resolveEvaluationDisplayState,
  confidenceText,
  sortAxesForDisplay,
  CONFIDENCE_DISPLAY_LABEL,
} from './evaluation-view'
import { EBCA_AXIS_IDS, EBCA_AXIS_LABELS } from './ebca'

// PR-P6: 企業画面 EBCA 表示 view-model の純ロジックを固定（React/DOM 非依存）。

describe('normalizeEvidence: 新旧両形式 + invalid 耐性', () => {
  it('新形式 [{seq,quote}] → seq/quote を保持', () => {
    expect(normalizeEvidence([{ seq: 12, quote: '売上を20%伸ばしました' }])).toEqual([{ seq: 12, quote: '売上を20%伸ばしました' }])
  })
  it('legacy string[] → { seq:null, quote }', () => {
    expect(normalizeEvidence(['具体的な行動を説明できている'])).toEqual([{ seq: null, quote: '具体的な行動を説明できている' }])
  })
  it('混在（string と {seq,quote}）を両方読める', () => {
    expect(normalizeEvidence(['旧根拠', { seq: 3, quote: '新根拠' }])).toEqual([
      { seq: null, quote: '旧根拠' },
      { seq: 3, quote: '新根拠' },
    ])
  })
  it('invalid（quote 空 / seq が非正整数 / 非オブジェクト）は捨てる・crash しない', () => {
    const r = normalizeEvidence([{ seq: 0, quote: '' }, { seq: -1, quote: 'x' }, 42, null, { quote: '  ' }, { text: 'alt本文' }])
    // seq=-1 は quote 有効なので seq:null で残る。text 別名も許容。空 quote は落ちる。
    expect(r).toEqual([
      { seq: null, quote: 'x' },
      { seq: null, quote: 'alt本文' },
    ])
  })
  it('配列でない入力 → []', () => {
    expect(normalizeEvidence(null)).toEqual([])
    expect(normalizeEvidence('str')).toEqual([])
    expect(normalizeEvidence({ seq: 1, quote: 'x' })).toEqual([])
  })
})

describe('normalizeEvaluationAxesForDisplay: SoT ラベル / null≠0 / legacy 形式', () => {
  it('P5 形式（axis + score + evidence[{seq,quote}]）を正規化し SoT ラベルを使う', () => {
    const raw = [{ axis: 'communication', score: 15, rank: 'B', confidence: 'high', evidence: [{ seq: 2, quote: '根拠' }], insufficient_reason: null }]
    const [a] = normalizeEvaluationAxesForDisplay(raw)
    expect(a.axisId).toBe('communication')
    expect(a.label).toBe(EBCA_AXIS_LABELS.communication) // UI で再ハードコードしない
    expect(a.score).toBe(15)
    expect(a.confidence).toBe('high')
    expect(a.evidence).toEqual([{ seq: 2, quote: '根拠' }])
    expect(a.known).toBe(true)
  })
  it('null≠0: score=null は null のまま（0 化しない）。score=0 は 0 のまま（判断材料不足でない）', () => {
    const axes = normalizeEvaluationAxesForDisplay([
      { axis: 'communication', score: null, insufficient_reason: '判断材料不足' },
      { axis: 'desire', score: 0 },
    ])
    expect(axes[0].score).toBeNull()
    expect(axes[0].insufficientReason).toBe('判断材料不足')
    expect(axes[1].score).toBe(0)
  })
  it('out-of-range/NaN/型不正 score → null（clamp しない）', () => {
    const axes = normalizeEvaluationAxesForDisplay([
      { axis: 'communication', score: 999 },
      { axis: 'desire', score: 'x' },
      { axis: 'integrity', score: Infinity },
    ])
    // 999 は有限数なので保持（表示側は幅計算で clamp するが値は改変しない）、'x'/Infinity は null。
    expect(axes[0].score).toBe(999)
    expect(axes[1].score).toBeNull()
    expect(axes[2].score).toBeNull()
  })
  it('legacy [{label,value}] と object {key:number} を読める', () => {
    const arr = normalizeEvaluationAxesForDisplay([{ label: '独自軸', value: 12 }])
    expect(arr[0].label).toBe('独自軸')
    expect(arr[0].score).toBe(12)
    expect(arr[0].known).toBe(false)
    const obj = normalizeEvaluationAxesForDisplay({ communication: 18, logical_thinking: 10 })
    expect(obj.find((a) => a.axisId === 'communication')?.score).toBe(18)
    expect(obj.find((a) => a.axisId === 'communication')?.label).toBe(EBCA_AXIS_LABELS.communication)
  })
  it('空/null/文字列 → []（crash しない）', () => {
    expect(normalizeEvaluationAxesForDisplay(null)).toEqual([])
    expect(normalizeEvaluationAxesForDisplay('bad')).toEqual([])
    expect(normalizeEvaluationAxesForDisplay([])).toEqual([])
  })
  it('protected 属性キーは view-model に取り込まれない（読むキーを限定）', () => {
    const axes = normalizeEvaluationAxesForDisplay([
      { axis: 'communication', score: 15, gender: '女性', age: 25, address: '東京', evidence: [{ seq: 1, quote: 'ok' }] },
    ])
    const serialized = JSON.stringify(axes[0])
    for (const leak of ['女性', '25', '東京', 'gender', 'age', 'address']) expect(serialized).not.toContain(leak)
  })
})

describe('resolveEvaluationDisplayState: A–F の区別', () => {
  const sixAxes = (scores: (number | null)[]) =>
    EBCA_AXIS_IDS.map((axis, i) => ({ axis, score: scores[i], evidence: scores[i] != null ? [{ seq: 1, quote: 'q' }] : [] }))

  it('A normal: 全軸判定済み', () => {
    expect(resolveEvaluationDisplayState({ evaluationAxes: sixAxes([18, 16, 14, 12, 15, 13]) }).kind).toBe('normal')
  })
  it('B partial: 一部のみ判断材料不足', () => {
    const s = resolveEvaluationDisplayState({ evaluationAxes: sixAxes([18, null, 14, null, 15, 13]) })
    expect(s.kind).toBe('partial')
    expect(s.judgedCount).toBe(4)
    expect(s.insufficientCount).toBe(2)
  })
  it('C all_insufficient: 全軸判断材料不足', () => {
    expect(resolveEvaluationDisplayState({ evaluationAxes: sixAxes([null, null, null, null, null, null]) }).kind).toBe('all_insufficient')
  })
  it('D not_evaluated: 空（未実施）', () => {
    expect(resolveEvaluationDisplayState({ evaluationAxes: null }).kind).toBe('not_evaluated')
    expect(resolveEvaluationDisplayState({ evaluationAxes: [] }).kind).toBe('not_evaluated')
    expect(resolveEvaluationDisplayState({ evaluationAxes: {} }).kind).toBe('not_evaluated')
  })
  it('E legacy_only: EBCA 軸は無いが legacy 評価あり', () => {
    expect(resolveEvaluationDisplayState({ evaluationAxes: null, hasLegacyEvaluation: true }).kind).toBe('legacy_only')
  })
  it('F malformed: 使えない構造（文字列 / 全要素無効配列）', () => {
    expect(resolveEvaluationDisplayState({ evaluationAxes: 'broken' }).kind).toBe('malformed')
    expect(resolveEvaluationDisplayState({ evaluationAxes: [1, 2, 'x'] }).kind).toBe('malformed')
  })
})

describe('confidence: 評価確度（能力の高低ではない）', () => {
  it('high/medium/low → 高/中/低、null → null', () => {
    expect(confidenceText('high')).toBe('高')
    expect(confidenceText('medium')).toBe('中')
    expect(confidenceText('low')).toBe('低')
    expect(confidenceText(null)).toBeNull()
    expect(confidenceText('bad' as never)).toBeNull()
  })
  it('ラベルは「評価確度」（信頼度/低評価 と誤認させない）', () => {
    expect(CONFIDENCE_DISPLAY_LABEL).toBe('評価確度')
  })
})

describe('sortAxesForDisplay: 既知6軸は SoT 順', () => {
  it('順不同入力を SoT 順へ、未知は後ろ', () => {
    const axes = normalizeEvaluationAxesForDisplay([
      { axis: 'integrity', score: 10 },
      { label: '独自', value: 5 },
      { axis: 'communication', score: 12 },
    ])
    const sorted = sortAxesForDisplay(axes)
    expect(sorted[0].axisId).toBe('communication')
    expect(sorted[1].axisId).toBe('integrity')
    expect(sorted[2].known).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { buildFinalUtteranceIndex, hasEvaluableTranscript, isValidEvidence, validateAxisEvidence } from './evidence'
import { EVAL_LIMITS, type EvaluationAxisResult, type EvaluationWarning } from './ebca'
import type { TranscriptReadItem } from '../interview/transcript-read'

// PR-4A: evidence-first の transcript 検証（synthetic transcript のみ）。
const T = (over: Partial<TranscriptReadItem>): TranscriptReadItem => ({
  id: 'x', speaker: 'applicant', text: 't', seq: 1, final: true, createdAt: null, ...over,
})
const transcript: TranscriptReadItem[] = [
  T({ id: '1', speaker: 'interviewer', text: '本日はよろしくお願いします。', seq: 1 }),
  T({ id: '2', speaker: 'applicant', text: 'よろしくお願いします。', seq: 2 }),
  T({ id: '3', speaker: 'interviewer', text: '営業で工夫したことは？', seq: 3 }),
  T({ id: '4', speaker: 'applicant', text: '顧客ごとに課題を整理して提案内容を変えていました。', seq: 4 }),
  T({ id: '5', speaker: 'applicant', text: '（途中）', seq: 5, final: false }), // partial（根拠にしない）
]

describe('buildFinalUtteranceIndex / hasEvaluableTranscript', () => {
  it('final のみ索引化（partial 除外）', () => {
    const idx = buildFinalUtteranceIndex(transcript)
    expect(idx.has(4)).toBe(true)
    expect(idx.has(5)).toBe(false) // partial
  })
  it('final 応募者発話があれば評価可能', () => {
    expect(hasEvaluableTranscript(transcript)).toBe(true)
  })
  it('E: 応募者 final 発話が無ければ評価不能', () => {
    const onlyInterviewer = [T({ speaker: 'interviewer', text: 'q', seq: 1 })]
    expect(hasEvaluableTranscript(onlyInterviewer)).toBe(false)
  })
  it('D: 空 transcript → 評価不能・crash しない', () => {
    expect(hasEvaluableTranscript([])).toBe(false)
    expect(buildFinalUtteranceIndex([]).size).toBe(0)
  })
})

describe('isValidEvidence', () => {
  const idx = buildFinalUtteranceIndex(transcript)
  it('seq 実在 & quote が本文の部分文字列 → 有効', () => {
    expect(isValidEvidence({ seq: 4, quote: '提案内容を変えていました' }, idx)).toBe(true)
  })
  it('F: seq が存在しない → 無効', () => {
    expect(isValidEvidence({ seq: 99, quote: 'x' }, idx)).toBe(false)
  })
  it('G: quote が本文に無い → 無効（hallucination）', () => {
    expect(isValidEvidence({ seq: 4, quote: '海外留学の経験があります' }, idx)).toBe(false)
  })
  it('T: partial 発話（seq5）を参照 → 無効（final のみ根拠）', () => {
    expect(isValidEvidence({ seq: 5, quote: '途中' }, idx)).toBe(false)
  })
  it('H相当: 空 quote → 無効 / 過大 quote → 無効', () => {
    expect(isValidEvidence({ seq: 4, quote: '   ' }, idx)).toBe(false)
    expect(isValidEvidence({ seq: 4, quote: 'あ'.repeat(EVAL_LIMITS.quoteMax + 1) }, idx)).toBe(false)
  })
})

describe('validateAxisEvidence (evidence-first 強制)', () => {
  const idx = buildFinalUtteranceIndex(transcript)
  const axis = (over: Partial<EvaluationAxisResult>): EvaluationAxisResult => ({
    axisId: 'communication', score: 16, rank: 'B', confidence: 'high', insufficientReason: null, evidence: [], comment: null, ...over,
  })

  it('有効 evidence あり → score 維持', () => {
    const w: EvaluationWarning[] = []
    const out = validateAxisEvidence(axis({ evidence: [{ seq: 4, quote: '提案内容を変えていました' }] }), idx, w)
    expect(out.score).toBe(16)
    expect(out.evidence).toHaveLength(1)
  })
  it('I: score あり & 有効 evidence 0 → score/rank null + insufficient_reason + warning', () => {
    const w: EvaluationWarning[] = []
    const out = validateAxisEvidence(axis({ score: 18, evidence: [] }), idx, w)
    expect(out.score).toBeNull()
    expect(out.rank).toBeNull()
    expect(out.insufficientReason).toBeTruthy()
    expect(w).toContain('insufficient_evidence')
  })
  it('無効 evidence（hallucination）を破棄し、残らなければ score null', () => {
    const w: EvaluationWarning[] = []
    const out = validateAxisEvidence(axis({ score: 12, evidence: [{ seq: 4, quote: '実在しない引用' }] }), idx, w)
    expect(out.score).toBeNull()
  })
  it('score=null の軸は evidence 検証で score を 0 化しない', () => {
    const w: EvaluationWarning[] = []
    const out = validateAxisEvidence(axis({ score: null, evidence: [] }), idx, w)
    expect(out.score).toBeNull()
  })
})

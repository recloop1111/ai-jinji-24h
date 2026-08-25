import { describe, it, expect } from 'vitest'
import { buildTranscriptReadModel, buildEvaluationInputFromRows } from './transcript-read'

// PR-3C: read model / evaluator 結線（純ロジック）。synthetic のみ（実応募者データ・実DBなし）。
const IV = 'iv-1'
// snake_case（DB SELECT 由来を模す）と camelCase（repository StoredUtterance 由来を模す）を混在させて両対応を確認。
const rowsMixed = [
  { id: 'r4', interview_id: IV, speaker: 'applicant', text: 'A2', seq: 4, final: true, source: 'synthetic', created_at: '2026-08-21T00:00:04Z' },
  { id: 'r1', interviewId: IV, speaker: 'interviewer', text: 'Q1', seq: 1, final: true, source: 'synthetic', createdAt: '2026-08-21T00:00:01Z' },
  { id: 'r3', interview_id: IV, speaker: 'interviewer', text: 'Q2', seq: 3, final: true, source: 'synthetic', created_at: '2026-08-21T00:00:03Z' },
  { id: 'r2', interviewId: IV, speaker: 'applicant', text: 'A1', seq: 2, final: false, source: 'synthetic', createdAt: '2026-08-21T00:00:02Z' },
]

describe('buildTranscriptReadModel', () => {
  it('seq 昇順に並ぶ（到着順・created_at に依存しない）', () => {
    const model = buildTranscriptReadModel(rowsMixed)
    expect(model.map((m) => m.seq)).toEqual([1, 2, 3, 4])
    expect(model.map((m) => m.speaker)).toEqual(['interviewer', 'applicant', 'interviewer', 'applicant'])
  })
  it('UI 投影のみ（内部/信頼属性 source/dedupKey/interviewId/language を含めない）', () => {
    const item = buildTranscriptReadModel(rowsMixed)[0]
    expect(Object.keys(item).sort()).toEqual(['createdAt', 'final', 'id', 'seq', 'speaker', 'text'])
    expect(item).not.toHaveProperty('source')
    expect(item).not.toHaveProperty('dedupKey')
    expect(item).not.toHaveProperty('interviewId')
  })
  it('final=false（partial）も read model には含む（UI が状態表示できるように）', () => {
    const model = buildTranscriptReadModel(rowsMixed)
    expect(model.find((m) => m.seq === 2)?.final).toBe(false)
  })
  it('malformed / 非配列で crash しない（drop / 空配列）', () => {
    expect(buildTranscriptReadModel('nope')).toEqual([])
    expect(buildTranscriptReadModel(null)).toEqual([])
    expect(buildTranscriptReadModel([{ speaker: 'ai', text: 'x', seq: 1, source: 'synthetic', interview_id: IV }])).toEqual([]) // speaker不正→drop
  })
})

describe('buildEvaluationInputFromRows (PR-4 入力・final のみ・seq 昇順)', () => {
  it('final のみ・seq 昇順・話者ラベル固定（partial は除外）', () => {
    // rowsMixed の seq2(A1) は final=false → 除外される
    expect(buildEvaluationInputFromRows(rowsMixed)).toBe('[面接官] Q1\n[面接官] Q2\n[応募者] A2')
  })
  it('malformed / 非配列 → 空文字（crash しない）', () => {
    expect(buildEvaluationInputFromRows(null)).toBe('')
    expect(buildEvaluationInputFromRows('x')).toBe('')
  })
  it('HTML/markdown を生成しない（記号はプレーンのまま）', () => {
    const out = buildEvaluationInputFromRows([
      { interview_id: IV, speaker: 'applicant', text: '<script>alert(1)</script> **bold**', seq: 1, final: true, source: 'synthetic' },
    ])
    expect(out).toBe('[応募者] <script>alert(1)</script> **bold**')
    expect(out).not.toContain('&lt;') // エスケープしない＝プレーンテキスト（表示側 React が escape）
  })
})

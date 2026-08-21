import { describe, it, expect } from 'vitest'
import { buildFinalTranscriptReadModel, speakerDisplayLabel, transcriptItemsToCopyText } from './transcript-view'
import type { TranscriptReadItem } from './transcript-read'

// PR-3D: 会話ログ表示ヘルパ（純関数）。synthetic のみ・実DBなし。
const IV = 'iv-1'
// snake/camel 混在の生行（DB SELECT / repository 由来を模す）。
const rows = [
  { id: 'r4', interview_id: IV, speaker: 'applicant', text: '御社の理念に共感しました。', seq: 4, final: true, source: 'synthetic' },
  { id: 'r1', interviewId: IV, speaker: 'interviewer', text: '志望動機を教えてください。', seq: 1, final: true, source: 'synthetic' },
  { id: 'r3', interview_id: IV, speaker: 'applicant', text: '（言い直し途中）', seq: 3, final: false, source: 'synthetic' }, // partial
  { id: 'r2', interviewId: IV, speaker: 'interviewer', text: '本日はよろしくお願いします。', seq: 2, final: true, source: 'synthetic' },
]

describe('buildFinalTranscriptReadModel', () => {
  it('final のみ・seq 昇順（read model を再利用）', () => {
    const model = buildFinalTranscriptReadModel(rows)
    expect(model.map((m) => m.seq)).toEqual([1, 2, 4]) // seq3(partial) 除外
    expect(model.every((m) => m.final)).toBe(true)
  })
  it('UI 投影のみ（内部属性を含めない）', () => {
    const item = buildFinalTranscriptReadModel(rows)[0]
    expect(Object.keys(item).sort()).toEqual(['createdAt', 'final', 'id', 'seq', 'speaker', 'text'])
  })
  it('malformed / 非配列で crash しない', () => {
    expect(buildFinalTranscriptReadModel(null)).toEqual([])
    expect(buildFinalTranscriptReadModel('x')).toEqual([])
    expect(buildFinalTranscriptReadModel([{ speaker: 'ai', text: 'x', seq: 1, source: 'synthetic', interview_id: IV }])).toEqual([])
  })
})

describe('speakerDisplayLabel', () => {
  it('テキストラベル（色に依存しない）', () => {
    expect(speakerDisplayLabel('interviewer')).toBe('AI面接官')
    expect(speakerDisplayLabel('applicant')).toBe('応募者')
  })
})

describe('transcriptItemsToCopyText', () => {
  it('final のみ・話者ラベル付き・自然な会話テキスト', () => {
    const items = buildFinalTranscriptReadModel(rows)
    expect(transcriptItemsToCopyText(items)).toBe(
      ['AI面接官\n志望動機を教えてください。', 'AI面接官\n本日はよろしくお願いします。', '応募者\n御社の理念に共感しました。'].join('\n\n'),
    )
  })
  it('空/非配列で crash しない', () => {
    expect(transcriptItemsToCopyText([])).toBe('')
    // @ts-expect-error 故意の不正
    expect(transcriptItemsToCopyText(null)).toBe('')
  })
  it('HTML/スクリプト風の本文でもプレーンテキストのまま（エスケープ/実行しない）', () => {
    const items: TranscriptReadItem[] = [
      { id: 'x', speaker: 'applicant', text: '<script>alert(1)</script>\n改行テスト', seq: 1, final: true, createdAt: null },
    ]
    const out = transcriptItemsToCopyText(items)
    expect(out).toBe('応募者\n<script>alert(1)</script>\n改行テスト')
    expect(out).not.toContain('&lt;')
  })
})

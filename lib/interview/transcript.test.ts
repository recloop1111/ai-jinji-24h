import { describe, it, expect } from 'vitest'
import {
  isTranscriptSpeaker,
  isTranscriptSource,
  isValidSeq,
  normalizeTranscriptRow,
  normalizeTranscriptRows,
  toTranscriptRow,
  orderUtterances,
  finalUtterances,
  dedupUtterances,
  serializeTranscriptForEvaluation,
  type TranscriptUtterance,
} from './transcript'

// PR-3A: Transcript 正規モデル・純ロジック。実 OpenAI/DB は使わない（synthetic fixture のみ）。
const IV = 'iv-1'

// synthetic fixture（本番/実応募者データではない・テストコード内のみ・DB へ INSERT しない）。
const fixture: TranscriptUtterance[] = [
  { interviewId: IV, speaker: 'interviewer', text: '志望動機を教えてください。', seq: 1, final: true, source: 'synthetic' },
  { interviewId: IV, speaker: 'applicant', text: '前職では3年間営業をしていました。', seq: 2, final: true, source: 'synthetic' },
  { interviewId: IV, speaker: 'interviewer', text: '営業で最も工夫したことを教えてください。', seq: 3, final: true, source: 'synthetic' },
  { interviewId: IV, speaker: 'applicant', text: '顧客ごとに提案内容を変えていました。', seq: 4, final: true, source: 'synthetic' },
]

describe('validators', () => {
  it('isTranscriptSpeaker', () => {
    expect(isTranscriptSpeaker('applicant')).toBe(true)
    expect(isTranscriptSpeaker('interviewer')).toBe(true)
    expect(isTranscriptSpeaker('ai')).toBe(false)
    expect(isTranscriptSpeaker(null)).toBe(false)
  })
  it('isTranscriptSource', () => {
    for (const s of ['realtime', 'server', 'mock', 'synthetic']) expect(isTranscriptSource(s)).toBe(true)
    expect(isTranscriptSource('openai')).toBe(false)
    expect(isTranscriptSource(undefined)).toBe(false)
  })
  it('isValidSeq (>=1 の整数のみ)', () => {
    expect(isValidSeq(1)).toBe(true)
    expect(isValidSeq(0)).toBe(false)
    expect(isValidSeq(-1)).toBe(false)
    expect(isValidSeq(1.5)).toBe(false)
    expect(isValidSeq(NaN)).toBe(false)
    expect(isValidSeq('1')).toBe(false)
  })
})

describe('normalizeTranscriptRow (DB row → domain・malformed は null)', () => {
  it('正常な snake_case row → domain', () => {
    const u = normalizeTranscriptRow({
      id: 't1',
      interview_id: IV,
      speaker: 'applicant',
      text: 'はい',
      seq: 2,
      final: true,
      source: 'realtime',
      dedup_key: 'item_abc',
      language: 'ja',
      created_at: '2026-08-21T00:00:00Z',
    })
    expect(u).toEqual({
      id: 't1',
      interviewId: IV,
      speaker: 'applicant',
      text: 'はい',
      seq: 2,
      final: true,
      source: 'realtime',
      dedupKey: 'item_abc',
      language: 'ja',
      createdAt: '2026-08-21T00:00:00Z',
    })
  })
  it('final 欠落 → 既定 true / dedup_key・language 欠落 → null', () => {
    const u = normalizeTranscriptRow({ interview_id: IV, speaker: 'interviewer', text: 'Q', seq: 1, source: 'mock' })
    expect(u?.final).toBe(true)
    expect(u?.dedupKey).toBeNull()
    expect(u?.language).toBeNull()
  })
  it('malformed → null（crash しない）', () => {
    expect(normalizeTranscriptRow(null)).toBeNull()
    expect(normalizeTranscriptRow('x')).toBeNull()
    expect(normalizeTranscriptRow({})).toBeNull()
    expect(normalizeTranscriptRow({ interview_id: IV, speaker: 'ai', text: 'x', seq: 1, source: 'realtime' })).toBeNull() // speaker不正
    expect(normalizeTranscriptRow({ interview_id: IV, speaker: 'applicant', text: 5, seq: 1, source: 'realtime' })).toBeNull() // text非string
    expect(normalizeTranscriptRow({ interview_id: IV, speaker: 'applicant', text: 'x', seq: 0, source: 'realtime' })).toBeNull() // seq<1
    expect(normalizeTranscriptRow({ interview_id: IV, speaker: 'applicant', text: 'x', seq: 1, source: 'openai' })).toBeNull() // source不正
    expect(normalizeTranscriptRow({ speaker: 'applicant', text: 'x', seq: 1, source: 'realtime' })).toBeNull() // interview_id欠落
  })
  it('normalizeTranscriptRows は malformed を落として配列化', () => {
    const rows = [
      { interview_id: IV, speaker: 'applicant', text: 'ok', seq: 1, source: 'synthetic' },
      { interview_id: IV, speaker: 'ai', text: 'drop', seq: 2, source: 'synthetic' }, // malformed
      null,
    ]
    const out = normalizeTranscriptRows(rows)
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('ok')
    expect(normalizeTranscriptRows('nope')).toEqual([])
  })
})

describe('toTranscriptRow (domain → DB row)', () => {
  it('snake_case へ変換（dedup/language 無しは null）', () => {
    expect(toTranscriptRow(fixture[0])).toEqual({
      interview_id: IV,
      speaker: 'interviewer',
      text: '志望動機を教えてください。',
      seq: 1,
      final: true,
      source: 'synthetic',
      dedup_key: null,
      language: null,
    })
  })
})

describe('ordering / filtering', () => {
  it('orderUtterances は seq 昇順（入力を破壊しない・安定）', () => {
    const shuffled = [fixture[3], fixture[1], fixture[0], fixture[2]]
    const ordered = orderUtterances(shuffled)
    expect(ordered.map((u) => u.seq)).toEqual([1, 2, 3, 4])
    expect(shuffled.map((u) => u.seq)).toEqual([4, 2, 1, 3]) // 元配列は不変
  })
  it('seq 同値は入力順を保持（安定ソート）', () => {
    const a: TranscriptUtterance = { interviewId: IV, speaker: 'applicant', text: 'A', seq: 5, final: true, source: 'synthetic' }
    const b: TranscriptUtterance = { interviewId: IV, speaker: 'interviewer', text: 'B', seq: 5, final: true, source: 'synthetic' }
    expect(orderUtterances([a, b]).map((u) => u.text)).toEqual(['A', 'B'])
  })
  it('finalUtterances は final=true のみ', () => {
    const withPartial = [...fixture, { interviewId: IV, speaker: 'applicant', text: '途中', seq: 5, final: false, source: 'realtime' } as TranscriptUtterance]
    expect(finalUtterances(withPartial)).toHaveLength(4)
  })
})

describe('dedupUtterances (防御的縮約・DB制約の代替ではない)', () => {
  it('同 dedupKey は final を優先して1件に', () => {
    const partial: TranscriptUtterance = { interviewId: IV, speaker: 'applicant', text: '途中まで', seq: 2, final: false, source: 'realtime', dedupKey: 'k1' }
    const finalU: TranscriptUtterance = { interviewId: IV, speaker: 'applicant', text: '完成した回答', seq: 2, final: true, source: 'realtime', dedupKey: 'k1' }
    const out = dedupUtterances([partial, finalU])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('完成した回答')
    expect(out[0].final).toBe(true)
  })
  it('final 後の partial は無視（final を保持）', () => {
    const finalU: TranscriptUtterance = { interviewId: IV, speaker: 'applicant', text: 'final', seq: 1, final: true, source: 'realtime', dedupKey: 'k1' }
    const partial: TranscriptUtterance = { interviewId: IV, speaker: 'applicant', text: 'late partial', seq: 1, final: false, source: 'realtime', dedupKey: 'k1' }
    const out = dedupUtterances([finalU, partial])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('final')
  })
  it('dedupKey null は縮約しない（別発話として保持）', () => {
    const a: TranscriptUtterance = { interviewId: IV, speaker: 'applicant', text: 'a', seq: 1, final: true, source: 'synthetic', dedupKey: null }
    const b: TranscriptUtterance = { interviewId: IV, speaker: 'applicant', text: 'b', seq: 2, final: true, source: 'synthetic', dedupKey: null }
    expect(dedupUtterances([a, b])).toHaveLength(2)
  })
})

describe('serializeTranscriptForEvaluation (PR-4 入力・純関数)', () => {
  it('synthetic fixture → 話者ラベル付きプレーンテキスト（seq 昇順）', () => {
    expect(serializeTranscriptForEvaluation(fixture)).toBe(
      [
        '[面接官] 志望動機を教えてください。',
        '[応募者] 前職では3年間営業をしていました。',
        '[面接官] 営業で最も工夫したことを教えてください。',
        '[応募者] 顧客ごとに提案内容を変えていました。',
      ].join('\n'),
    )
  })
  it('順不同でも seq 昇順で出力', () => {
    const shuffled = [fixture[3], fixture[0], fixture[2], fixture[1]]
    expect(serializeTranscriptForEvaluation(shuffled)).toBe(serializeTranscriptForEvaluation(fixture))
  })
  it('final=false / 空 text は除外', () => {
    const rows: TranscriptUtterance[] = [
      { interviewId: IV, speaker: 'interviewer', text: 'Q1', seq: 1, final: true, source: 'synthetic' },
      { interviewId: IV, speaker: 'applicant', text: '途中', seq: 2, final: false, source: 'realtime' }, // partial 除外
      { interviewId: IV, speaker: 'applicant', text: '   ', seq: 3, final: true, source: 'synthetic' }, // 空白 除外
      { interviewId: IV, speaker: 'applicant', text: 'A2', seq: 4, final: true, source: 'synthetic' },
    ]
    expect(serializeTranscriptForEvaluation(rows)).toBe('[面接官] Q1\n[応募者] A2')
  })
  it('malformed / 非配列で crash しない・空文字', () => {
    expect(serializeTranscriptForEvaluation(null)).toBe('')
    expect(serializeTranscriptForEvaluation(undefined)).toBe('')
    // @ts-expect-error 故意に不正入力
    expect(serializeTranscriptForEvaluation('nope')).toBe('')
    // @ts-expect-error 欠損フィールド混入
    expect(serializeTranscriptForEvaluation([{ speaker: 'applicant' }, null, 5])).toBe('')
  })
  it('HTML を生成しない（本文の記号はそのまま・エスケープしない＝表示側の責務）', () => {
    const rows: TranscriptUtterance[] = [
      { interviewId: IV, speaker: 'applicant', text: '<b>test</b> & "quote"', seq: 1, final: true, source: 'synthetic' },
    ]
    const out = serializeTranscriptForEvaluation(rows)
    expect(out).toBe('[応募者] <b>test</b> & "quote"')
    expect(out).not.toContain('&lt;') // HTMLエスケープしていない＝プレーンテキストのまま
  })
})

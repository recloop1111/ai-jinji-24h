import { describe, it, expect } from 'vitest'
import {
  resolveTranscriptFetch,
  isMissingTranscriptTableError,
  TRANSCRIPT_READ_COLUMNS,
} from './transcript-company-read'

// PR-19G: 企業 UI transcript 読み取りヘルパ（fake 取得結果のみ・実 DB 非接続）。
// DB row（snake_case・normalize が受ける形）。
const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  interview_id: 'iv-1',
  speaker: 'applicant',
  text: 'こんにちは',
  seq: 1,
  final: true,
  source: 'realtime',
  dedup_key: 'applicant:i1:0',
  language: 'ja',
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('resolveTranscriptFetch', () => {
  it('1/4: transcript 3件 → final read model（applicant/interviewer 正常）', () => {
    const v = resolveTranscriptFetch({
      data: [row({ id: 'a', seq: 1, speaker: 'applicant', text: '応募者1' }), row({ id: 'b', seq: 2, speaker: 'interviewer', text: 'AI1' }), row({ id: 'c', seq: 3, speaker: 'applicant', text: '応募者2' })],
      error: null,
    })
    expect(v.error).toBe(false)
    expect(v.items.map((i) => i.seq)).toEqual([1, 2, 3])
    expect(v.items.map((i) => i.speaker)).toEqual(['applicant', 'interviewer', 'applicant'])
  })

  it('2: seq 順不同の DB 結果でも seq 昇順に整列', () => {
    const v = resolveTranscriptFetch({ data: [row({ id: 'a', seq: 3 }), row({ id: 'b', seq: 1 }), row({ id: 'c', seq: 2 })], error: null })
    expect(v.items.map((i) => i.seq)).toEqual([1, 2, 3])
  })

  it('3: partial(final=false) は除外', () => {
    const v = resolveTranscriptFetch({ data: [row({ id: 'a', seq: 1, final: true, text: '確定' }), row({ id: 'b', seq: 2, final: false, text: '途中' })], error: null })
    expect(v.items).toHaveLength(1)
    expect(v.items[0].text).toBe('確定')
  })

  it('5: 空 data → 空 items・error なし（honest empty）', () => {
    expect(resolveTranscriptFetch({ data: [], error: null })).toEqual({ items: [], error: false })
    expect(resolveTranscriptFetch({ data: null, error: null })).toEqual({ items: [], error: false })
  })

  it('実エラー → error state・items 空（DUMMY 補完なし）', () => {
    const v = resolveTranscriptFetch({ data: null, error: { code: '08006', message: 'connection failure' } })
    expect(v).toEqual({ items: [], error: true })
  })

  it('テーブル未作成(42P01/PGRST205) → error ではなく empty（本番有効化前 honest empty）', () => {
    expect(resolveTranscriptFetch({ data: null, error: { code: '42P01', message: 'relation "interview_transcripts" does not exist' } })).toEqual({ items: [], error: false })
    expect(resolveTranscriptFetch({ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } })).toEqual({ items: [], error: false })
  })

  it('9: HTML/script 風 text は文字列として保持（エスケープ/実行しない・表示は React 既定）', () => {
    const v = resolveTranscriptFetch({ data: [row({ text: '<script>alert(1)</script>' })], error: null })
    expect(v.items[0].text).toBe('<script>alert(1)</script>')
    expect(v.items[0].text).not.toContain('&lt;')
  })

  it('malformed row（speaker 不正/seq 不正）は drop（crash しない）', () => {
    const v = resolveTranscriptFetch({ data: [row({ id: 'ok', seq: 1 }), row({ id: 'bad', speaker: 'ai' }), row({ id: 'bad2', seq: 0 })], error: null })
    expect(v.error).toBe(false)
    expect(v.items).toHaveLength(1)
    expect(v.items[0].id).toBe('ok')
    // 'ai' は domain speaker ではないため drop（interviewer/applicant のみ）
    expect(v.items.every((i) => i.speaker === 'applicant' || i.speaker === 'interviewer')).toBe(true)
  })

  it('10/11: DUMMY/synthetic/legacy fallback を混ぜない（入力が空なら出力も空）', () => {
    expect(resolveTranscriptFetch({ data: undefined, error: null }).items).toHaveLength(0)
  })
})

describe('isMissingTranscriptTableError', () => {
  it('42P01 / PGRST205 / message で判定・それ以外は false', () => {
    expect(isMissingTranscriptTableError({ code: '42P01' })).toBe(true)
    expect(isMissingTranscriptTableError({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTranscriptTableError({ message: 'relation does not exist' })).toBe(true)
    expect(isMissingTranscriptTableError({ code: '08006' })).toBe(false)
    expect(isMissingTranscriptTableError(null)).toBe(false)
    expect(isMissingTranscriptTableError('x')).toBe(false)
  })
})

describe('12: evaluation loader と同一 SELECT 列を共有（drift 防止）', () => {
  it('TRANSCRIPT_READ_COLUMNS は normalize が読む全フィールドを含む', () => {
    for (const c of ['id', 'interview_id', 'speaker', 'text', 'seq', 'final', 'source', 'created_at']) {
      expect(TRANSCRIPT_READ_COLUMNS).toContain(c)
    }
  })
})

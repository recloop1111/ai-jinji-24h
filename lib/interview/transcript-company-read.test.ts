import { describe, it, expect } from 'vitest'
import {
  resolveTranscriptFetchState,
  buildTranscriptDisplayItems,
  isMissingTranscriptTableError,
  speakerDisplayLabel,
  TRANSCRIPT_DISPLAY_COLUMNS,
} from './transcript-company-read'

const rows = [
  { speaker: 'interviewer', text: 'q1', seq: 1, final: true, created_at: '2026-01-01T00:00:00Z' },
  { speaker: 'applicant', text: 'a1', seq: 2, final: true, created_at: '2026-01-01T00:01:00Z' },
]

describe('resolveTranscriptFetchState — 4状態を区別', () => {
  it('A: rows あり → ready（seq 昇順 items）', () => {
    const r = resolveTranscriptFetchState({ data: [rows[1], rows[0]], error: null })
    expect(r.status).toBe('ready')
    expect(r.items.map((i) => i.seq)).toEqual([1, 2]) // seq ASC
    expect(r.items.map((i) => i.speaker)).toEqual(['interviewer', 'applicant'])
  })
  it('B: 0 件（テーブル有・error 無）→ empty（schema_pending でない）', () => {
    const r = resolveTranscriptFetchState({ data: [], error: null })
    expect(r.status).toBe('empty')
    expect(r.items).toEqual([])
  })
  it('C: missing-schema のみ → schema_pending（42P01 / PGRST205 / does not exist / schema cache）', () => {
    for (const error of [
      { code: '42P01', message: 'relation "interview_transcripts" does not exist' },
      { code: 'PGRST205', message: "Could not find the table 'public.interview_transcripts' in the schema cache" },
      { message: 'does not exist' },
    ]) {
      expect(resolveTranscriptFetchState({ data: null, error }).status).toBe('schema_pending')
    }
  })
  it('D: permission/RLS/network/unknown → error（空で握り潰さない）', () => {
    for (const error of [
      { code: '42501', message: 'permission denied for table interview_transcripts' },
      { code: 'PGRST301', message: 'RLS violation' },
      { message: 'network error' },
      { code: 'XX000', message: 'unknown db error' },
    ]) {
      const r = resolveTranscriptFetchState({ data: null, error })
      expect(r.status).toBe('error')
      expect(r.items).toEqual([])
    }
  })
})

describe('isMissingTranscriptTableError — missing-schema だけを true', () => {
  it('missing-schema は true', () => {
    expect(isMissingTranscriptTableError({ code: '42P01' })).toBe(true)
    expect(isMissingTranscriptTableError({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTranscriptTableError({ message: 'schema cache' })).toBe(true)
  })
  it('permission / unknown / null は false（error 扱いになる）', () => {
    expect(isMissingTranscriptTableError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingTranscriptTableError({ message: 'network' })).toBe(false)
    expect(isMissingTranscriptTableError(null)).toBe(false)
  })
})

describe('buildTranscriptDisplayItems — 最小 DTO・final のみ・不正除外・内部情報非漏洩', () => {
  it('最小 DTO（speaker/text/seq/createdAt）のみ。内部列は含めない', () => {
    const items = buildTranscriptDisplayItems([
      { speaker: 'applicant', text: 'x', seq: 1, final: true, created_at: 't', id: 'SECRET-UUID', source: 'realtime', dedup_key: 'SECRET-DEDUP', language: 'ja', metadata: { a: 1 } },
    ])
    expect(items).toHaveLength(1)
    expect(Object.keys(items[0]).sort()).toEqual(['createdAt', 'seq', 'speaker', 'text'])
    const json = JSON.stringify(items)
    expect(json).not.toContain('SECRET-UUID')
    expect(json).not.toContain('SECRET-DEDUP')
    expect(json).not.toContain('realtime')
    expect(json).not.toContain('metadata')
  })
  it('final=false / 不正 speaker / text 非文字列 / seq 非数値 は除外', () => {
    const items = buildTranscriptDisplayItems([
      { speaker: 'interviewer', text: 'ok', seq: 1, final: true },
      { speaker: 'interviewer', text: 'partial', seq: 2, final: false }, // partial 除外
      { speaker: 'robot', text: 'x', seq: 3, final: true }, // 不正 speaker 除外
      { speaker: 'applicant', text: 123, seq: 4, final: true }, // text 非文字列 除外
      { speaker: 'applicant', text: 'y', seq: 'z', final: true }, // seq 非数値 除外
    ])
    expect(items.map((i) => i.text)).toEqual(['ok'])
  })
  it('非配列 → 空', () => {
    expect(buildTranscriptDisplayItems(null)).toEqual([])
    expect(buildTranscriptDisplayItems('nope')).toEqual([])
  })
})

describe('SELECT 列 / ラベル', () => {
  it('TRANSCRIPT_DISPLAY_COLUMNS は最小（内部列 id/source/dedup_key/language/metadata を含めない）', () => {
    expect(TRANSCRIPT_DISPLAY_COLUMNS).toBe('speaker, text, seq, final, created_at')
    for (const forbidden of ['dedup_key', 'source', 'language', 'metadata']) {
      expect(TRANSCRIPT_DISPLAY_COLUMNS).not.toContain(forbidden)
    }
    // id は「id, 」「, id」の語境界で含まれないこと（interview_id 等の部分一致は許容しない検査）
    expect(TRANSCRIPT_DISPLAY_COLUMNS.split(',').map((s) => s.trim())).not.toContain('id')
  })
  it('話者ラベル: interviewer→AI面接官 / applicant→応募者', () => {
    expect(speakerDisplayLabel('interviewer')).toBe('AI面接官')
    expect(speakerDisplayLabel('applicant')).toBe('応募者')
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildInterviewSummary,
  serializeSummary,
  parseInterviewSummary,
  summaryMatchesInterview,
  durationToMinutes,
  questionCountDisplay,
  summaryStorageKey,
} from './completeSummary'

// Phase I-4: 完了サマリーの受け渡し（stale/別面接/malformed に強く・ダミーを出さない）。
describe('summaryStorageKey', () => {
  it('slug ごとのキー（既存キーと衝突しない）', () => {
    expect(summaryStorageKey('acme')).toBe('interview_acme_summary')
  })
})

describe('buildInterviewSummary', () => {
  it('値をそのまま（floor）保持', () => {
    expect(buildInterviewSummary({ interviewId: 'iv1', durationSeconds: 372.9, questionCount: 6 })).toEqual({
      interviewId: 'iv1',
      durationSeconds: 372,
      questionCount: 6,
    })
  })
  it('不正/負の数値は 0 にクランプ', () => {
    expect(buildInterviewSummary({ interviewId: 'iv1', durationSeconds: -5, questionCount: NaN })).toEqual({
      interviewId: 'iv1',
      durationSeconds: 0,
      questionCount: 0,
    })
  })
})

describe('parseInterviewSummary (安全なパース)', () => {
  it('正常な JSON → object', () => {
    const raw = serializeSummary({ interviewId: 'iv1', durationSeconds: 372, questionCount: 6 })
    expect(parseInterviewSummary(raw)).toEqual({ interviewId: 'iv1', durationSeconds: 372, questionCount: 6 })
  })
  it('null/空 → null', () => {
    expect(parseInterviewSummary(null)).toBeNull()
    expect(parseInterviewSummary('')).toBeNull()
    expect(parseInterviewSummary(undefined)).toBeNull()
  })
  it('malformed JSON → null（crash しない）', () => {
    expect(parseInterviewSummary('{not json')).toBeNull()
    expect(parseInterviewSummary('12345')).toBeNull()
    expect(parseInterviewSummary('"str"')).toBeNull()
    expect(parseInterviewSummary('null')).toBeNull()
  })
  it('必須フィールド欠落/型不正 → null（ダミーを作らない）', () => {
    expect(parseInterviewSummary(JSON.stringify({ durationSeconds: 10, questionCount: 3 }))).toBeNull() // interviewId 無し
    expect(parseInterviewSummary(JSON.stringify({ interviewId: 'iv1', durationSeconds: 'x', questionCount: 3 }))).toBeNull()
    expect(parseInterviewSummary(JSON.stringify({ interviewId: '', durationSeconds: 10, questionCount: 3 }))).toBeNull()
  })
})

describe('summaryMatchesInterview (別面接/stale 誤表示防止)', () => {
  const s = { interviewId: 'iv1', durationSeconds: 372, questionCount: 6 }
  it('interview_id 一致 → true', () => {
    expect(summaryMatchesInterview(s, 'iv1')).toBe(true)
  })
  it('別 interview_id → false（前回/別面接の summary を使わない）', () => {
    expect(summaryMatchesInterview(s, 'iv2')).toBe(false)
  })
  it('summary null / interview_id 欠落 → false', () => {
    expect(summaryMatchesInterview(null, 'iv1')).toBe(false)
    expect(summaryMatchesInterview(s, null)).toBe(false)
    expect(summaryMatchesInterview(s, undefined)).toBe(false)
  })
})

describe('durationToMinutes', () => {
  it('秒 → 分（四捨五入・1分未満は 1）', () => {
    expect(durationToMinutes(372)).toBe(6) // 6.2 → 6
    expect(durationToMinutes(1500)).toBe(25)
    expect(durationToMinutes(20)).toBe(1) // 1分未満でも 0 にしない
  })
  it('0/不正 → null（—/非表示）', () => {
    expect(durationToMinutes(0)).toBeNull()
    expect(durationToMinutes(-1)).toBeNull()
    expect(durationToMinutes(NaN)).toBeNull()
  })
})

describe('questionCountDisplay', () => {
  it('正の整数 → その値', () => {
    expect(questionCountDisplay(6)).toBe(6)
  })
  it('0/不正 → null（—/非表示・推測値を出さない）', () => {
    expect(questionCountDisplay(0)).toBeNull()
    expect(questionCountDisplay(-3)).toBeNull()
    expect(questionCountDisplay(NaN)).toBeNull()
  })
})

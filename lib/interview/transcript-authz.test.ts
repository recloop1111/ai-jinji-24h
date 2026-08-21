import { describe, it, expect } from 'vitest'
import { authorizeTranscriptWrite } from './transcript-authz'

// PR-3B: Transcript 書込認可（純関数・DB/HTTP 非依存）。browser spoofing / 越権を全ケース網羅。
const SLUG = 'acme'
const token = { slug: SLUG, applicant_id: 'app-1' }
const company = { id: 'co-1' }
const applicant = { id: 'app-1', company_id: 'co-1' }
const interview = { id: 'iv-1', applicant_id: 'app-1', status: 'in_progress' }

const base = {
  slug: SLUG,
  tokenPayload: token,
  bodyApplicantId: 'app-1',
  bodyInterviewId: 'iv-1',
  company,
  applicant,
  interview,
}

describe('authorizeTranscriptWrite', () => {
  it('全整合 → ok', () => {
    expect(authorizeTranscriptWrite(base)).toEqual({ ok: true })
  })

  it('token 無効 → UNAUTHORIZED', () => {
    expect(authorizeTranscriptWrite({ ...base, tokenPayload: null })).toEqual({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('slug 不一致（token.slug != URL slug）→ UNAUTHORIZED', () => {
    expect(authorizeTranscriptWrite({ ...base, tokenPayload: { slug: 'other', applicant_id: 'app-1' } })).toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
    })
  })

  it('applicant_id が token と不一致 → UNAUTHORIZED（別応募者を騙れない）', () => {
    expect(authorizeTranscriptWrite({ ...base, bodyApplicantId: 'app-2' })).toEqual({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('interview_id 欠落 → UNAUTHORIZED', () => {
    expect(authorizeTranscriptWrite({ ...base, bodyInterviewId: '' })).toEqual({ ok: false, code: 'UNAUTHORIZED' })
  })

  it('company / applicant / interview いずれか不在 → NOT_FOUND', () => {
    expect(authorizeTranscriptWrite({ ...base, company: null }).ok).toBe(false)
    expect(authorizeTranscriptWrite({ ...base, company: null })).toMatchObject({ code: 'NOT_FOUND' })
    expect(authorizeTranscriptWrite({ ...base, applicant: null })).toMatchObject({ code: 'NOT_FOUND' })
    expect(authorizeTranscriptWrite({ ...base, interview: null })).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('DB applicant が token applicant と別実体 → UNAUTHORIZED', () => {
    expect(authorizeTranscriptWrite({ ...base, applicant: { id: 'app-x', company_id: 'co-1' } })).toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
    })
  })

  it('別会社の applicant（cross-company）→ FORBIDDEN', () => {
    expect(authorizeTranscriptWrite({ ...base, applicant: { id: 'app-1', company_id: 'co-OTHER' } })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    })
  })

  it('interview.id が body と不一致 → FORBIDDEN', () => {
    expect(authorizeTranscriptWrite({ ...base, interview: { id: 'iv-OTHER', applicant_id: 'app-1', status: 'in_progress' } })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    })
  })

  it('interview が別応募者のもの（cross-applicant）→ FORBIDDEN', () => {
    expect(authorizeTranscriptWrite({ ...base, interview: { id: 'iv-1', applicant_id: 'app-2', status: 'in_progress' } })).toEqual({
      ok: false,
      code: 'FORBIDDEN',
    })
  })

  it('completed interview → NOT_IN_PROGRESS（終了済みへ書けない）', () => {
    expect(authorizeTranscriptWrite({ ...base, interview: { ...interview, status: 'completed' } })).toEqual({
      ok: false,
      code: 'NOT_IN_PROGRESS',
    })
  })

  it('cancelled interview → NOT_IN_PROGRESS', () => {
    expect(authorizeTranscriptWrite({ ...base, interview: { ...interview, status: 'cancelled' } })).toEqual({
      ok: false,
      code: 'NOT_IN_PROGRESS',
    })
  })
})

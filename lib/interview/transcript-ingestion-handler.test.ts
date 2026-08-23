import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleTranscriptIngestion, type IngestionHandlerDeps, type IngestionContext } from './transcript-ingestion-handler'
import {
  InMemoryTranscriptRepository,
  TranscriptWriteError,
  TRANSCRIPT_TEXT_MAX,
  type SeqAllocator,
  type TranscriptRepository,
} from './transcript-write'
import { SeqAllocError } from './transcript-seq-allocator'
import type { TokenPayloadLike, CompanyRowLike, ApplicantRowLike, InterviewRowLike } from './transcript-authz'

// PR-19C: secure ingestion handler（fake/mock のみ・実 DB / OpenAI / network 非接続）。
const SLUG = 'demo'
const okPayload: TokenPayloadLike = { slug: SLUG, applicant_id: 'app-1' }
const company: CompanyRowLike = { id: 'co-1' }
const applicant: ApplicantRowLike = { id: 'app-1', company_id: 'co-1' }
const interview: InterviewRowLike = { id: 'iv-1', applicant_id: 'app-1', status: 'in_progress' }

const applicantBody = (over: Record<string, unknown> = {}) => ({
  token: 'tok',
  applicant_id: 'app-1',
  interview_id: 'iv-1',
  event_type: 'conversation.item.input_audio_transcription.completed',
  transcript: '前職では営業をしていました',
  item_id: 'item_1',
  content_index: 0,
  ...over,
})
const aiBody = (over: Record<string, unknown> = {}) => ({
  token: 'tok',
  applicant_id: 'app-1',
  interview_id: 'iv-1',
  event_type: 'response.audio_transcript.done',
  transcript: '志望動機を教えてください',
  item_id: 'item_ai',
  content_index: 0,
  response_id: 'resp_1',
  ...over,
})

interface Overrides {
  gate?: boolean
  payload?: TokenPayloadLike | null
  entities?: { company: CompanyRowLike | null; applicant: ApplicantRowLike | null; interview: InterviewRowLike | null }
  repo?: TranscriptRepository
  allocator?: SeqAllocator
}
function makeDeps(o: Overrides = {}) {
  const repo = o.repo ?? new InMemoryTranscriptRepository()
  let n = 0
  const allocSpy = vi.fn(async () => ++n)
  const allocator = o.allocator ?? ({ next: allocSpy } as SeqAllocator)
  const loadEntities = vi.fn(async () => o.entities ?? { company, applicant, interview })
  const ctx: IngestionContext = { loadEntities, repo, allocator }
  const openContext = vi.fn(() => ctx)
  const verifyToken = vi.fn(() => (o.payload === undefined ? okPayload : o.payload))
  const gate = vi.fn(() => o.gate ?? true)
  const deps: IngestionHandlerDeps = { gate, verifyToken, openContext }
  return { deps, repo: repo as InMemoryTranscriptRepository, allocSpy, loadEntities, openContext, verifyToken, gate }
}

afterEach(() => vi.restoreAllMocks())

describe('gate / auth 到達境界', () => {
  it('A/AJ: gate OFF → 503・verifyToken/openContext 未呼び出し（副作用0）', async () => {
    const { deps, openContext, verifyToken } = makeDeps({ gate: false })
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(r).toMatchObject({ ok: false, httpStatus: 503, code: 'TRANSCRIPT_INGEST_DISABLED' })
    expect(verifyToken).not.toHaveBeenCalled()
    expect(openContext).not.toHaveBeenCalled()
  })

  it('B: token 欠如 → 401・openContext 未呼び出し（bad token で DB 触らない）', async () => {
    const { deps, openContext } = makeDeps({ payload: null })
    const r = await handleTranscriptIngestion(applicantBody({ token: undefined }), SLUG, deps)
    expect(r).toMatchObject({ httpStatus: 401, code: 'UNAUTHORIZED' })
    expect(openContext).not.toHaveBeenCalled()
  })

  it('C: 無効 token → 401・openContext 0', async () => {
    const { deps, openContext } = makeDeps({ payload: null })
    expect((await handleTranscriptIngestion(applicantBody(), SLUG, deps)).httpStatus).toBe(401)
    expect(openContext).not.toHaveBeenCalled()
  })

  it('D: 期限切れ token（verify が null）→ 401・openContext 0', async () => {
    const { deps, openContext } = makeDeps({ payload: null })
    expect((await handleTranscriptIngestion(applicantBody(), SLUG, deps)).httpStatus).toBe(401)
    expect(openContext).not.toHaveBeenCalled()
  })

  it('E: slug 不一致 → 401・openContext 0（DB 触らない）', async () => {
    const { deps, openContext } = makeDeps({ payload: { slug: 'other', applicant_id: 'app-1' } })
    expect((await handleTranscriptIngestion(applicantBody(), SLUG, deps)).httpStatus).toBe(401)
    expect(openContext).not.toHaveBeenCalled()
  })

  it('F: applicant 不一致（body != token）→ 401・openContext 0', async () => {
    const { deps, openContext } = makeDeps()
    const r = await handleTranscriptIngestion(applicantBody({ applicant_id: 'app-ATTACKER' }), SLUG, deps)
    expect(r.httpStatus).toBe(401)
    expect(openContext).not.toHaveBeenCalled()
  })

  it('G: 別 interview（別 applicant の interview）→ 403 FORBIDDEN', async () => {
    const { deps } = makeDeps({ entities: { company, applicant, interview: { id: 'iv-1', applicant_id: 'app-OTHER', status: 'in_progress' } } })
    expect((await handleTranscriptIngestion(applicantBody(), SLUG, deps)).httpStatus).toBe(403)
  })

  it('H: cross-company（applicant が別会社）→ 403 FORBIDDEN', async () => {
    const { deps } = makeDeps({ entities: { company, applicant: { id: 'app-1', company_id: 'co-OTHER' }, interview } })
    expect((await handleTranscriptIngestion(applicantBody(), SLUG, deps)).httpStatus).toBe(403)
  })

  it('I: in_progress → 200 success（seq=1）', async () => {
    const { deps, repo } = makeDeps()
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(r).toMatchObject({ ok: true, httpStatus: 200, data: { status: 'inserted', seq: 1 } })
    expect(repo.all()).toHaveLength(1)
  })

  it('J: completed → 409 INTERVIEW_NOT_ACTIVE', async () => {
    const { deps } = makeDeps({ entities: { company, applicant, interview: { ...interview, status: 'completed' } } })
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(r).toMatchObject({ httpStatus: 409, code: 'INTERVIEW_NOT_ACTIVE' })
  })

  it('K: cancelled → 409 INTERVIEW_NOT_ACTIVE', async () => {
    const { deps } = makeDeps({ entities: { company, applicant, interview: { ...interview, status: 'cancelled' } } })
    expect((await handleTranscriptIngestion(applicantBody(), SLUG, deps)).httpStatus).toBe(409)
  })

  it('NOT_FOUND: interview 不在 → 404', async () => {
    const { deps } = makeDeps({ entities: { company, applicant, interview: null } })
    expect((await handleTranscriptIngestion(applicantBody(), SLUG, deps)).httpStatus).toBe(404)
  })
})

describe('speaker / field 導出（browser を信用しない）', () => {
  it('L: applicant final event → speaker applicant', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(repo.all()[0].speaker).toBe('applicant')
  })

  it('M: AI final event → speaker interviewer', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(aiBody(), SLUG, deps)
    expect(repo.all()[0].speaker).toBe('interviewer')
  })

  it('N: body speaker spoof を無視（event_type 由来を採用）', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody({ speaker: 'interviewer' }), SLUG, deps)
    expect(repo.all()[0].speaker).toBe('applicant')
  })

  it('O: body source spoof を無視（realtime 固定）', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody({ source: 'mock' }), SLUG, deps)
    expect(repo.all()[0].source).toBe('realtime')
  })

  it('P: body seq spoof を無視（server 採番=1）', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody({ seq: 999 }), SLUG, deps)
    expect(repo.all()[0].seq).toBe(1)
  })

  it('Q: body final spoof を無視（final=true 固定）', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody({ final: false }), SLUG, deps)
    expect(repo.all()[0].final).toBe(true)
  })

  it('R/X: body dedup spoof を無視・server 生成 `${speaker}:${itemId}:${contentIndex}`', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody({ dedup_key: 'evil', content_index: 2 }), SLUG, deps)
    expect(repo.all()[0].dedupKey).toBe('applicant:item_1:2')
  })

  it('write 対象 interviewId は DB 実体（body.interview_id を信用しない）', async () => {
    const { deps, repo } = makeDeps()
    // body.interview_id は探索キーとして iv-1（token/DB と一致）。保存は interview.id を使う。
    await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(repo.all()[0].interviewId).toBe('iv-1')
  })
})

describe('event validation / limits', () => {
  it('S: unknown event → 400 INVALID_TRANSCRIPT_EVENT', async () => {
    const { deps } = makeDeps()
    const r = await handleTranscriptIngestion(applicantBody({ event_type: 'response.created' }), SLUG, deps)
    expect(r).toMatchObject({ httpStatus: 400, code: 'INVALID_TRANSCRIPT_EVENT' })
  })

  it('T: partial/delta event → 400（FINAL のみ）', async () => {
    const { deps } = makeDeps()
    expect((await handleTranscriptIngestion(applicantBody({ event_type: 'conversation.item.input_audio_transcription.delta' }), SLUG, deps)).code).toBe('INVALID_TRANSCRIPT_EVENT')
  })

  it('U: 空/空白 transcript → 400', async () => {
    const { deps } = makeDeps()
    expect((await handleTranscriptIngestion(applicantBody({ transcript: '   ' }), SLUG, deps)).code).toBe('INVALID_TRANSCRIPT_EVENT')
  })

  it('V: oversized transcript → 413 TRANSCRIPT_TOO_LARGE', async () => {
    const { deps } = makeDeps()
    const r = await handleTranscriptIngestion(applicantBody({ transcript: 'あ'.repeat(TRANSCRIPT_TEXT_MAX + 1) }), SLUG, deps)
    expect(r).toMatchObject({ httpStatus: 413, code: 'TRANSCRIPT_TOO_LARGE' })
  })

  it('W: item_id 欠落 → fail-safe 400（dedup_key=null で保存しない）', async () => {
    const { deps } = makeDeps()
    expect((await handleTranscriptIngestion(applicantBody({ item_id: undefined }), SLUG, deps)).code).toBe('INVALID_TRANSCRIPT_EVENT')
  })

  it('W: malformed content_index（string）→ fail-safe 400', async () => {
    const { deps } = makeDeps()
    expect((await handleTranscriptIngestion(applicantBody({ content_index: '0' }), SLUG, deps)).code).toBe('INVALID_TRANSCRIPT_EVENT')
  })

  it('W: item_id 過長 → 400', async () => {
    const { deps } = makeDeps()
    expect((await handleTranscriptIngestion(applicantBody({ item_id: 'x'.repeat(200) }), SLUG, deps)).code).toBe('INVALID_TRANSCRIPT_EVENT')
  })

  it('AF: HTML/script 風テキストは通常 text として保持', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody({ transcript: '<script>alert(1)</script>' }), SLUG, deps)
    expect(repo.all()[0].text).toBe('<script>alert(1)</script>')
  })

  it('AG: Unicode を保持', async () => {
    const { deps, repo } = makeDeps()
    await handleTranscriptIngestion(applicantBody({ transcript: '絵文字😀改行' }), SLUG, deps)
    expect(repo.all()[0].text).toBe('絵文字😀改行')
  })
})

describe('duplicate / seq / failures', () => {
  it('Y/Z: duplicate event → 行増えない・allocator 追加 call なし', async () => {
    const { deps, repo, allocSpy } = makeDeps()
    await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(repo.all()).toHaveLength(1)
    expect(allocSpy).toHaveBeenCalledTimes(1) // 2回目は既存 seq 再利用
  })

  it('AB: seq allocator failure → 500 SEQ_ALLOC_FAILED', async () => {
    const allocator: SeqAllocator = { next: async () => { throw new SeqAllocError('SEQ_ALLOC_DB_ERROR') } }
    const { deps } = makeDeps({ allocator })
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(r).toMatchObject({ httpStatus: 500, code: 'SEQ_ALLOC_FAILED' })
  })

  it('AC: repository failure → 500 TRANSCRIPT_SAVE_FAILED', async () => {
    const repo: TranscriptRepository = {
      findByDedupKey: async () => null,
      insert: async () => { throw new TranscriptWriteError('VALIDATION_ERROR') },
      replaceById: async () => { throw new TranscriptWriteError('VALIDATION_ERROR') },
    }
    const { deps } = makeDeps({ repo })
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(r).toMatchObject({ httpStatus: 500, code: 'TRANSCRIPT_SAVE_FAILED' })
  })

  it('AD: DEDUP_CONFLICT recovery → 200 updated（hard-fail しない）', async () => {
    // insert が並行競合で 23505 相当 → saveUtterance が re-find→update で解決。
    let inserted = false
    const existingPartial = { id: 'r1', interviewId: 'iv-1', speaker: 'applicant' as const, text: 'p', seq: 1, final: false, source: 'realtime' as const, dedupKey: 'applicant:item_1:0', language: null, createdAt: '2026-01-01T00:00:00.000Z' }
    const repo: TranscriptRepository = {
      findByDedupKey: async () => (inserted ? existingPartial : null),
      insert: async () => { inserted = true; throw new TranscriptWriteError('DEDUP_CONFLICT') },
      replaceById: async (_id, input) => ({ ...existingPartial, ...input, id: 'r1' }),
    }
    const { deps } = makeDeps({ repo })
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(r).toMatchObject({ ok: true, httpStatus: 200, data: { status: 'updated' } })
  })
})

describe('PII / response / no-side-effect', () => {
  it('AH: 成功/失敗フローで console.* を呼ばない', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { deps } = makeDeps()
    await handleTranscriptIngestion(applicantBody(), SLUG, deps) // success
    await handleTranscriptIngestion(applicantBody({ event_type: 'x' }), SLUG, deps) // error
    expect(errSpy).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('AI: 成功 response は {status, seq} のみ（text/token/PII を含まない）', async () => {
    const { deps } = makeDeps()
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(Object.keys(r.data ?? {}).sort()).toEqual(['seq', 'status'])
    const s = JSON.stringify(r)
    expect(s).not.toContain('前職では営業') // 本文
    expect(s).not.toContain('tok') // token
    expect(s).not.toContain('app-1') // applicant id
  })

  it('AI: error message に interviewId/本文を含めない', async () => {
    const { deps } = makeDeps({ entities: { company, applicant, interview: { ...interview, status: 'completed' } } })
    const r = await handleTranscriptIngestion(applicantBody(), SLUG, deps)
    expect(JSON.stringify(r)).not.toContain('iv-1')
    expect(JSON.stringify(r)).not.toContain('前職では営業')
  })
})

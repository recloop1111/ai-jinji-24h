import { describe, it, expect, vi } from 'vitest'
import {
  EvaluationService,
  FakeEvaluationProvider,
  InMemoryEvaluationRepository,
  computeTranscriptHash,
  type ProviderResult,
} from './service'
import { buildSystemPrompt } from './prompt'
import { EBCA_AXIS_IDS } from './ebca'
import { buildFinalTranscriptReadModel } from '../interview/transcript-view'
import { FIXTURE_SUFFICIENT, FIXTURE_NO_APPLICANT, FIXTURE_INJECTION, FIXTURE_PROTECTED_MENTION } from './fixtures'

// PR-4C: Service/Provider/Repository seam + synthetic E2E（OpenAI/DB 非接続・synthetic のみ）。

// 有効な 6軸 provider 出力（FIXTURE_SUFFICIENT の実在発話を quote）。
const validRaw = () => ({
  schema_version: 'ebca-1',
  overall: { status: 'ok', score: 999, recommendation: 'yes', confidence: 'medium' }, // score は再計算されるので任意
  summary: '面接の要約',
  axes: EBCA_AXIS_IDS.map((id, i) => ({
    axis_id: id,
    score: [16, 14, 12, 15, 13, 17][i],
    rank: 'B',
    confidence: 'high',
    insufficient_reason: null,
    evidence: [{ seq: 4, quote: '提案内容を変えていました' }],
    comment: 'c',
  })),
  strengths: [{ text: '顧客志向', evidence: [{ seq: 4, quote: '提案内容を変えていました' }] }],
  concerns: [],
  warnings: [],
})

const provider = (r: ProviderResult) => new FakeEvaluationProvider(r)
const newService = (p: FakeEvaluationProvider, repo = new InMemoryEvaluationRepository()) =>
  ({ service: new EvaluationService(p, repo), repo })

describe('computeTranscriptHash (決定的・内容/話者変化で別 hash)', () => {
  it('同一 transcript → 同一 hash', () => {
    const a = computeTranscriptHash(buildFinalTranscriptReadModel(FIXTURE_SUFFICIENT))
    const b = computeTranscriptHash(buildFinalTranscriptReadModel(FIXTURE_SUFFICIENT))
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('本文変更 → 別 hash', () => {
    const changed = FIXTURE_SUFFICIENT.map((r) => (r.seq === 4 ? { ...r, text: r.text + '（追記）' } : r))
    expect(computeTranscriptHash(buildFinalTranscriptReadModel(changed))).not.toBe(
      computeTranscriptHash(buildFinalTranscriptReadModel(FIXTURE_SUFFICIENT)),
    )
  })
  it('話者変更 → 別 hash', () => {
    const swapped = FIXTURE_SUFFICIENT.map((r) => (r.seq === 4 ? { ...r, speaker: 'interviewer' as const } : r))
    expect(computeTranscriptHash(buildFinalTranscriptReadModel(swapped))).not.toBe(
      computeTranscriptHash(buildFinalTranscriptReadModel(FIXTURE_SUFFICIENT)),
    )
  })
})

describe('Synthetic E2E: transcript → prompt → provider → validate → evidence → score → mapping → repo', () => {
  it('A: 正常評価 → success・total 計算・保存', async () => {
    const { service, repo } = newService(provider({ ok: true, raw: validRaw() }))
    const r = await service.evaluate({ interviewId: 'iv-1', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.status).toBe('success')
    expect(r.evaluation?.overall.score).toBeTypeOf('number')
    expect(r.evaluation?.axes.length).toBe(6)
    expect(repo.all()).toHaveLength(1)
    expect((repo.all()[0].record.detail_json.evaluation_meta as { transcript_hash: string }).transcript_hash).toBe(r.transcriptHash)
  })

  it('B: insufficient transcript（応募者 final なし）→ Provider 呼ばず insufficient', async () => {
    const p = vi.fn<() => Promise<ProviderResult>>()
    const service = new EvaluationService(new FakeEvaluationProvider(() => p()), new InMemoryEvaluationRepository())
    const r = await service.evaluate({ interviewId: 'iv-b', transcriptRows: FIXTURE_NO_APPLICANT })
    expect(r.status).toBe('insufficient')
    expect(r.evaluation?.overall.score).toBeNull()
    expect(p).not.toHaveBeenCalled() // provider を呼ばない（コスト節約）
  })

  it('C: 一部軸のみ評価可能 → 判定軸のみ total', async () => {
    const raw = validRaw()
    raw.axes[1].score = null as unknown as number
    raw.axes[1].evidence = []
    const { service } = newService(provider({ ok: true, raw }))
    const r = await service.evaluate({ interviewId: 'iv-c', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.status).toBe('success')
    expect(r.evaluation?.axes.filter((a) => a.score !== null).length).toBe(5)
  })

  it('D: hallucinated evidence → その score を保存しない（null 化）', async () => {
    const raw = validRaw()
    raw.axes[0].evidence = [{ seq: 4, quote: '海外MBAを取得しました' }] // transcript に無い
    const { service } = newService(provider({ ok: true, raw }))
    const r = await service.evaluate({ interviewId: 'iv-d', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.evaluation?.axes[0].score).toBeNull()
  })

  it('E: invalid seq → null', async () => {
    const raw = validRaw()
    raw.axes[0].evidence = [{ seq: 99, quote: 'x' }]
    const { service } = newService(provider({ ok: true, raw }))
    const r = await service.evaluate({ interviewId: 'iv-e', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.evaluation?.axes[0].score).toBeNull()
  })

  it('F: partial 発話を evidence 参照 → null', async () => {
    const withPartial = [...FIXTURE_SUFFICIENT, { id: 'p', interview_id: 'iv-f', speaker: 'applicant' as const, text: '未確定発言', seq: 7, final: false, source: 'synthetic' as const, dedup_key: null }]
    const raw = validRaw()
    raw.axes[0].evidence = [{ seq: 7, quote: '未確定発言' }]
    const { service } = newService(provider({ ok: true, raw }))
    const r = await service.evaluate({ interviewId: 'iv-f', transcriptRows: withPartial })
    expect(r.evaluation?.axes[0].score).toBeNull()
  })

  it('G: malformed provider output（object でない）→ crash せず insufficient', async () => {
    const { service } = newService(provider({ ok: true, raw: 'not json object' }))
    const r = await service.evaluate({ interviewId: 'iv-g', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.status).toBe('insufficient')
    expect(r.evaluation?.axes).toEqual([])
  })

  it('H: protected attribute 混入 → domain へ非混入・raw を丸ごと保存しない', async () => {
    const raw = { ...validRaw(), personality_type: 'INTJ', big_five: { o: 5 }, age: 30 }
    const { service, repo } = newService(provider({ ok: true, raw }))
    const r = await service.evaluate({ interviewId: 'iv-h', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.evaluation?.warnings).toContain('protected_content_excluded')
    const saved = JSON.stringify(repo.all()[0].record)
    expect(saved).not.toContain('INTJ')
    expect(saved).not.toContain('big_five')
  })

  it('I: prompt injection を含む transcript → system は固定命令のまま（provider に渡る system が改変されない）', async () => {
    let capturedSystem = ''
    const p = new FakeEvaluationProvider((prompt) => {
      capturedSystem = prompt.system
      return { ok: true, raw: validRaw() }
    })
    const service = new EvaluationService(p, new InMemoryEvaluationRepository())
    await service.evaluate({ interviewId: 'iv-i', transcriptRows: FIXTURE_INJECTION })
    expect(capturedSystem).toBe(buildSystemPrompt()) // transcript の指示で system は変わらない
  })

  it('J: duplicate evaluation → 2回目は Provider 呼ばず already_evaluated', async () => {
    const spy = vi.fn((): ProviderResult => ({ ok: true, raw: validRaw() }))
    const repo = new InMemoryEvaluationRepository()
    const service = new EvaluationService(new FakeEvaluationProvider(spy), repo)
    const r1 = await service.evaluate({ interviewId: 'iv-j', transcriptRows: FIXTURE_SUFFICIENT })
    const r2 = await service.evaluate({ interviewId: 'iv-j', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r1.status).toBe('success')
    expect(r2.status).toBe('already_evaluated')
    expect(spy).toHaveBeenCalledTimes(1) // 2回目は provider 未呼び出し
    expect(repo.all()).toHaveLength(1)
  })

  it('K: transcript 変更後は別 hash で再評価される', async () => {
    const spy = vi.fn((): ProviderResult => ({ ok: true, raw: validRaw() }))
    const repo = new InMemoryEvaluationRepository()
    const service = new EvaluationService(new FakeEvaluationProvider(spy), repo)
    await service.evaluate({ interviewId: 'iv-k', transcriptRows: FIXTURE_SUFFICIENT })
    const changed = FIXTURE_SUFFICIENT.map((r) => (r.seq === 6 ? { ...r, text: '別の回答に変更しました。' } : r))
    const r2 = await service.evaluate({ interviewId: 'iv-k', transcriptRows: changed })
    expect(r2.status).toBe('success')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(repo.all()).toHaveLength(2) // 別 hash → 別レコード
  })
})

describe('error handling / 失敗と insufficient の区別', () => {
  it('provider permanent failure → failed・保存しない（捏造しない）', async () => {
    const { service, repo } = newService(provider({ ok: false, failure: 'permanent' }))
    const r = await service.evaluate({ interviewId: 'iv-fail', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.status).toBe('failed')
    expect(r.failureReason).toBe('provider_permanent')
    expect(repo.all()).toHaveLength(0) // failed は保存しない
  })
  it('provider が throw → failed（crash しない・保存しない）', async () => {
    const p = new FakeEvaluationProvider(() => {
      throw new Error('timeout')
    })
    const repo = new InMemoryEvaluationRepository()
    const service = new EvaluationService(p, repo)
    const r = await service.evaluate({ interviewId: 'iv-throw', transcriptRows: FIXTURE_SUFFICIENT })
    expect(r.status).toBe('failed')
    expect(repo.all()).toHaveLength(0)
  })
  it('repository failure でも Promise reject を握って呼び出し側へ伝播（無限ループしない）', async () => {
    const failingRepo = {
      findByInterviewAndHash: async () => null,
      save: async () => {
        throw new Error('db down')
      },
    }
    const service = new EvaluationService(provider({ ok: true, raw: validRaw() }), failingRepo)
    await expect(service.evaluate({ interviewId: 'iv-r', transcriptRows: FIXTURE_SUFFICIENT })).rejects.toThrow()
  })
})

describe('evidence enforcement / null≠0 / raw を直接保存しない', () => {
  it('provider の score をそのまま権威にせず、evidence 検証後の domain を保存', async () => {
    const raw = validRaw()
    raw.axes[0].score = 20
    raw.axes[0].evidence = [] // evidence 無し → 20 を信用しない
    const { service, repo } = newService(provider({ ok: true, raw }))
    await service.evaluate({ interviewId: 'iv-ev', transcriptRows: FIXTURE_SUFFICIENT })
    const axes = repo.all()[0].record.evaluation_axes as { axis: string; score: number | null }[]
    const comm = axes.find((a) => a.axis === 'communication')
    expect(comm?.score).toBeNull() // 20 ではなく null（0 でもない）
  })
  it('protected 混入 transcript でも body を削除せず、評価は domain のみ保存', async () => {
    const { service, repo } = newService(provider({ ok: true, raw: validRaw() }))
    const r = await service.evaluate({ interviewId: 'iv-pm', transcriptRows: FIXTURE_PROTECTED_MENTION })
    // 応募者 final があるので provider が呼ばれ評価される（evidence は transcript 依存で null になり得る）
    expect(['success', 'insufficient']).toContain(r.status)
    expect(repo.all()).toHaveLength(1)
  })
})

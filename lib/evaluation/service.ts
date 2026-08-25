// PR-4C: 評価処理全体の「本番用境界」を確定する Service / Provider / Repository seam（OpenAI/DB 非接続）。
//   Transcript → Prompt(4B) → Provider(外部・信頼しない) → validation/evidence/scoring(4A) → mapping → Repository。
// 4E で OpenAIEvaluationProvider を差し込めば実評価へ移行できる。Service に OpenAI 固有コードを入れない。
// Provider 出力は「信頼できない外部出力」として必ず 4A の validation を通す（生出力を直接保存する経路を作らない）。

import { createHash } from 'node:crypto'
import type { EvaluationResult } from './ebca'
import { normalizeEvaluation } from './evaluate'
import { hasEvaluableTranscript } from './evidence'
import { buildEvaluationPrompt, EVALUATION_PROMPT_VERSION, type EvaluationJobContext, type EvaluationPrompt } from './prompt'
import { mapEvaluationResultToInterviewResult, type InterviewResultRecord } from './mapping'
import { buildFinalTranscriptReadModel } from '../interview/transcript-view'
import { buildEvaluationInputFromRows } from '../interview/transcript-read'
import type { TranscriptReadItem } from '../interview/transcript-read'

// ── Provider（4E で OpenAI 実装を差し込む interface）─────────────────────────────────────
// 返り値の raw は「信頼できない外部出力」。ok:false は provider レベルの失敗（temporary/permanent）。
export type ProviderResult = { ok: true; raw: unknown } | { ok: false; failure: 'temporary' | 'permanent' }
export interface EvaluationProvider {
  evaluate(prompt: EvaluationPrompt): Promise<ProviderResult>
}

// ── Repository（4E で Supabase service-role 実装。ここでは interface + InMemory fake のみ）──────────
// 認可境界（company/applicant scope 等）は本 seam に作り込まない（API/service-role 層の責務）。
export interface StoredEvaluation {
  id: string
  interviewId: string
  transcriptHash: string
  record: InterviewResultRecord
}
export interface EvaluationRepository {
  findByInterviewAndHash(interviewId: string, transcriptHash: string): Promise<StoredEvaluation | null>
  save(interviewId: string, transcriptHash: string, record: InterviewResultRecord): Promise<StoredEvaluation>
}

// ── transcript hash（決定的・PII は hash 入力のみ＝ログに出さない）──────────────────────────────
// final のみ・seq 昇順の canonical（seq/speaker/text）を sha256。内容/話者/論理順の変化で別 hash になる。
export function computeTranscriptHash(readModel: readonly TranscriptReadItem[]): string {
  const canonical = [...(Array.isArray(readModel) ? readModel : [])]
    .filter((i) => i && i.final === true)
    .sort((a, b) => a.seq - b.seq)
    .map((i) => ({ seq: i.seq, speaker: i.speaker, text: i.text }))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

// ── Service 結果（success / insufficient / failed / already_evaluated を明示的に区別）───────────────
// 失敗（provider）と insufficient_data（正当な判断材料不足）を混同しない。失敗は保存しない（再試行可）。
export type EvaluationServiceStatus = 'success' | 'insufficient' | 'failed' | 'already_evaluated'
export interface EvaluationServiceResult {
  status: EvaluationServiceStatus
  transcriptHash: string
  evaluation?: EvaluationResult
  record?: InterviewResultRecord
  failureReason?: 'provider_temporary' | 'provider_permanent'
}

export interface EvaluationServiceOptions {
  promptVersion?: string
  now?: () => string // evaluated_at seam（省略時は null）。純粋性のため注入可能。
}

export class EvaluationService {
  private readonly promptVersion: string
  private readonly now: () => string | null
  constructor(
    private readonly provider: EvaluationProvider,
    private readonly repo: EvaluationRepository,
    opts?: EvaluationServiceOptions,
  ) {
    this.promptVersion = opts?.promptVersion ?? EVALUATION_PROMPT_VERSION
    this.now = opts?.now ?? (() => null)
  }

  async evaluate(input: {
    interviewId: string
    transcriptRows: unknown // PR-3 の生 rows（内部 schema は解釈しない・public 関数へ渡すだけ）
    job?: EvaluationJobContext | null
  }): Promise<EvaluationServiceResult> {
    // PR-3 の public 境界のみ利用（内部 row/dedup_key/source を解釈しない）。
    const readModel = buildFinalTranscriptReadModel(input.transcriptRows)
    const transcriptText = buildEvaluationInputFromRows(input.transcriptRows)
    const transcriptHash = computeTranscriptHash(readModel)

    // idempotency: 同一 interview+hash が評価済みなら Provider を呼ばない（重複評価/重複課金を防ぐ）。
    const existing = await this.repo.findByInterviewAndHash(input.interviewId, transcriptHash)
    if (existing) {
      return { status: 'already_evaluated', transcriptHash, record: existing.record }
    }

    // 評価入力が実質存在しない（final 応募者発話ゼロ）→ Provider を呼ばず insufficient を確定・保存（コスト節約）。
    if (!hasEvaluableTranscript(readModel)) {
      const result = normalizeEvaluation({ raw: {}, transcript: readModel }) // insufficient_data
      const record = await this.persist(input.interviewId, transcriptHash, result)
      return { status: 'insufficient', transcriptHash, evaluation: result, record }
    }

    // Prompt を組み立てて Provider（4E で OpenAI）へ。Provider が throw/失敗しても Service は crash しない。
    const prompt = buildEvaluationPrompt({ job: input.job ?? null, transcriptText })
    let out: ProviderResult
    try {
      out = await this.provider.evaluate(prompt)
    } catch {
      // provider の例外（timeout 相当等）→ failed（保存しない＝再試行可。Service は再試行しない＝無限ループ防止）。
      return { status: 'failed', transcriptHash, failureReason: 'provider_temporary' }
    }
    if (!out.ok) {
      return { status: 'failed', transcriptHash, failureReason: out.failure === 'permanent' ? 'provider_permanent' : 'provider_temporary' }
    }

    // Provider の raw は信頼しない → 必ず 4A validation/evidence/scoring/insufficient を通す。
    const result = normalizeEvaluation({ raw: out.raw, transcript: readModel })
    const record = await this.persist(input.interviewId, transcriptHash, result)
    const status: EvaluationServiceStatus = result.overall.status === 'insufficient_data' ? 'insufficient' : 'success'
    return { status, transcriptHash, evaluation: result, record }
  }

  private async persist(interviewId: string, transcriptHash: string, result: EvaluationResult): Promise<InterviewResultRecord> {
    const record = mapEvaluationResultToInterviewResult(interviewId, result, {
      transcriptHash,
      promptVersion: this.promptVersion,
      evaluatedAt: this.now(),
    })
    await this.repo.save(interviewId, transcriptHash, record)
    return record
  }
}

// ── テスト用 fake（実 OpenAI/DB へは一切アクセスしない）───────────────────────────────────────
export class FakeEvaluationProvider implements EvaluationProvider {
  constructor(private readonly impl: ProviderResult | ((prompt: EvaluationPrompt) => ProviderResult | Promise<ProviderResult>)) {}
  async evaluate(prompt: EvaluationPrompt): Promise<ProviderResult> {
    return typeof this.impl === 'function' ? this.impl(prompt) : this.impl
  }
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  private store = new Map<string, StoredEvaluation>()
  private seq = 0
  private key(interviewId: string, hash: string) {
    return `${interviewId}::${hash}`
  }
  async findByInterviewAndHash(interviewId: string, transcriptHash: string): Promise<StoredEvaluation | null> {
    return this.store.get(this.key(interviewId, transcriptHash)) ?? null
  }
  async save(interviewId: string, transcriptHash: string, record: InterviewResultRecord): Promise<StoredEvaluation> {
    const stored: StoredEvaluation = { id: `mem-${++this.seq}`, interviewId, transcriptHash, record }
    this.store.set(this.key(interviewId, transcriptHash), stored)
    return stored
  }
  all(): StoredEvaluation[] {
    return [...this.store.values()]
  }
}

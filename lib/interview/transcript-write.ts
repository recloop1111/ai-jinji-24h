// PR-3B: Transcript 書込サービス（純ロジック・DB/HTTP 非依存）。
//
// 信頼境界の要点:
//   - 信頼できる書込は「サーバ側で確定した属性」で組み立てた TranscriptWriteInput に対してのみ行う。
//     speaker / source / interviewId / seq は「trusted server only」＝ブラウザ入力を信用しない。
//   - ブラウザが送ってよいのは text / dedupKey / final / language のみ（parseBrowserTranscriptBody）。
//   - 実際の永続化は repository interface に委譲する。#19 server relay も「同じ saveUtterance」を
//     server-side から直接呼べる（HTTP を経由しない trusted 経路）＝writer seam。
//   - PR-3A schema 未適用のため、本番 repository（Supabase）実装は本 PR では配線しない。
//     テストは InMemory fake repository / fake seq allocator のみ（実 DB へ書かない）。
//   - PII: 本文（text）や失敗理由に本文を載せない。throw する Error も汎用コードのみ。

import {
  isValidSeq,
  isTranscriptSpeaker,
  isTranscriptSource,
  type TranscriptSpeaker,
  type TranscriptSource,
} from './transcript'

// 上限（DB CHECK と整合。text は interview_transcripts_text_len_chk と一致）。
export const TRANSCRIPT_TEXT_MAX = 20000
export const TRANSCRIPT_DEDUP_KEY_MAX = 200
export const TRANSCRIPT_LANGUAGE_MAX = 16

export type TranscriptWriteErrorCode =
  | 'VALIDATION_ERROR'
  | 'TEXT_EMPTY'
  | 'TEXT_TOO_LONG'
  | 'INVALID_SPEAKER'
  | 'INVALID_SOURCE'
  | 'INVALID_SEQ'
  | 'INVALID_FINAL'
  | 'INVALID_DEDUP_KEY'
  | 'INVALID_LANGUAGE'
  | 'DEDUP_CONFLICT'

export class TranscriptWriteError extends Error {
  code: TranscriptWriteErrorCode
  constructor(code: TranscriptWriteErrorCode) {
    // 本文/PII を message に載せない（汎用コードのみ）。
    super(code)
    this.name = 'TranscriptWriteError'
    this.code = code
  }
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: TranscriptWriteErrorCode }

// ── ブラウザが送ってよいフィールドだけ（信頼属性 speaker/source/interviewId/seq は含めない）──────────
export interface BrowserTranscriptBody {
  text: string
  dedupKey: string | null
  final: boolean
  language: string | null
}

export function parseBrowserTranscriptBody(raw: unknown): ParseResult<BrowserTranscriptBody> {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'VALIDATION_ERROR' }
  const r = raw as Record<string, unknown>

  if (typeof r.text !== 'string') return { ok: false, code: 'VALIDATION_ERROR' }
  const text = r.text.trim()
  if (text.length === 0) return { ok: false, code: 'TEXT_EMPTY' }
  if (text.length > TRANSCRIPT_TEXT_MAX) return { ok: false, code: 'TEXT_TOO_LONG' }

  let final = true // 省略時は final 扱い
  if (r.final !== undefined) {
    if (typeof r.final !== 'boolean') return { ok: false, code: 'INVALID_FINAL' }
    final = r.final
  }

  let dedupKey: string | null = null
  if (r.dedup_key !== undefined && r.dedup_key !== null) {
    if (typeof r.dedup_key !== 'string') return { ok: false, code: 'INVALID_DEDUP_KEY' }
    if (r.dedup_key.length === 0 || r.dedup_key.length > TRANSCRIPT_DEDUP_KEY_MAX) {
      return { ok: false, code: 'INVALID_DEDUP_KEY' }
    }
    dedupKey = r.dedup_key
  }

  let language: string | null = null
  if (r.language !== undefined && r.language !== null) {
    if (typeof r.language !== 'string' || r.language.length > TRANSCRIPT_LANGUAGE_MAX) {
      return { ok: false, code: 'INVALID_LANGUAGE' }
    }
    language = r.language || null
  }

  return { ok: true, value: { text, dedupKey, final, language } }
}

// ── 信頼サービス入力（trusted caller = #19 relay / synthetic writer が組み立てる最終形）─────────────
export interface TranscriptWriteInput {
  interviewId: string
  speaker: TranscriptSpeaker
  text: string
  seq: number
  final: boolean
  source: TranscriptSource
  dedupKey: string | null
  language: string | null
}

export interface StoredUtterance extends TranscriptWriteInput {
  id: string
  createdAt: string
}

// trusted 入力の最終防御（サーバ組み立て後でも型/範囲を検証してから永続化する）。
export function validateTranscriptWriteInput(input: TranscriptWriteInput): ParseResult<TranscriptWriteInput> {
  if (!input || typeof input.interviewId !== 'string' || input.interviewId.length === 0) {
    return { ok: false, code: 'VALIDATION_ERROR' }
  }
  if (!isTranscriptSpeaker(input.speaker)) return { ok: false, code: 'INVALID_SPEAKER' }
  if (!isTranscriptSource(input.source)) return { ok: false, code: 'INVALID_SOURCE' }
  if (!isValidSeq(input.seq)) return { ok: false, code: 'INVALID_SEQ' }
  if (typeof input.final !== 'boolean') return { ok: false, code: 'INVALID_FINAL' }
  if (typeof input.text !== 'string') return { ok: false, code: 'VALIDATION_ERROR' }
  const text = input.text.trim()
  if (text.length === 0) return { ok: false, code: 'TEXT_EMPTY' }
  if (text.length > TRANSCRIPT_TEXT_MAX) return { ok: false, code: 'TEXT_TOO_LONG' }
  if (input.dedupKey !== null) {
    if (typeof input.dedupKey !== 'string' || input.dedupKey.length === 0 || input.dedupKey.length > TRANSCRIPT_DEDUP_KEY_MAX) {
      return { ok: false, code: 'INVALID_DEDUP_KEY' }
    }
  }
  if (input.language !== null) {
    if (typeof input.language !== 'string' || input.language.length > TRANSCRIPT_LANGUAGE_MAX) {
      return { ok: false, code: 'INVALID_LANGUAGE' }
    }
  }
  return { ok: true, value: { ...input, text } }
}

// ── repository / seq allocator interfaces（本番実装は #19 で・ここでは interface + fake のみ）──────────
export interface TranscriptRepository {
  // (interview_id, dedup_key) の既存を1件取得。dedup_key は非 null のときだけ呼ぶ（冪等対象）。
  findByDedupKey(interviewId: string, dedupKey: string): Promise<StoredUtterance | null>
  // 新規行を挿入。DB の partial unique(interview_id, dedup_key) 競合時は TranscriptWriteError('DEDUP_CONFLICT') を投げる契約。
  insert(input: TranscriptWriteInput): Promise<StoredUtterance>
  // 既存行の内容を差し替える（partial→final / 内容更新）。行は増やさない。
  replaceById(id: string, input: TranscriptWriteInput): Promise<StoredUtterance>
}

export interface SeqAllocator {
  // 面接内で単調増加の seq を採番する。本番は server-side（DB sequence / lock / RPC）で実装＝#19 へ carve。
  // MAX(seq)+1 の race-prone 方式は採らない（並行採番で衝突するため）。
  next(interviewId: string): Promise<number>
}

// ── idempotency + final-wins（純ロジック・repository/allocator に委譲）───────────────────────────────
export type SaveStatus = 'inserted' | 'updated' | 'skipped'
export interface SaveResult {
  status: SaveStatus
  utterance: StoredUtterance
}

// 既存行と新規 final から取るべき動作を決める（final-wins を明示）。
//   既存なし               → insert
//   既存 final & 新規 partial → skip（final→partial の後退を許さない）
//   それ以外               → update（partial→final / partial→partial / final→final duplicate は行を増やさず差し替え）
export function decideSaveAction(existing: { final: boolean } | null, incomingFinal: boolean): SaveStatus | 'insert-or-update' {
  if (!existing) return 'inserted'
  if (existing.final && !incomingFinal) return 'skipped'
  return 'updated'
}

// Transcript を1件、冪等に保存する。dedupKey が非 null のときだけ冪等（DB の partial unique と一致）。
// 並行 double-submit（両者 findByDedupKey で不在→両者 insert）に備え、insert の DEDUP_CONFLICT を捕捉して
// 再取得→decideSaveAction で解決する（retry-once）。
export async function saveUtterance(repo: TranscriptRepository, input: TranscriptWriteInput): Promise<SaveResult> {
  const valid = validateTranscriptWriteInput(input)
  if (!valid.ok) throw new TranscriptWriteError(valid.code)
  const v = valid.value

  // dedupKey 無し = 冪等対象外 → そのまま insert（別発話）。
  if (v.dedupKey === null) {
    return { status: 'inserted', utterance: await repo.insert(v) }
  }

  const existing = await repo.findByDedupKey(v.interviewId, v.dedupKey)
  const action = decideSaveAction(existing, v.final)

  if (action === 'skipped') return { status: 'skipped', utterance: existing! }
  if (action === 'updated') return { status: 'updated', utterance: await repo.replaceById(existing!.id, v) }

  // insert（既存なし）。並行 insert で DB unique に負けたら再取得して final-wins で解決（retry-once）。
  try {
    return { status: 'inserted', utterance: await repo.insert(v) }
  } catch (e) {
    if (e instanceof TranscriptWriteError && e.code === 'DEDUP_CONFLICT') {
      const now = await repo.findByDedupKey(v.interviewId, v.dedupKey)
      if (now) {
        const retryAction = decideSaveAction(now, v.final)
        if (retryAction === 'skipped') return { status: 'skipped', utterance: now }
        return { status: 'updated', utterance: await repo.replaceById(now.id, v) }
      }
    }
    throw e
  }
}

// ── テスト用 fake 実装（実 DB へは一切書かない・DB の制約を模す）──────────────────────────────────────
export class InMemoryTranscriptRepository implements TranscriptRepository {
  private rows: StoredUtterance[] = []
  private seq = 0

  async findByDedupKey(interviewId: string, dedupKey: string): Promise<StoredUtterance | null> {
    return this.rows.find((r) => r.interviewId === interviewId && r.dedupKey === dedupKey) ?? null
  }

  async insert(input: TranscriptWriteInput): Promise<StoredUtterance> {
    // DB の partial unique(interview_id, dedup_key) WHERE dedup_key IS NOT NULL を模す。
    if (input.dedupKey !== null) {
      const dup = this.rows.find((r) => r.interviewId === input.interviewId && r.dedupKey === input.dedupKey)
      if (dup) throw new TranscriptWriteError('DEDUP_CONFLICT')
    }
    const row: StoredUtterance = {
      ...input,
      id: `mem-${++this.seq}`,
      createdAt: new Date(0).toISOString(),
    }
    this.rows.push(row)
    return row
  }

  async replaceById(id: string, input: TranscriptWriteInput): Promise<StoredUtterance> {
    const idx = this.rows.findIndex((r) => r.id === id)
    if (idx < 0) throw new TranscriptWriteError('VALIDATION_ERROR')
    const updated: StoredUtterance = { ...this.rows[idx], ...input, id }
    this.rows[idx] = updated
    return updated
  }

  // テスト観測用（本番 interface には含めない）。
  all(): StoredUtterance[] {
    return [...this.rows]
  }
}

// 面接内で単調増加の seq を返す fake（本番の server-side allocator は #19）。
export class InMemorySeqAllocator implements SeqAllocator {
  private counters = new Map<string, number>()
  async next(interviewId: string): Promise<number> {
    const cur = this.counters.get(interviewId) ?? 0
    const next = cur + 1
    this.counters.set(interviewId, next)
    return next
  }
}

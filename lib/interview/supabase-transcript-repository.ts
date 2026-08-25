// PR-19B: interview_transcripts 用の Production TranscriptRepository（server-only・未配線）。
//
// 【重要 / 未配線】
//   * server-only。service-role client を扱うため client component から import しない。
//     `server-only` パッケージ未導入のため header で明示（本 module はどの route/Service にも未 import）。
//   * import 時・create 時に DB access しない（client を保持するだけ）。method 実行時のみ DB access。
//   * 本 PR では Production runtime からこの method を呼ばない（実 Supabase read/write = 0）。19C で route 配線。
//   * PII 非ログ: text / dedupKey / interviewId を log/throw message に載せない。error は非 PII code のみ。
//
// PR-3B の TranscriptRepository interface（findByDedupKey / insert / replaceById）を「再利用」する
// （新 interface を二重定義しない）。冪等は PR-3A の partial unique(interview_id, dedup_key) WHERE dedup_key IS NOT NULL
// に対応し、insert の unique 違反（Postgres 23505）を TranscriptWriteError('DEDUP_CONFLICT') に写像する
// （saveUtterance の retry-once 契約に一致）。seq 採番はここでは行わない（CALLER が SeqAllocator で採番済み）。

import {
  TranscriptWriteError,
  type TranscriptRepository,
  type TranscriptWriteInput,
  type StoredUtterance,
} from './transcript-write'
import { isTranscriptSpeaker, isTranscriptSource, isValidSeq } from './transcript'

const TABLE = 'interview_transcripts'
const PG_UNIQUE_VIOLATION = '23505'
const SELECT_COLS = 'id, interview_id, speaker, text, seq, final, source, dedup_key, language, created_at'

// 使う最小限の Supabase client 形（実 client も fake も満たす）。実 client 注入時は as unknown で受け渡す。
export interface TranscriptDbResult {
  data: unknown
  error: unknown
}
export interface TranscriptDbQuery {
  select(cols: string): TranscriptDbQuery
  eq(col: string, val: string): TranscriptDbQuery
  insert(row: Record<string, unknown>): TranscriptDbQuery
  update(row: Record<string, unknown>): TranscriptDbQuery
  maybeSingle(): Promise<TranscriptDbResult>
  single(): Promise<TranscriptDbResult>
}
export interface TranscriptDbClient {
  from(table: string): TranscriptDbQuery
}

function isPgUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as Record<string, unknown>).code === PG_UNIQUE_VIOLATION
}

// DB row（snake_case）→ domain StoredUtterance（camelCase）。型/範囲不正は throw（保存直後の自 row なので想定外）。
function rowToStored(data: unknown): StoredUtterance {
  if (!data || typeof data !== 'object') throw new TranscriptWriteError('VALIDATION_ERROR')
  const r = data as Record<string, unknown>
  if (!isTranscriptSpeaker(r.speaker)) throw new TranscriptWriteError('INVALID_SPEAKER')
  if (!isTranscriptSource(r.source)) throw new TranscriptWriteError('INVALID_SOURCE')
  if (!isValidSeq(r.seq)) throw new TranscriptWriteError('INVALID_SEQ')
  return {
    id: String(r.id ?? ''),
    interviewId: String(r.interview_id ?? ''),
    speaker: r.speaker,
    text: typeof r.text === 'string' ? r.text : '',
    seq: r.seq,
    final: r.final === true,
    source: r.source,
    dedupKey: typeof r.dedup_key === 'string' ? r.dedup_key : null,
    language: typeof r.language === 'string' ? r.language : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString(),
  }
}

// domain input（camelCase）→ DB row（snake_case）。metadata は書かない（DB DEFAULT '{}' に任せる）。
function inputToRow(input: TranscriptWriteInput): Record<string, unknown> {
  return {
    interview_id: input.interviewId,
    speaker: input.speaker,
    text: input.text,
    seq: input.seq,
    final: input.final,
    source: input.source,
    dedup_key: input.dedupKey,
    language: input.language,
  }
}

// client を注入（import/create で DB access しない）。実利用時は createServiceRoleClient() を as unknown で渡す。
export function createSupabaseTranscriptRepository(client: TranscriptDbClient): TranscriptRepository {
  return {
    async findByDedupKey(interviewId: string, dedupKey: string): Promise<StoredUtterance | null> {
      const { data, error } = await client
        .from(TABLE)
        .select(SELECT_COLS)
        .eq('interview_id', interviewId)
        .eq('dedup_key', dedupKey)
        .maybeSingle()
      if (error) throw new TranscriptWriteError('VALIDATION_ERROR') // 非 PII code（本文/PII を入れない）
      if (!data) return null
      return rowToStored(data)
    },

    async insert(input: TranscriptWriteInput): Promise<StoredUtterance> {
      const { data, error } = await client.from(TABLE).insert(inputToRow(input)).select(SELECT_COLS).single()
      if (error) {
        // partial unique(interview_id, dedup_key) 競合 → saveUtterance が retry-once で解決する契約。
        if (isPgUniqueViolation(error)) throw new TranscriptWriteError('DEDUP_CONFLICT')
        throw new TranscriptWriteError('VALIDATION_ERROR')
      }
      return rowToStored(data)
    },

    async replaceById(id: string, input: TranscriptWriteInput): Promise<StoredUtterance> {
      // 内容差し替え（partial→final / 内容更新）。行は増やさない。seq は入力の seq を維持（採番し直さない）。
      const { data, error } = await client.from(TABLE).update(inputToRow(input)).eq('id', id).select(SELECT_COLS).single()
      if (error) throw new TranscriptWriteError('VALIDATION_ERROR')
      return rowToStored(data)
    },
  }
}

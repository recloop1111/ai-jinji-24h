// PR-19B: server-authoritative な transcript seq 採番基盤（server-only・未配線）。
//
// 目的:
//   複数 Vercel serverless instance / 並行 request でも、同一 interview 内の transcript seq が
//   race しない「サーバ権威」の採番を提供する。ブラウザ採番・メモリカウンタ・MAX(seq)+1 は使わない。
//
// 採番方式（唯一の権威 = Postgres の row-level serialization）:
//   単一文の atomic UPDATE:
//     UPDATE public.interviews
//        SET next_transcript_seq = next_transcript_seq + 1
//      WHERE id = $1
//   RETURNING next_transcript_seq;
//   - SELECT→UPDATE の 2段は使わない（race するため）。単一 UPDATE は対象行に row lock を取り、
//     同一 interview への並行 UPDATE を DB が直列化する（別 interview は別行＝競合しない）。
//   - off-by-one 対策: 列は DEFAULT 0。increment 後の値を RETURNING するので「最初の採番 = 1」。
//     （列名 next_transcript_seq は「これまでに採番した数（= 直近に採番した seq）」を保持する counter。
//      採番のたびに +1 して更新後の値を返す＝ post-increment。first = 1 を test で保証する。）
//
// seq semantics（PR-3A の判断を維持）:
//   - seq = interview 単位の「論理的表示順」。server authoritative。
//   - 一意性そのものは business invariant にしない（UNIQUE(interview_id, seq) は追加しない）。
//   - gap を許容する（下記 dedup との責務分離）。
//
// dedup との責務分離（重要）:
//   - この allocator は「dedup 判定」を一切しない。新しい論理発話を作るときに CALLER が 1 回 next() する。
//   - partial→final 更新 / duplicate の再送では新しい seq を採番し直さない（既存行の seq を再利用する）
//     ＝ saveUtterance の 'updated'/'skipped' 経路では allocator を呼ばない、が CALLER 側の責務。
//   - 並行 duplicate で A=seq10 / B=seq11 を採番し、dedup partial-unique で片方だけ insert された結果
//     seq 11 が gap になっても正常。gap を埋めようとしない（allocator は gap を知らないし埋めない）。
//
// 認可の非所有:
//   allocator の責務は「認可済みの interviewId に seq を割り当てる」ことだけ。companyId/applicantId/
//   speaker/source/text の認可は 19C（ingestion route）が担う。ここには持ち込まない。
//
// server-only / 副作用:
//   - service-role client / 実行 runner は「注入」する。import 時・create 時に DB access しない。
//   - 実際の DB 発行は next() 実行時のみ。本 PR では Production runtime からは呼ばない（未配線）。
//   - PII 非ログ: interviewId / seq / text 等を log/throw message に載せない。error は非 PII code のみ。

import type { SeqAllocator } from './transcript-write'
import { isValidSeq } from './transcript'

export type SeqAllocErrorCode =
  | 'INVALID_INTERVIEW_ID'
  | 'SEQ_ALLOC_DB_ERROR'
  | 'INTERVIEW_NOT_FOUND'
  | 'SEQ_ALLOC_MALFORMED'

export class SeqAllocError extends Error {
  code: SeqAllocErrorCode
  constructor(code: SeqAllocErrorCode) {
    // 本文/PII/interviewId を message に載せない（汎用コードのみ）。
    super(code)
    this.name = 'SeqAllocError'
    this.code = code
  }
}

// atomic 採番の低レベル契約。EXACTLY「単一文 increment-and-return」を実行する。
//   成功: { seq: <新しい値 >=1>, error: null }
//   対象 interview 不在（RETURNING 0行）: { seq: null, error: null, missing: true }
//   DB 障害: { seq: null, error: <非null> }
// 返す seq の型/範囲検証（integer / >=1）は allocator 側で最終防御する（malformed を弾く）。
export interface AtomicSeqIncrement {
  (interviewId: string): Promise<{ seq: number | null; error: unknown; missing?: boolean }>
}

// SeqAllocator（transcript-write.ts の既存 interface を再利用・二重定義しない）の Production 実装。
// next() は注入された atomic increment を 1 回だけ呼び、返り値を「そのまま」使う（app 側で +1 しない）。
export function createTranscriptSeqAllocator(increment: AtomicSeqIncrement): SeqAllocator {
  return {
    async next(interviewId: string): Promise<number> {
      if (typeof interviewId !== 'string' || interviewId.length === 0) {
        throw new SeqAllocError('INVALID_INTERVIEW_ID') // DB を呼ぶ前に弾く
      }
      const { seq, error, missing } = await increment(interviewId)
      if (error) throw new SeqAllocError('SEQ_ALLOC_DB_ERROR') // fail-closed（採番できないなら保存に進ませない）
      if (missing || seq === null) throw new SeqAllocError('INTERVIEW_NOT_FOUND')
      if (!isValidSeq(seq)) throw new SeqAllocError('SEQ_ALLOC_MALFORMED') // 非整数 / <=0 / NaN を弾く
      return seq
    },
  }
}

// ── Supabase 向け atomic increment（server-only・raw statement runner を注入）─────────────────────
//
// 【重要】PostgREST の `.update({ col: value })` は「リテラル代入」しか表現できず、`col = col + 1` の
//   列参照 arithmetic を表現できない。したがって atomic increment は「単一の raw statement」を要する。
//   その実行器（runner）は本 lib に持たせず注入する（server-only の実行経路選択＝19C の配線判断。
//   例: service_role スコープの SECURITY INVOKER 経由 or 直 pg 接続。SELECT→UPDATE 2段や MAX(seq)+1 は不可）。
//   本 PR では runner を実装/配線しない（interface と契約のみ）。
export const ATOMIC_TRANSCRIPT_SEQ_SQL =
  'UPDATE public.interviews SET next_transcript_seq = next_transcript_seq + 1 WHERE id = $1 RETURNING next_transcript_seq'

export interface SeqStatementRunner {
  // ATOMIC_TRANSCRIPT_SEQ_SQL を params=[interviewId] で「単一文」実行する契約。複数文/暗黙 SELECT→UPDATE 禁止。
  run(sql: string, params: [string]): Promise<{ rows: Array<Record<string, unknown>>; error?: unknown }>
}

export function createRawSqlAtomicSeqIncrement(runner: SeqStatementRunner): AtomicSeqIncrement {
  return async (interviewId: string) => {
    let res: { rows: Array<Record<string, unknown>>; error?: unknown }
    try {
      res = await runner.run(ATOMIC_TRANSCRIPT_SEQ_SQL, [interviewId])
    } catch {
      // 例外本文（接続文字列等の PII を含み得る）を漏らさない。非 null error にして allocator で DB_ERROR 化。
      return { seq: null, error: 'SEQ_STMT_FAILED' }
    }
    if (res.error) return { seq: null, error: res.error }
    const rows = Array.isArray(res.rows) ? res.rows : []
    if (rows.length === 0) return { seq: null, error: null, missing: true } // 対象 interview 不在
    const raw = rows[0]?.next_transcript_seq
    const seq = typeof raw === 'number' ? raw : null // 非 number は allocator 側で malformed 判定させる
    return { seq, error: null }
  }
}

// ── fake（実 DB なし・テスト専用）───────────────────────────────────────────────────────────────
// interview 単位の post-increment counter。JS は単一スレッドのため 1 tick 内の increment は atomic。
// 【注意】これは「app 側オーケストレーションの検証用」。Postgres の row-lock 直列化を「証明」するものではない
//   （直列化は上記 ATOMIC_TRANSCRIPT_SEQ_SQL の単一文 UPDATE + row lock という DB semantics が担保する）。
export class InMemoryAtomicSeqIncrement {
  private counters = new Map<string, number>()
  private known: Set<string> | null
  // known=null なら全 interview 実在扱い。Set を渡すと「その id のみ実在」（未知は missing=true）。
  constructor(knownInterviewIds?: string[]) {
    this.known = knownInterviewIds ? new Set(knownInterviewIds) : null
  }
  readonly fn: AtomicSeqIncrement = async (interviewId: string) => {
    if (this.known && !this.known.has(interviewId)) return { seq: null, error: null, missing: true }
    const next = (this.counters.get(interviewId) ?? 0) + 1
    this.counters.set(interviewId, next)
    return { seq: next, error: null }
  }
}

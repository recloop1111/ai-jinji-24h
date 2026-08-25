// PR-19C: Transcript ingestion の Production 依存 factory（server-only・gate OFF 時は未到達）。
//
// 【重要 / server-only・副作用なし】
//   * server-only（`server-only` パッケージ未導入のため header で明示）。service-role client を扱うため
//     client component から import しない（本 module は route からのみ import）。
//   * import しただけで DB/network access しない。create しただけでも DB access しない（client を注入・保持のみ）。
//     実 method（loadEntities / allocator.next / repo.*）呼び出し時のみ副作用。
//   * 本 PR では Production runtime からこの依存を実行しない（route が gate OFF で 503・到達しない）。
//
// atomic seq 採番の concrete executor（PR-19B で未確定だった点）を確定:
//   方式 A = PostgreSQL function public.allocate_transcript_seq(uuid) を service-role の supabase.rpc() で呼ぶ。
//   関数は単一文 UPDATE ... SET next_transcript_seq = next_transcript_seq + 1 ... RETURNING（row-lock 直列化）。
//   PostgREST の .update() では col = col + 1 を表現できないため RPC を採用（既存 auth_throttle_* と同パターン）。
//   関数は SECURITY INVOKER（service_role が interviews に UPDATE 権限を持つため昇格不要）・search_path=''・
//   EXECUTE は service_role のみ（public/anon/authenticated から REVOKE）。migration 草案は supabase/rls/ に用意（未適用）。

import { createSupabaseTranscriptRepository, type TranscriptDbClient } from './supabase-transcript-repository'
import { createTranscriptSeqAllocator, type AtomicSeqIncrement } from './transcript-seq-allocator'
import type { IngestionContext } from './transcript-ingestion-handler'
import type { CompanyRowLike, ApplicantRowLike, InterviewRowLike } from './transcript-authz'

// rpc を持つ最小 client 形（実 supabase client / fake が満たす）。
export interface RpcCapableClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

// allocate_transcript_seq(uuid) を service-role の rpc で呼ぶ atomic increment。返り値は新しい seq（>=1）。
//   data=null（対象 interview 不在）→ missing。error → そのまま（allocator が DB_ERROR 化して fail-closed）。
export function createRpcAtomicSeqIncrement(client: RpcCapableClient): AtomicSeqIncrement {
  return async (interviewId: string) => {
    const { data, error } = await client.rpc('allocate_transcript_seq', { p_interview_id: interviewId })
    if (error) return { seq: null, error }
    if (data === null || data === undefined) return { seq: null, error: null, missing: true }
    const seq = typeof data === 'number' ? data : null // 非 number は allocator 側で malformed 判定
    return { seq, error: null }
  }
}

// loadEntities 用の最小 client 形（select/eq/maybeSingle）。
interface EntityDbQuery {
  select(cols: string): EntityDbQuery
  eq(col: string, val: string): EntityDbQuery
  maybeSingle(): Promise<{ data: unknown; error: unknown }>
}
interface EntityDbClient {
  from(table: string): EntityDbQuery
}

function asCompany(data: unknown): CompanyRowLike | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  return typeof r.id === 'string' ? { id: r.id } : null
}
function asApplicant(data: unknown): ApplicantRowLike | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.company_id !== 'string') return null
  return { id: r.id, company_id: r.company_id }
}
function asInterview(data: unknown): (InterviewRowLike & { endedAt: string | null }) | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.applicant_id !== 'string' || typeof r.status !== 'string') return null
  // PR-19D: completion grace 用に ended_at を随伴（/end が確定時に set する completed 時刻の Source of Truth）。
  return { id: r.id, applicant_id: r.applicant_id, status: r.status, endedAt: typeof r.ended_at === 'string' ? r.ended_at : null }
}

// route が createServiceRoleClient() を渡す（service-role・RLS bypass）。create では DB を触らない。
export function createProductionIngestionContext(client: unknown): IngestionContext {
  const entityClient = client as EntityDbClient
  return {
    async loadEntities({ slug, applicantId, interviewId }) {
      // slug→company / id→applicant / id→interview を個別取得（探索キーは authz+DB 実体で再検証される）。
      const companyRes = await entityClient.from('companies').select('id').eq('interview_slug', slug).maybeSingle()
      const applicantRes = applicantId
        ? await entityClient.from('applicants').select('id, company_id').eq('id', applicantId).maybeSingle()
        : { data: null, error: null }
      const interviewRes = interviewId
        ? await entityClient.from('interviews').select('id, applicant_id, status, ended_at').eq('id', interviewId).maybeSingle()
        : { data: null, error: null }
      return {
        company: asCompany(companyRes.data),
        applicant: asApplicant(applicantRes.data),
        interview: asInterview(interviewRes.data),
      }
    },
    repo: createSupabaseTranscriptRepository(client as TranscriptDbClient),
    allocator: createTranscriptSeqAllocator(createRpcAtomicSeqIncrement(client as RpcCapableClient)),
  }
}

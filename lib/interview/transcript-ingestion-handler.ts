// PR-19C: Transcript ingestion の HTTP 非依存ハンドラ（依存注入・単体テスト可能）。
//
// ここが「サーバ権威化」の中心。ブラウザ由来で信用してよいのは text（内容の真正性は保証しない・下記限界）と
// 「探索キー」(applicant_id / interview_id) と Realtime event の metadata(event_type / item_id / content_index /
// response_id / language) のみ。speaker / source / seq / final / dedup_key はブラウザから受け取っても一切使わない
// （サーバが event_type と DB から導出・採番・生成する）。
//
// 【text trust 限界（既知・方式 A の構造限界）】
//   SDP-proxy 構成では transcript text はブラウザ経由でしか得られず、内容は暗号学的に検証できない。
//   サーバが権威化するのは tenant / interview / applicant / speaker / source / final / seq / dedup 構造であり、
//   text 内容そのものではない。これは新規欠陥ではなく設計上の既知限界（将来 録画+whisper で trusted 経路化）。
//   API レスポンスにこの説明は出さない。
//
// gate OFF / token 無効時は openContext()（＝service-role client 生成・DB read・allocator RPC・repo）に到達しない。

import { TranscriptWriteError, TRANSCRIPT_TEXT_MAX, TRANSCRIPT_LANGUAGE_MAX, type TranscriptRepository, type SeqAllocator } from './transcript-write'
import {
  authorizeTranscriptWrite,
  type TokenPayloadLike,
  type CompanyRowLike,
  type ApplicantRowLike,
  type InterviewRowLike,
} from './transcript-authz'
import { parseRealtimeTranscriptEvent, buildTranscriptIngestionDTO } from './realtime-transcript-adapter'
import { ingestUtterance, TranscriptIngestLimitError, type IngestBase } from './transcript-ingestion'
import { SeqAllocError } from './transcript-seq-allocator'

// item_id / response_id の長さ上限。dedup_key = `${speaker}:${itemId}:${contentIndex}` を
// TRANSCRIPT_DEDUP_KEY_MAX(200) 以内に収めるための保守的な上限（speaker+区切り+index の余裕を残す）。
export const TRANSCRIPT_ITEM_ID_MAX = 128
export const TRANSCRIPT_RESPONSE_ID_MAX = 128

// 認可後に service-role で DB read / 採番 / 保存を行う実行コンテキスト（本番実装は production 側・fake も同形）。
export interface IngestionContext {
  loadEntities(keys: { slug: string; applicantId: string; interviewId: string }): Promise<{
    company: CompanyRowLike | null
    applicant: ApplicantRowLike | null
    interview: InterviewRowLike | null
  }>
  repo: TranscriptRepository
  allocator: SeqAllocator
}

export interface IngestionHandlerDeps {
  gate: () => boolean
  verifyToken: (token: string | null) => TokenPayloadLike | null
  // gate ON かつ token 有効のときにのみ呼ばれる（service-role client 生成をここに閉じ込める）。
  openContext: () => IngestionContext
}

export interface IngestionHandlerResult {
  ok: boolean
  httpStatus: number
  code: string
  message: string
  data?: { status: 'inserted' | 'updated' | 'skipped'; seq: number }
}

const err = (httpStatus: number, code: string, message: string): IngestionHandlerResult => ({ ok: false, httpStatus, code, message })

// 認可エラーコード → HTTP（PII/内部情報を漏らさない汎用メッセージ）。
function mapAuthz(code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'NOT_IN_PROGRESS'): IngestionHandlerResult {
  switch (code) {
    case 'UNAUTHORIZED':
      return err(401, 'UNAUTHORIZED', 'トークンが無効です')
    case 'FORBIDDEN':
      return err(403, 'FORBIDDEN', '不正なリクエストです')
    case 'NOT_FOUND':
      return err(404, 'NOT_FOUND', '対象が見つかりません')
    case 'NOT_IN_PROGRESS':
      return err(409, 'INTERVIEW_NOT_ACTIVE', '面接は進行中ではありません')
  }
}

export async function handleTranscriptIngestion(
  body: unknown,
  slug: string,
  deps: IngestionHandlerDeps,
): Promise<IngestionHandlerResult> {
  // 1) gate（本番 OFF）。ここで stop すれば openContext（service-role factory / DB / allocator / repo）に到達しない。
  if (!deps.gate()) return err(503, 'TRANSCRIPT_INGEST_DISABLED', 'Transcript の保存は現在無効です')

  if (!body || typeof body !== 'object') return err(400, 'VALIDATION_ERROR', 'リクエストボディが不正です')
  const b = body as Record<string, unknown>

  // 2) token 検証（署名/exp・純関数）。無効ならここで停止＝bad token では DB を一切触らない。
  const payload = deps.verifyToken(typeof b.token === 'string' ? b.token : null)
  if (!payload) return err(401, 'UNAUTHORIZED', 'トークンが無効です')

  const bodyApplicantId = typeof b.applicant_id === 'string' ? b.applicant_id : ''
  const bodyInterviewId = typeof b.interview_id === 'string' ? b.interview_id : ''

  // 2.5) token identity の明白な不一致（slug / applicant / interview_id 欠如）は DB を触らずに 401。
  //   authz でも再検証されるが、なりすまし token で service-role client を開かない（DB 露出を最小化）。
  if (payload.slug !== slug || !bodyApplicantId || bodyApplicantId !== payload.applicant_id || !bodyInterviewId) {
    return err(401, 'UNAUTHORIZED', 'トークンが無効です')
  }

  // 3) service-role コンテキストを開く（gate ON & token 有効 & token identity 一致のときだけ）。
  const ctx = deps.openContext()
  const { company, applicant, interview } = await ctx.loadEntities({ slug, applicantId: bodyApplicantId, interviewId: bodyInterviewId })

  // 4) 認可（token / 身元 / 所属 / 対象 / in_progress）を純関数で再検証。body の id は探索キーに過ぎない。
  const authz = authorizeTranscriptWrite({
    slug,
    tokenPayload: payload,
    bodyApplicantId,
    bodyInterviewId,
    company,
    applicant,
    interview,
  })
  if (!authz.ok) return mapAuthz(authz.code)
  // authz.ok の時点で interview は非 null かつ in_progress。以降 interview.id を書込対象に使う（body 値は使わない）。
  const interviewId = interview!.id

  // 5) request limits（本文サイズ・metadata 長）。text は既存 TRANSCRIPT_TEXT_MAX を Source of Truth に。
  if (typeof b.transcript === 'string' && b.transcript.length > TRANSCRIPT_TEXT_MAX) {
    return err(413, 'TRANSCRIPT_TOO_LARGE', 'Transcript が大きすぎます')
  }
  if (typeof b.item_id === 'string' && b.item_id.length > TRANSCRIPT_ITEM_ID_MAX) return err(400, 'INVALID_TRANSCRIPT_EVENT', 'イベントが不正です')
  if (typeof b.response_id === 'string' && b.response_id.length > TRANSCRIPT_RESPONSE_ID_MAX) return err(400, 'INVALID_TRANSCRIPT_EVENT', 'イベントが不正です')
  let language: string | null = null
  if (b.language !== undefined && b.language !== null) {
    if (typeof b.language !== 'string' || b.language.length > TRANSCRIPT_LANGUAGE_MAX) return err(400, 'INVALID_TRANSCRIPT_EVENT', 'イベントが不正です')
    language = b.language || null
  }

  // 6) speaker / source / seq / final はブラウザから受けない。event_type から 19A adapter で導出（再実装しない）。
  //    body.speaker / body.source / body.seq / body.final / body.dedup_key は「読まない」＝spoof 無視。
  const dto = buildTranscriptIngestionDTO(
    parseRealtimeTranscriptEvent({
      type: b.event_type,
      transcript: b.transcript,
      item_id: b.item_id,
      content_index: b.content_index,
      response_id: b.response_id,
    }),
  )
  // 未知/partial/delta event・空/空白 text・非 string は reject。
  if (!dto) return err(400, 'INVALID_TRANSCRIPT_EVENT', 'イベントが不正です')

  // 7) dedup_key をサーバ生成（PII/本文 hash なし）。FINAL event なのに item_id/content_index が欠ける場合は
  //    dedup_key=null で保存すると retry で重複行を生むため fail-safe で拒否する（実 Realtime FINAL event は両者を含む）。
  if (dto.itemId === null || dto.contentIndex === null) return err(400, 'INVALID_TRANSCRIPT_EVENT', 'イベントが不正です')
  const dedupKey = `${dto.speaker}:${dto.itemId}:${dto.contentIndex}`

  // 8) サーバ確定済みの書込入力（interviewId=DB 実体・source 固定・final=true・seq は ingest 内で必要時採番）。
  const base: IngestBase = {
    interviewId,
    speaker: dto.speaker, // event_type 由来（body.speaker は使わない）
    text: dto.text, // 内容は untrusted（上記 text 限界）。長さ/型は検証済み。
    final: true, // v1 は FINAL のみ
    source: 'realtime', // サーバ固定（body.source は使わない）
    dedupKey, // サーバ生成（body.dedup_key は使わない）
    language,
  }

  // 9) saveUtterance を再利用して冪等保存（seq は必要時のみ採番）。
  try {
    const result = await ingestUtterance(ctx.repo, ctx.allocator, base)
    return { ok: true, httpStatus: 200, code: 'OK', message: 'ok', data: { status: result.status, seq: result.utterance.seq } }
  } catch (e) {
    if (e instanceof TranscriptIngestLimitError) return err(429, 'TRANSCRIPT_LIMIT_REACHED', '発話数の上限に達しました')
    if (e instanceof SeqAllocError) return err(500, 'SEQ_ALLOC_FAILED', '内部エラーが発生しました')
    if (e instanceof TranscriptWriteError) return err(500, 'TRANSCRIPT_SAVE_FAILED', '内部エラーが発生しました')
    return err(500, 'INTERNAL_ERROR', 'サーバー内部エラーが発生しました')
  }
}

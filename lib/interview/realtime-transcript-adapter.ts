// PR-19A: OpenAI Realtime の transcript event → 後続の trusted ingestion（19C）が使う「内部 DTO」への変換層（純関数）。
//
// 責務: Realtime event を「安全に受け取り・話者を正規化」するだけ。DB 保存/route 配線/dedup_key 確定/seq 採番はしない。
//   - 話者正規化を 1 箇所に集約: AI 発話(role 'ai') → domain の 'interviewer' / 応募者 → 'applicant'。
//     domain（transcript.ts / saveUtterance / StoredUtterance / TranscriptReadItem）へ 'ai' を持ち込まない。
//   - v1 は FINAL イベントのみ（partial/delta は対象外）。将来 partial を足しても domain 非改修で済む責務分離。
//   - dedup_key は 19A では確定しない。19C が `${speaker}:${itemId}:${contentIndex}` を server 生成できるよう、
//     itemId / contentIndex / responseId を失わずに保持する（本文 hash は使わない・PII を dedup へ入れない）。
//
// 【trust boundary（重要）】この DTO は SDP-proxy 構成上、browser の data channel 経由でしか得られない Realtime
//   metadata を運ぶ。browser→server へ転送されるため、interviewId / seq / source / companyId / applicantId は
//   ここで確定しない（19C が capability token + DB + server 権威で再検証・確定する）。text も browser 由来であり
//   19C 側で長さ/型のみ検証する（内容の真正性は SDP-proxy では保証できない＝設計上の既知限界）。

import type { TranscriptSpeaker } from './transcript'
import { TRANSCRIPT_TEXT_MAX } from './transcript-write'

// Realtime 側の生 role（transport レベル。domain 型ではない）。'ai' はここまで。
export type RealtimeSpeakerRole = 'applicant' | 'ai'

// Realtime event から抽出した「生 metadata」（話者は未正規化・text 未検証）。
export interface RealtimeTranscriptEventMeta {
  role: RealtimeSpeakerRole
  text: string
  itemId: string | null
  contentIndex: number | null
  responseId: string | null
}

// 19C が ingestion payload / saveUtterance を組み立てるための正規化済み DTO（DB row 型ではない）。
// speaker は正規化済み（'ai' は入らない）・text は検証済み・final は v1 で常に true。
export interface TranscriptIngestionDTO {
  speaker: TranscriptSpeaker
  text: string
  itemId: string | null
  contentIndex: number | null
  responseId: string | null
  final: true
}

// 話者正規化（1箇所集約）。'ai'/'assistant' → 'interviewer'、'applicant'/'user' → 'applicant'、他は null。
export function normalizeRealtimeSpeaker(role: unknown): TranscriptSpeaker | null {
  if (role === 'ai' || role === 'assistant') return 'interviewer'
  if (role === 'applicant' || role === 'user') return 'applicant'
  return null
}

// 現行 realtime-client と同じ FINAL イベント判定（Source of Truth を合わせる）:
//   応募者: type が 'input_audio_transcription' を含み 'completed' で終わる（例 conversation.item.input_audio_transcription.completed）
//   AI:     type が 'audio_transcript' を含み 'done' で終わる（例 response.audio_transcript.done）
// partial/delta（.delta 等）や未知 event は対象外（null）。crash しない。
export function parseRealtimeTranscriptEvent(evt: unknown): RealtimeTranscriptEventMeta | null {
  if (!evt || typeof evt !== 'object') return null
  const o = evt as Record<string, unknown>
  const type = typeof o.type === 'string' ? o.type : ''
  if (!type) return null

  let role: RealtimeSpeakerRole
  if (type.includes('input_audio_transcription') && type.endsWith('completed')) role = 'applicant'
  else if (type.includes('audio_transcript') && type.endsWith('done')) role = 'ai'
  else return null // partial/delta/未知 event は対象外

  const text = typeof o.transcript === 'string' ? o.transcript : ''
  const itemId = typeof o.item_id === 'string' && o.item_id ? o.item_id : null
  const contentIndex =
    typeof o.content_index === 'number' && Number.isInteger(o.content_index) && o.content_index >= 0 ? o.content_index : null
  const responseId = typeof o.response_id === 'string' && o.response_id ? o.response_id : null

  return { role, text, itemId, contentIndex, responseId }
}

// 生 metadata → 正規化済み DTO。話者正規化 + text 検証（空/空白/oversized/非string を reject＝null）。
// 本文/PII を出力しない（純関数・ログしない）。HTML/script/Unicode は「通常 text」として保持（実行しない）。
export function buildTranscriptIngestionDTO(meta: RealtimeTranscriptEventMeta | null | undefined): TranscriptIngestionDTO | null {
  if (!meta || typeof meta !== 'object') return null
  const speaker = normalizeRealtimeSpeaker(meta.role)
  if (!speaker) return null
  if (typeof meta.text !== 'string') return null
  const text = meta.text.trim()
  if (text.length === 0 || text.length > TRANSCRIPT_TEXT_MAX) return null
  const itemId = typeof meta.itemId === 'string' && meta.itemId ? meta.itemId : null
  const contentIndex =
    typeof meta.contentIndex === 'number' && Number.isInteger(meta.contentIndex) && meta.contentIndex >= 0 ? meta.contentIndex : null
  const responseId = typeof meta.responseId === 'string' && meta.responseId ? meta.responseId : null
  return { speaker, text, itemId, contentIndex, responseId, final: true }
}

// event → DTO の一括ヘルパ（19C が Realtime event を直接 DTO 化するときに使える）。対象外/無効は null。
export function realtimeEventToIngestionDTO(evt: unknown): TranscriptIngestionDTO | null {
  return buildTranscriptIngestionDTO(parseRealtimeTranscriptEvent(evt))
}

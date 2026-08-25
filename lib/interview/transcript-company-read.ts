// Phase P3: 企業管理画面（応募者詳細）で会話ログ（Transcript）を表示するための read model（純ロジック）。
//   - DB fetch は呼び出し側（browser Supabase・RLS company_select_interview_transcripts）が行い、
//     ここは「取得結果 → 表示状態(4値)＋最小 DTO」への写像だけ（副作用なし＝単体テスト可能）。
//   - **最小 DTO**: speaker / text / seq / createdAt のみ。id / source / dedup_key / language / metadata 等の
//     内部情報は UI へ返さない（SELECT 列も最小化）。
//   - **4状態を区別**（同じ空表示にしない）:
//       ready          … 会話ログあり（items 1件以上）
//       empty          … テーブルは存在するが 0 件（正常な空）
//       schema_pending … interview_transcripts 未適用（missing-schema のみ safe fallback）
//       error          … permission denied / RLS / network / 不明 DB error（honest error・空で握り潰さない）
//   - PII（text）は log/HTML 化しない（プレーンテキストのみ・React 既定エスケープ）。

import { isTranscriptSpeaker, type TranscriptSpeaker } from './transcript'

// UI に渡す最小列だけを取得する（内部列は SELECT しない）。final は「確定発話のみ」表示のため取得。
export const TRANSCRIPT_DISPLAY_COLUMNS = 'speaker, text, seq, final, created_at'

export interface TranscriptDisplayItem {
  speaker: TranscriptSpeaker
  text: string
  seq: number
  createdAt: string | null
}

export type TranscriptFetchStatus = 'ready' | 'empty' | 'schema_pending' | 'error'

export interface TranscriptFetchState {
  status: TranscriptFetchStatus
  items: TranscriptDisplayItem[]
}

// interview_transcripts が「まだ Production に適用されていない」ことだけを検出する。
// これ以外（permission/RLS/network/unknown）は error として扱い、空で握り潰さない。
export function isMissingTranscriptTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const msg = typeof e.message === 'string' ? e.message : ''
  return code === '42P01' || code === 'PGRST205' || /does not exist|find the table|schema cache/i.test(msg)
}

// 生 rows → 表示 items（final のみ・seq 昇順・最小 DTO・不正行は除外）。
export function buildTranscriptDisplayItems(rows: unknown): TranscriptDisplayItem[] {
  if (!Array.isArray(rows)) return []
  const items: TranscriptDisplayItem[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (r.final !== true) continue // v1 は確定発話のみ表示
    if (!isTranscriptSpeaker(r.speaker)) continue
    if (typeof r.text !== 'string') continue
    if (typeof r.seq !== 'number' || !Number.isFinite(r.seq)) continue
    items.push({
      speaker: r.speaker,
      text: r.text,
      seq: r.seq,
      createdAt: typeof r.created_at === 'string' ? r.created_at : null,
    })
  }
  return items.sort((a, b) => a.seq - b.seq)
}

// supabase-js の結果（{ data, error }）→ 4状態。
export function resolveTranscriptFetchState(result: { data: unknown; error: unknown }): TranscriptFetchState {
  if (result.error) {
    if (isMissingTranscriptTableError(result.error)) return { status: 'schema_pending', items: [] }
    return { status: 'error', items: [] } // permission/RLS/network/unknown は honest error
  }
  const items = buildTranscriptDisplayItems(result.data)
  return { status: items.length === 0 ? 'empty' : 'ready', items }
}

// 話者ラベル（唯一の真実）。AI面接官 / 応募者。
export function speakerDisplayLabel(speaker: TranscriptSpeaker): string {
  return speaker === 'interviewer' ? 'AI面接官' : '応募者'
}

// PR-3C: Transcript の read model と評価入力への結線（UI/DB/HTTP 非依存・純ロジック）。
// PR-3A（normalize / ordering / serializer）と PR-3B（save service）を再利用し、重複 domain/serializer を作らない。
//
// 方針:
//   - 表示順の権威は seq（created_at だけで並べない）。到着順・保存順に依存しない。
//   - UI（PR-3D）へは内部フィールド（source / dedupKey / interviewId / language）を漏らさない投影を返す。
//   - PR-4 へは serializeTranscriptForEvaluation の「文字列」だけを渡す（DB 構造を PR-4 に漏らさない）。
//   - 本文（text）を console/log に出さない。HTML を生成しない。

import {
  normalizeTranscriptRows,
  orderUtterances,
  serializeTranscriptForEvaluation,
  type TranscriptSpeaker,
} from './transcript'

// UI 向け read item（内部/信頼属性を含めない投影）。PR-3A の domain 型から UI 表示に必要な最小限だけを露出する。
export interface TranscriptReadItem {
  id: string | null
  speaker: TranscriptSpeaker
  text: string
  seq: number
  final: boolean
  createdAt: string | null
}

// 生の行（DB SELECT / repository 由来・snake_case でも camelCase でも可）→ UI read model。
//   normalize（malformed は drop）→ order by seq（表示順の権威）→ UI 投影。
// PR-3D はこの配列をそのまま描画に使える（source/dedupKey 等の内部属性は含まれない）。
export function buildTranscriptReadModel(rows: unknown): TranscriptReadItem[] {
  const ordered = orderUtterances(normalizeTranscriptRows(rows))
  return ordered.map((u) => ({
    id: u.id ?? null,
    speaker: u.speaker,
    text: u.text,
    seq: u.seq,
    final: u.final,
    createdAt: u.createdAt ?? null,
  }))
}

// read flow → PR-4 評価入力（文字列）への結線。final のみ・seq 昇順・話者ラベル固定は
// serializeTranscriptForEvaluation が担保する（PR-3A の唯一の serializer を再利用）。
// PR-4 はこの「文字列」だけを受け取る（DB 構造・内部型を渡さない）。
export function buildEvaluationInputFromRows(rows: unknown): string {
  return serializeTranscriptForEvaluation(normalizeTranscriptRows(rows))
}

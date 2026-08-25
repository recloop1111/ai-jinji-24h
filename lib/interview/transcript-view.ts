// PR-3D: 企業管理画面「会話ログ」表示のための純ヘルパ（UI/DB 非依存＝単体テスト可能）。
// PR-3C の read model を再利用し、UI 側で ordering / final 判定を再実装しない。
// 本文（text）は PII。ここでは console/log に出さず、HTML も生成しない（プレーンテキストのみ）。

import { buildTranscriptReadModel, type TranscriptReadItem } from './transcript-read'
import type { TranscriptSpeaker } from './transcript'

// 企業画面の「権威ログ」= final=true のみ。partial は本番履歴として表示しない。
// normalize / seq 昇順は buildTranscriptReadModel（PR-3C）が担保する（ここで再実装しない）。
export function buildFinalTranscriptReadModel(rows: unknown): TranscriptReadItem[] {
  return buildTranscriptReadModel(rows).filter((it) => it.final === true)
}

// 表示ラベル（色だけに依存させないためのテキストラベル）。評価 serializer の「面接官/応募者」とは別に、
// UI では「AI面接官/応募者」を使う（画面文言）。話者ラベルはこの1箇所を唯一の真実にする。
const SPEAKER_DISPLAY: Record<TranscriptSpeaker, string> = {
  interviewer: 'AI面接官',
  applicant: '応募者',
}
export function speakerDisplayLabel(speaker: TranscriptSpeaker): string {
  return SPEAKER_DISPLAY[speaker]
}

// 会話ログ全体コピー用のプレーンテキスト（final のみ・空 text 除外・HTML 化しない）。
// 並び順は read model（seq 昇順）を前提にそのまま出力する（ここで並べ替えない）。
export function transcriptItemsToCopyText(items: readonly TranscriptReadItem[]): string {
  if (!Array.isArray(items)) return ''
  return items
    .filter((it) => !!it && it.final === true && typeof it.text === 'string' && it.text.trim().length > 0)
    .map((it) => `${speakerDisplayLabel(it.speaker)}\n${it.text.trim()}`)
    .join('\n\n')
}

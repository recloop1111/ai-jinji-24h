// PR-19C: Transcript ingestion の orchestration（純ロジック・Next/Supabase 非依存＝単体テスト可能）。
//
// 責務:
//   - 「新しい論理発話のときだけ」seq を採番する（duplicate / partial→final 更新では採番しない）。
//   - 実際の冪等判定（insert / update / skip / DEDUP_CONFLICT retry / final-wins / partial 後退防止）は
//     PR-3B の saveUtterance を「そのまま再利用」する（ここに再実装しない）。
//   - interview あたりの発話数に安全上限を設ける（abuse / 暴走の緩やかな上限）。
//
// seq 採番の責務境界（PR-19B / §12）:
//   route が先に必ず allocate する誤設計を避ける。ここで dedup を先読みし、既存行があれば seq を再利用
//   （採番しない）、無いときだけ allocator.next() を呼ぶ。並行 duplicate では両者が採番し得るが、
//   saveUtterance の DEDUP_CONFLICT retry で片方が update に解決し、余った seq は gap になる（PR-3A の
//   判断＝gap 許容・UNIQUE(interview_id, seq) 無し に一致。正常動作）。

import {
  saveUtterance,
  type SaveResult,
  type SeqAllocator,
  type TranscriptRepository,
  type TranscriptWriteInput,
} from './transcript-write'

// interview あたり最大発話数の安全上限。
//   根拠: 60 分面接・応募者/AI 交互で 1 発話 ≈ 数秒〜十数秒 → 現実的な最大でも数百発話。
//   2000 は「現実の上限の数倍」の緩衝（正常面接では到達しない）。product 仕様の制限ではなく暴走/abuse 防御。
//   到達時は保存を拒否（TRANSCRIPT_LIMIT_REACHED）。DB カウンタ追加は今回しない（seq 値を count proxy に使う）。
export const TRANSCRIPT_MAX_UTTERANCES_PER_INTERVIEW = 2000

export class TranscriptIngestLimitError extends Error {
  readonly code = 'TRANSCRIPT_LIMIT_REACHED' as const
  constructor() {
    super('TRANSCRIPT_LIMIT_REACHED') // 本文/PII を載せない（汎用コードのみ）
    this.name = 'TranscriptIngestLimitError'
  }
}

// seq を除いた「サーバ確定済み」書込入力（seq は本 orchestrator が必要時のみ採番して補完する）。
export type IngestBase = Omit<TranscriptWriteInput, 'seq'>

// 冪等に 1 発話を取り込む。seq は「新規 insert のときだけ」採番する（既存 dedup 一致は既存 seq を再利用）。
export async function ingestUtterance(
  repo: TranscriptRepository,
  allocator: SeqAllocator,
  base: IngestBase,
): Promise<SaveResult> {
  // 既存論理発話（同 dedupKey）があれば seq を再利用＝採番しない（duplicate/final 更新で seq を無駄にしない）。
  if (base.dedupKey !== null) {
    const existing = await repo.findByDedupKey(base.interviewId, base.dedupKey)
    if (existing) {
      // saveUtterance が update/skip を最終決定（final-wins / partial 後退防止はここに再実装しない）。
      return saveUtterance(repo, { ...base, seq: existing.seq })
    }
  }

  // 新規論理発話のときだけ採番（allocator は必要時のみ呼ばれる）。
  const seq = await allocator.next(base.interviewId)
  if (seq > TRANSCRIPT_MAX_UTTERANCES_PER_INTERVIEW) throw new TranscriptIngestLimitError()

  // 並行 double-insert は saveUtterance が DEDUP_CONFLICT retry で吸収する（余った seq は gap＝許容）。
  return saveUtterance(repo, { ...base, seq })
}

// PR-3A: 面接 Transcript の正規型と純ロジック（UI/DB/React 非依存＝単体テスト可能）。
// Realtime OFF のまま synthetic fixture で検証できる。DB fetch / 書込 API / 画面表示はここに含めない（PR-3B/3C/3D）。
//
// 設計原則:
//   - OpenAI Realtime の内部イベント構造（item_id / event 名 / 構造）に強依存しない。冪等は汎用 dedupKey に集約。
//   - DB row 型（snake_case）と domain 型（camelCase）を分離する。UI / 評価は domain 型のみ触る。
//   - 本文（text）は個人情報。この層では console/log へ出さない・HTML を生成しない（プレーンテキストのみ）。
//   - 冪等の「最終権威」は DB（partial unique index on (interview_id, dedup_key)）。ここの dedup は
//     読み取り側の防御的縮約であり、DB 制約の代替ではない（責務を混同しない）。

export type TranscriptSpeaker = 'applicant' | 'interviewer'
export type TranscriptSource = 'realtime' | 'server' | 'mock' | 'synthetic'

export const TRANSCRIPT_SPEAKERS: readonly TranscriptSpeaker[] = ['applicant', 'interviewer']
export const TRANSCRIPT_SOURCES: readonly TranscriptSource[] = ['realtime', 'server', 'mock', 'synthetic']

// 評価/表示ラベル（固定）。話者ラベルはここだけを唯一の真実にする。
const SPEAKER_LABELS: Record<TranscriptSpeaker, string> = {
  interviewer: '面接官',
  applicant: '応募者',
}

// DB row 型（列に対応・snake_case）。write API / read model の境界で使う。
export interface TranscriptRow {
  id?: string
  interview_id: string
  speaker: string
  text: string
  seq: number
  final: boolean
  source: string
  dedup_key?: string | null
  language?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string
}

// domain 型（UI/評価用・camelCase）。正規化済みで speaker/source は必ず妥当。
export interface TranscriptUtterance {
  id?: string
  interviewId: string
  speaker: TranscriptSpeaker
  text: string
  seq: number
  final: boolean
  source: TranscriptSource
  dedupKey?: string | null
  language?: string | null
  createdAt?: string
}

// ── validators ──────────────────────────────────────────────────────────────
export function isTranscriptSpeaker(v: unknown): v is TranscriptSpeaker {
  return v === 'applicant' || v === 'interviewer'
}

export function isTranscriptSource(v: unknown): v is TranscriptSource {
  return typeof v === 'string' && (TRANSCRIPT_SOURCES as readonly string[]).includes(v)
}

// seq は 1 以上の整数のみ妥当（DB CHECK と一致）。
export function isValidSeq(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v && v >= 1
}

// ── normalize（DB row / 未知入力 → domain）────────────────────────────────────
// malformed（speaker 不正 / text 非 string / seq 不正 / source 不正）は null を返す（crash しない・捨てる）。
export function normalizeTranscriptRow(row: unknown): TranscriptUtterance | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>

  const interviewId =
    typeof r.interview_id === 'string' && r.interview_id
      ? r.interview_id
      : typeof r.interviewId === 'string' && r.interviewId
        ? r.interviewId
        : ''
  if (!interviewId) return null

  if (!isTranscriptSpeaker(r.speaker)) return null
  if (typeof r.text !== 'string') return null
  if (!isValidSeq(r.seq)) return null
  if (!isTranscriptSource(r.source)) return null

  const final = typeof r.final === 'boolean' ? r.final : true
  const dedupKeyRaw = r.dedup_key ?? r.dedupKey
  const dedupKey = typeof dedupKeyRaw === 'string' && dedupKeyRaw ? dedupKeyRaw : null
  const language = typeof r.language === 'string' && r.language ? r.language : null
  const createdAtRaw = r.created_at ?? r.createdAt
  const createdAt = typeof createdAtRaw === 'string' ? createdAtRaw : undefined
  const id = typeof r.id === 'string' ? r.id : undefined

  return {
    id,
    interviewId,
    speaker: r.speaker,
    text: r.text,
    seq: r.seq,
    final,
    source: r.source,
    dedupKey,
    language,
    createdAt,
  }
}

// 配列を正規化（malformed 行は落とす）。crash しない。
export function normalizeTranscriptRows(rows: unknown): TranscriptUtterance[] {
  if (!Array.isArray(rows)) return []
  const out: TranscriptUtterance[] = []
  for (const row of rows) {
    const u = normalizeTranscriptRow(row)
    if (u) out.push(u)
  }
  return out
}

// domain → DB row（INSERT 用。PR-3B の write API が使う）。text はそのまま（サニタイズは表示側の責務）。
export function toTranscriptRow(u: TranscriptUtterance): TranscriptRow {
  return {
    interview_id: u.interviewId,
    speaker: u.speaker,
    text: u.text,
    seq: u.seq,
    final: u.final,
    source: u.source,
    dedup_key: u.dedupKey ?? null,
    language: u.language ?? null,
  }
}

// ── ordering / filtering ─────────────────────────────────────────────────────
// seq 昇順に並べる（安定ソート＝seq 同値は入力順を保つ）。入力は破壊しない。
export function orderUtterances(utterances: readonly TranscriptUtterance[]): TranscriptUtterance[] {
  return [...utterances].sort((a, b) => a.seq - b.seq)
}

// final=true のみ。
export function finalUtterances(utterances: readonly TranscriptUtterance[]): TranscriptUtterance[] {
  return utterances.filter((u) => u.final === true)
}

// dedupKey での防御的縮約（DB 制約の代替ではない・読み取り側の安全網）。
//   - dedupKey が非 null で重複する場合は「final を優先」して1件に縮約（final 無ければ最後の出現を残す）。
//   - dedupKey が null の行は縮約しない（冪等キー無し＝別発話として保持）。
export function dedupUtterances(utterances: readonly TranscriptUtterance[]): TranscriptUtterance[] {
  const byKey = new Map<string, TranscriptUtterance>()
  const passthrough: TranscriptUtterance[] = []
  const keyOrder: string[] = []

  for (const u of utterances) {
    if (!u.dedupKey) {
      passthrough.push(u)
      continue
    }
    const prev = byKey.get(u.dedupKey)
    if (!prev) {
      byKey.set(u.dedupKey, u)
      keyOrder.push(u.dedupKey)
    } else if (!prev.final && u.final) {
      // partial を final で上書き（final を権威にする）
      byKey.set(u.dedupKey, u)
    } else if (prev.final === u.final) {
      // 同 final 同士は後勝ち（最新の内容を残す）
      byKey.set(u.dedupKey, u)
    }
    // prev.final && !u.final（final の後に来た partial）は無視（final を保持）
  }

  const deduped = keyOrder.map((k) => byKey.get(k)!).filter(Boolean)
  return [...deduped, ...passthrough]
}

// ── serializer（PR-4 評価入力用）────────────────────────────────────────────
// DB 構造を PR-4 へ漏らさない正規化テキスト。final=true のみ・seq 昇順・話者ラベル固定・空 text 除外。
// malformed（非配列 / 欠損フィールド）で crash しない。HTML を生成しない（プレーンテキスト）。本文を log しない。
export function serializeTranscriptForEvaluation(
  utterances: readonly TranscriptUtterance[] | null | undefined,
): string {
  if (!Array.isArray(utterances)) return ''

  const rows = utterances
    .filter((u): u is TranscriptUtterance => !!u && typeof u === 'object')
    .filter((u) => u.final === true)
    .filter((u) => isTranscriptSpeaker(u.speaker))
    .filter((u) => isValidSeq(u.seq))
    .map((u) => ({ speaker: u.speaker, seq: u.seq, text: typeof u.text === 'string' ? u.text.trim() : '' }))
    .filter((u) => u.text.length > 0)
    .sort((a, b) => a.seq - b.seq)

  return rows.map((u) => `[${SPEAKER_LABELS[u.speaker]}] ${u.text}`).join('\n')
}

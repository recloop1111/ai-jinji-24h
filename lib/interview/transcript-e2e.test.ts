import { describe, it, expect } from 'vitest'
import { saveUtterance, InMemoryTranscriptRepository, type TranscriptWriteInput } from './transcript-write'
import { buildTranscriptReadModel, buildEvaluationInputFromRows } from './transcript-read'
import type { TranscriptSpeaker } from './transcript'

// PR-3C: synthetic transcript の E2E 相当フロー。
//   synthetic events → saveUtterance(3B service) → InMemory repository → read → orderUtterances → serializer(3A)
// 実 OpenAI/Realtime/DB は使わない。source は 'synthetic'（本物の realtime transcript だと装わない）。

const IV = 'iv-e2e'

// 到着順で並べた synthetic イベント（架空・PII なし）。seq は「論理順」、配列順は「到着順」。
// out-of-order / partial / final / duplicate / final→partial / dedup_key null / partial-only を混在させる。
type SyntheticEvent = {
  speaker: TranscriptSpeaker
  text: string
  seq: number
  final: boolean
  dedupKey: string | null
}

const SYNTHETIC_ARRIVAL: SyntheticEvent[] = [
  { speaker: 'interviewer', text: '本日はよろしくお願いします。', seq: 1, final: true, dedupKey: 'iv-t1' },
  { speaker: 'applicant', text: 'よろしく', seq: 2, final: false, dedupKey: 'ap-t2' }, // partial（後で final 昇格）
  { speaker: 'applicant', text: '御社の理念に魅力を感じたためです。', seq: 4, final: true, dedupKey: 'ap-t4' }, // out-of-order（seq4 が seq3 より先着）
  { speaker: 'interviewer', text: '志望動機を教えてください。', seq: 3, final: true, dedupKey: 'iv-t3' },
  { speaker: 'applicant', text: 'よろしくお願いします。', seq: 2, final: true, dedupKey: 'ap-t2' }, // partial → final 昇格
  { speaker: 'interviewer', text: '本日はよろしくお願いします。', seq: 1, final: true, dedupKey: 'iv-t1' }, // duplicate final（増えない）
  { speaker: 'applicant', text: '（言い直し途中）', seq: 4, final: false, dedupKey: 'ap-t4' }, // final → partial（後退＝無視）
  { speaker: 'interviewer', text: 'ありがとうございます。', seq: 5, final: true, dedupKey: null }, // dedup_key null（独立発話）
  { speaker: 'applicant', text: 'えーっと', seq: 6, final: false, dedupKey: 'ap-t6' }, // partial のみ（final に昇格しない）
]

// synthetic イベント → trusted 書込入力（source/speaker/seq は「サーバ確定」属性としてテスト harness が付与）。
function toWriteInput(e: SyntheticEvent): TranscriptWriteInput {
  return {
    interviewId: IV,
    speaker: e.speaker,
    text: e.text,
    seq: e.seq,
    final: e.final,
    source: 'synthetic', // realtime を装わない
    dedupKey: e.dedupKey,
    language: null,
  }
}

async function runArrival(events: SyntheticEvent[]) {
  const repo = new InMemoryTranscriptRepository()
  for (const e of events) {
    await saveUtterance(repo, toWriteInput(e))
  }
  return repo
}

describe('PR-3C synthetic E2E: save → read → serialize', () => {
  it('A/C/F: 二重化しない（duplicate dedup_key / duplicate final を再送しても行が増えない）', async () => {
    const repo = await runArrival(SYNTHETIC_ARRIVAL)
    // 論理発話: seq1..6 の6行（duplicate 再送で増えない）。
    expect(repo.all()).toHaveLength(6)
  })

  it('B: out-of-order arrival でも read model は seq 昇順', async () => {
    const repo = await runArrival(SYNTHETIC_ARRIVAL)
    // repository の保存順（＝到着順）は seq 順ではない
    const storedSeqOrder = repo.all().map((r) => r.seq)
    expect(storedSeqOrder).not.toEqual([1, 2, 3, 4, 5, 6])
    // read model は seq 昇順に整列
    const model = buildTranscriptReadModel(repo.all())
    expect(model.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5, 6])
    expect(model.map((m) => m.speaker)).toEqual(['interviewer', 'applicant', 'interviewer', 'applicant', 'interviewer', 'applicant'])
  })

  it('D: partial → final 昇格（同 dedup_key が final の本文へ更新される）', async () => {
    const repo = await runArrival(SYNTHETIC_ARRIVAL)
    const model = buildTranscriptReadModel(repo.all())
    const t2 = model.find((m) => m.seq === 2)
    expect(t2).toMatchObject({ final: true, text: 'よろしくお願いします。' })
  })

  it('E: final → partial 後退しない（seq4 は final のまま・言い直し途中で上書きされない）', async () => {
    const repo = await runArrival(SYNTHETIC_ARRIVAL)
    const t4 = buildTranscriptReadModel(repo.all()).find((m) => m.seq === 4)
    expect(t4).toMatchObject({ final: true, text: '御社の理念に魅力を感じたためです。' })
  })

  it('G: dedup_key null は独立発話として保持（seq5 が存在）', async () => {
    const repo = await runArrival(SYNTHETIC_ARRIVAL)
    const t5 = buildTranscriptReadModel(repo.all()).find((m) => m.seq === 5)
    expect(t5).toMatchObject({ final: true, speaker: 'interviewer', text: 'ありがとうございます。' })
  })

  it('H/I: evaluator serializer は final のみ・seq 昇順・話者ラベル固定（partial seq6 を除外）', async () => {
    const repo = await runArrival(SYNTHETIC_ARRIVAL)
    const evalInput = buildEvaluationInputFromRows(repo.all())
    expect(evalInput).toBe(
      [
        '[面接官] 本日はよろしくお願いします。',
        '[応募者] よろしくお願いします。',
        '[面接官] 志望動機を教えてください。',
        '[応募者] 御社の理念に魅力を感じたためです。',
        '[面接官] ありがとうございます。',
      ].join('\n'),
    )
    // read model は partial(seq6) を含むが、評価入力（final のみ）には含めない
    expect(buildTranscriptReadModel(repo.all()).some((m) => m.seq === 6 && m.final === false)).toBe(true)
    expect(evalInput).not.toContain('えーっと')
  })

  it('冪等性: dedup_key 付きイベントは2回流しても増えず、最終状態が一致する', async () => {
    // dedup_key 付きのみ（冪等対象）。null は仕様上「独立発話」なので冪等対象外（下の別テストで検証）。
    const keyed = SYNTHETIC_ARRIVAL.filter((e) => e.dedupKey !== null)
    const once = await runArrival(keyed)
    const twice = await runArrival([...keyed, ...keyed])
    expect(twice.all()).toHaveLength(once.all().length) // 二重流入でも増えない
    expect(buildEvaluationInputFromRows(twice.all())).toBe(buildEvaluationInputFromRows(once.all()))
  })

  it('G(補足): dedup_key null は冪等対象外＝再送で独立行が増える（仕様どおり）', async () => {
    const repo = new InMemoryTranscriptRepository()
    const nullEvent = SYNTHETIC_ARRIVAL.find((e) => e.dedupKey === null)!
    await saveUtterance(repo, toWriteInput(nullEvent))
    await saveUtterance(repo, toWriteInput(nullEvent))
    expect(repo.all()).toHaveLength(2) // null は毎回新規（別発話）
  })

  it('J: 空/未保存の interview → read model 空・serialize 空文字（crash しない）', async () => {
    const repo = new InMemoryTranscriptRepository()
    expect(buildTranscriptReadModel(repo.all())).toEqual([])
    expect(buildEvaluationInputFromRows(repo.all())).toBe('')
  })

  it('cross-interview: 別 interview の同 dedup_key は衝突しない（別々に整列/serialize）', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, { ...toWriteInput(SYNTHETIC_ARRIVAL[0]), interviewId: 'iv-A', dedupKey: 'shared' })
    await saveUtterance(repo, { ...toWriteInput(SYNTHETIC_ARRIVAL[3]), interviewId: 'iv-B', dedupKey: 'shared' })
    expect(repo.all()).toHaveLength(2)
    const a = repo.all().filter((r) => r.interviewId === 'iv-A')
    const b = repo.all().filter((r) => r.interviewId === 'iv-B')
    expect(buildTranscriptReadModel(a)).toHaveLength(1)
    expect(buildTranscriptReadModel(b)).toHaveLength(1)
  })
})

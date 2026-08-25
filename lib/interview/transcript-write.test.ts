import { describe, it, expect } from 'vitest'
import {
  parseBrowserTranscriptBody,
  validateTranscriptWriteInput,
  decideSaveAction,
  saveUtterance,
  InMemoryTranscriptRepository,
  InMemorySeqAllocator,
  TranscriptWriteError,
  TRANSCRIPT_TEXT_MAX,
  TRANSCRIPT_DEDUP_KEY_MAX,
  type TranscriptWriteInput,
  type TranscriptRepository,
  type StoredUtterance,
} from './transcript-write'

const IV = 'iv-1'

// trusted サービス入力を組み立てる helper（source/speaker/seq/interviewId は「サーバ確定」属性）。
function input(over: Partial<TranscriptWriteInput> = {}): TranscriptWriteInput {
  return {
    interviewId: IV,
    speaker: 'applicant',
    text: 'こんにちは',
    seq: 1,
    final: true,
    source: 'realtime',
    dedupKey: null,
    language: null,
    ...over,
  }
}

describe('parseBrowserTranscriptBody (ブラウザ入力＝text/dedupKey/final/language のみ)', () => {
  it('正常', () => {
    expect(parseBrowserTranscriptBody({ text: ' はい ', dedup_key: 'k1', final: false, language: 'ja' })).toEqual({
      ok: true,
      value: { text: 'はい', dedupKey: 'k1', final: false, language: 'ja' },
    })
  })
  it('final 省略 → true / dedup_key・language 省略 → null', () => {
    const r = parseBrowserTranscriptBody({ text: 'x' })
    expect(r).toEqual({ ok: true, value: { text: 'x', dedupKey: null, final: true, language: null } })
  })
  it('信頼属性（speaker/source/seq/interview_id）は読まない＝無視される', () => {
    const r = parseBrowserTranscriptBody({ text: 'x', speaker: 'interviewer', source: 'realtime', seq: 99, interview_id: 'spoof' })
    expect(r.ok).toBe(true)
    expect(Object.keys(r.ok ? r.value : {})).toEqual(['text', 'dedupKey', 'final', 'language'])
  })
  it('text 非string/空/空白 → 拒否', () => {
    expect(parseBrowserTranscriptBody({}).ok).toBe(false)
    expect(parseBrowserTranscriptBody({ text: 5 })).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(parseBrowserTranscriptBody({ text: '   ' })).toMatchObject({ code: 'TEXT_EMPTY' })
  })
  it('oversized text → TEXT_TOO_LONG', () => {
    expect(parseBrowserTranscriptBody({ text: 'a'.repeat(TRANSCRIPT_TEXT_MAX + 1) })).toMatchObject({ code: 'TEXT_TOO_LONG' })
  })
  it('final 非boolean → INVALID_FINAL', () => {
    expect(parseBrowserTranscriptBody({ text: 'x', final: 'yes' })).toMatchObject({ code: 'INVALID_FINAL' })
  })
  it('dedup_key 非string/空/oversized → INVALID_DEDUP_KEY', () => {
    expect(parseBrowserTranscriptBody({ text: 'x', dedup_key: 5 })).toMatchObject({ code: 'INVALID_DEDUP_KEY' })
    expect(parseBrowserTranscriptBody({ text: 'x', dedup_key: '' })).toMatchObject({ code: 'INVALID_DEDUP_KEY' })
    expect(parseBrowserTranscriptBody({ text: 'x', dedup_key: 'a'.repeat(TRANSCRIPT_DEDUP_KEY_MAX + 1) })).toMatchObject({ code: 'INVALID_DEDUP_KEY' })
  })
})

describe('validateTranscriptWriteInput (trusted 入力の最終防御)', () => {
  it('正常', () => {
    expect(validateTranscriptWriteInput(input()).ok).toBe(true)
  })
  it('invalid speaker / source / seq を拒否', () => {
    // @ts-expect-error 故意の不正
    expect(validateTranscriptWriteInput(input({ speaker: 'ai' }))).toMatchObject({ code: 'INVALID_SPEAKER' })
    // @ts-expect-error 故意の不正
    expect(validateTranscriptWriteInput(input({ source: 'openai' }))).toMatchObject({ code: 'INVALID_SOURCE' })
    expect(validateTranscriptWriteInput(input({ seq: 0 }))).toMatchObject({ code: 'INVALID_SEQ' })
    expect(validateTranscriptWriteInput(input({ seq: 1.5 }))).toMatchObject({ code: 'INVALID_SEQ' })
  })
  it('empty / oversized text を拒否', () => {
    expect(validateTranscriptWriteInput(input({ text: '   ' }))).toMatchObject({ code: 'TEXT_EMPTY' })
    expect(validateTranscriptWriteInput(input({ text: 'a'.repeat(TRANSCRIPT_TEXT_MAX + 1) }))).toMatchObject({ code: 'TEXT_TOO_LONG' })
  })
})

describe('decideSaveAction (final-wins を明示)', () => {
  it('既存なし → inserted', () => {
    expect(decideSaveAction(null, true)).toBe('inserted')
  })
  it('既存 final & 新規 partial → skipped（final→partial を許さない）', () => {
    expect(decideSaveAction({ final: true }, false)).toBe('skipped')
  })
  it('partial→final / partial→partial / final→final → updated', () => {
    expect(decideSaveAction({ final: false }, true)).toBe('updated')
    expect(decideSaveAction({ final: false }, false)).toBe('updated')
    expect(decideSaveAction({ final: true }, true)).toBe('updated')
  })
})

describe('saveUtterance (idempotency・fake repository・実DBへ書かない)', () => {
  it('valid write → inserted 1行', async () => {
    const repo = new InMemoryTranscriptRepository()
    const r = await saveUtterance(repo, input({ dedupKey: 'k1' }))
    expect(r.status).toBe('inserted')
    expect(repo.all()).toHaveLength(1)
  })

  it('同 dedup_key を2回 → 増殖しない（updated）', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, input({ dedupKey: 'k1', text: '1回目' }))
    const r2 = await saveUtterance(repo, input({ dedupKey: 'k1', text: '2回目' }))
    expect(r2.status).toBe('updated')
    expect(repo.all()).toHaveLength(1)
    expect(repo.all()[0].text).toBe('2回目')
  })

  it('retry（同一 final を再送）→ 1行のまま', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, input({ dedupKey: 'k1' }))
    await saveUtterance(repo, input({ dedupKey: 'k1' }))
    expect(repo.all()).toHaveLength(1)
  })

  it('partial → final（同 dedup_key）→ 1行が final に更新', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, input({ dedupKey: 'k1', final: false, text: '途中' }))
    const r = await saveUtterance(repo, input({ dedupKey: 'k1', final: true, text: '完成' }))
    expect(r.status).toBe('updated')
    expect(repo.all()).toHaveLength(1)
    expect(repo.all()[0]).toMatchObject({ final: true, text: '完成' })
  })

  it('final → partial（後から来た partial）→ skipped（final を保持・後退しない）', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, input({ dedupKey: 'k1', final: true, text: 'final' }))
    const r = await saveUtterance(repo, input({ dedupKey: 'k1', final: false, text: 'late partial' }))
    expect(r.status).toBe('skipped')
    expect(repo.all()).toHaveLength(1)
    expect(repo.all()[0]).toMatchObject({ final: true, text: 'final' })
  })

  it('duplicate final → 1行のまま（最新内容へ更新）', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, input({ dedupKey: 'k1', final: true, text: 'A' }))
    await saveUtterance(repo, input({ dedupKey: 'k1', final: true, text: 'B' }))
    expect(repo.all()).toHaveLength(1)
    expect(repo.all()[0].text).toBe('B')
  })

  it('dedup_key null → 冪等対象外（別発話として増える）', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, input({ dedupKey: null, text: 'a', seq: 1 }))
    await saveUtterance(repo, input({ dedupKey: null, text: 'b', seq: 2 }))
    expect(repo.all()).toHaveLength(2)
  })

  it('異なる interview で同じ dedup_key → 別行（cross-interview は衝突しない）', async () => {
    const repo = new InMemoryTranscriptRepository()
    await saveUtterance(repo, input({ interviewId: 'iv-1', dedupKey: 'shared' }))
    await saveUtterance(repo, input({ interviewId: 'iv-2', dedupKey: 'shared' }))
    expect(repo.all()).toHaveLength(2)
  })

  it('concurrency: insert が DEDUP_CONFLICT → re-find で相手を見つけ update に収束（1行）', async () => {
    // 並行 double-submit を模す: 両者 findByDedupKey で不在→両者 insert→片方が DB unique に負ける。
    // 負けた側は catch→re-find で相手行を見つけ、final-wins で解決する。
    const winner: StoredUtterance = {
      ...input({ dedupKey: 'race', final: false, text: '相手partial' }),
      id: 'w1',
      createdAt: new Date(0).toISOString(),
    }
    let findCalls = 0
    const repo: TranscriptRepository = {
      async findByDedupKey() {
        findCalls++
        return findCalls === 1 ? null : winner // 1回目は不在（race）、conflict 後の再取得で相手を発見
      },
      async insert() {
        throw new TranscriptWriteError('DEDUP_CONFLICT') // insert 競合
      },
      async replaceById(id, inp) {
        return { ...winner, ...inp, id }
      },
    }
    const r = await saveUtterance(repo, input({ dedupKey: 'race', final: true, text: '自分final' }))
    expect(r.status).toBe('updated')
    expect(r.utterance).toMatchObject({ final: true, text: '自分final' })
  })

  it('insert 競合後も re-find で見つからなければ rethrow（無限ループしない）', async () => {
    const repo: TranscriptRepository = {
      async findByDedupKey() {
        return null
      },
      async insert() {
        throw new TranscriptWriteError('DEDUP_CONFLICT')
      },
      async replaceById() {
        throw new Error('should not be called')
      },
    }
    await expect(saveUtterance(repo, input({ dedupKey: 'x' }))).rejects.toMatchObject({ code: 'DEDUP_CONFLICT' })
  })

  it('invalid 入力は TranscriptWriteError（本文を message に載せない）', async () => {
    const repo = new InMemoryTranscriptRepository()
    await expect(saveUtterance(repo, input({ text: '   ' }))).rejects.toMatchObject({ code: 'TEXT_EMPTY' })
    // message に本文が含まれない（コードのみ）
    try {
      await saveUtterance(repo, input({ text: 'ひみつの氏名やメール', seq: 0 }))
    } catch (e) {
      expect((e as TranscriptWriteError).message).toBe('INVALID_SEQ')
      expect((e as Error).message).not.toContain('ひみつ')
    }
  })
})

describe('InMemorySeqAllocator (面接内で単調増加・本番採番は #19)', () => {
  it('interview ごとに 1,2,3...', async () => {
    const alloc = new InMemorySeqAllocator()
    expect(await alloc.next('iv-1')).toBe(1)
    expect(await alloc.next('iv-1')).toBe(2)
    expect(await alloc.next('iv-2')).toBe(1) // 別 interview は独立
    expect(await alloc.next('iv-1')).toBe(3)
  })
})

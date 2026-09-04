import { describe, it, expect, vi, beforeEach } from 'vitest'

// /api/client/applicants/[id]/status の挙動テスト（E-5-2B-1）。
// getClientUser と supabase server factory を mock し、result+memo の単一UPDATE・actor条件・no-op・history・RBAC を検証。
const mockGetClientUser = vi.fn()
vi.mock('@/lib/api/auth', () => ({ getClientUser: () => mockGetClientUser() }))

let capturedPayload: Record<string, unknown> | null = null
let historyInserted = false
let currentRow: { result: string | null; selection_memo: string | null }

function applicantsBuilder() {
  let mode: 'select' | 'update' = 'select'
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.update = (payload: Record<string, unknown>) => { mode = 'update'; capturedPayload = payload; return b }
  b.eq = () => b
  b.maybeSingle = async () =>
    mode === 'update'
      ? { data: { id: 'a1', result: (capturedPayload?.result ?? currentRow.result) ?? null, selection_memo: (capturedPayload?.selection_memo ?? currentRow.selection_memo) ?? null, selection_memo_updated_at: capturedPayload?.selection_memo_updated_at ?? null }, error: null }
      : { data: { id: 'a1', result: currentRow.result, selection_memo: currentRow.selection_memo }, error: null }
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClientServerClient: async () => ({ from: () => applicantsBuilder() }),
  createServiceRoleClient: () => ({
    from: () => ({ insert: async () => { historyInserted = true; return { error: null } } }),
  }),
}))

import { PATCH } from '@/app/api/client/applicants/[id]/status/route'

const VALID_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'

function req(body: unknown) {
  return new Request('http://x/api', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never
}
const params = Promise.resolve({ id: VALID_ID })

function asUser(companyRole: string) {
  mockGetClientUser.mockResolvedValue({ data: { userId: USER_ID, companyId: 'c1', companyRole }, error: null })
}

beforeEach(() => {
  mockGetClientUser.mockReset()
  capturedPayload = null
  historyInserted = false
  currentRow = { result: '検討中', selection_memo: '' }
})

async function call(body: unknown) {
  const res = await PATCH(req(body), { params })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

describe('status route: result + memo 単一UPDATE / actor / no-op / history', () => {
  it('result+memo 変更 → 1回のUPDATEで両方＋actor/time、result はhistory記録', async () => {
    asUser('owner')
    currentRow = { result: '検討中', selection_memo: '' }
    const { status, json } = await call({ result: '不採用', selection_memo: 'メモ本文' })
    expect(status).toBe(200)
    expect(json.updated).toBe(true)
    expect(capturedPayload).toMatchObject({ result: '不採用', selection_memo: 'メモ本文', selection_memo_updated_by: USER_ID })
    expect(capturedPayload).toHaveProperty('selection_memo_updated_at')
    expect(capturedPayload).toHaveProperty('updated_at')
    expect(historyInserted).toBe(true)
  })

  it('result のみ変更 → memo/actor は更新せず、history 記録', async () => {
    asUser('owner')
    currentRow = { result: '検討中', selection_memo: '既存メモ' }
    await call({ result: '不採用' })
    expect(capturedPayload).toHaveProperty('result', '不採用')
    expect(capturedPayload).not.toHaveProperty('selection_memo')
    expect(capturedPayload).not.toHaveProperty('selection_memo_updated_by')
    expect(capturedPayload).not.toHaveProperty('selection_memo_updated_at')
    expect(historyInserted).toBe(true)
  })

  it('memo のみ変更 → actor/time 更新、history は記録しない', async () => {
    asUser('owner')
    currentRow = { result: '不採用', selection_memo: '古いメモ' }
    await call({ selection_memo: '新しいメモ' })
    expect(capturedPayload).toMatchObject({ selection_memo: '新しいメモ', selection_memo_updated_by: USER_ID })
    expect(capturedPayload).toHaveProperty('selection_memo_updated_at')
    expect(capturedPayload).not.toHaveProperty('result')
    expect(historyInserted).toBe(false)
  })

  it('memo 同値 → actor/time を上書きしない（no-op updated:false）', async () => {
    asUser('owner')
    currentRow = { result: '不採用', selection_memo: '同じメモ' }
    const { json } = await call({ selection_memo: '同じメモ' })
    expect(json.updated).toBe(false)
    expect(capturedPayload).toBeNull() // UPDATE 自体を発行しない
  })

  it('result 同値のみ → no-op updated:false', async () => {
    asUser('owner')
    currentRow = { result: '検討中', selection_memo: 'x' }
    const { json } = await call({ result: '検討中' })
    expect(json.updated).toBe(false)
    expect(capturedPayload).toBeNull()
  })

  it('memo 空文字 → クリアとして保存（actor 更新）', async () => {
    asUser('owner')
    currentRow = { result: '不採用', selection_memo: '消す前' }
    await call({ selection_memo: '' })
    expect(capturedPayload).toMatchObject({ selection_memo: '', selection_memo_updated_by: USER_ID })
  })

  it('2000文字は許可 / 2001文字は VALIDATION_ERROR', async () => {
    asUser('owner')
    currentRow = { result: '不採用', selection_memo: '' }
    const r2000 = await call({ selection_memo: 'あ'.repeat(2000) })
    expect(r2000.status).toBe(200)
    const r2001 = await call({ selection_memo: 'あ'.repeat(2001) })
    expect(r2001.status).toBe(400)
  })

  it('result も memo も無い body → VALIDATION_ERROR', async () => {
    asUser('owner')
    const { status } = await call({})
    expect(status).toBe(400)
  })

  it('不正 result → VALIDATION_ERROR（selection_status には書かない）', async () => {
    asUser('owner')
    const { status } = await call({ result: 'pending' })
    expect(status).toBe(400)
  })

  it('OWNER/ADMIN/RECRUITER は許可', async () => {
    for (const role of ['owner', 'admin', 'recruiter']) {
      asUser(role)
      currentRow = { result: '検討中', selection_memo: '' }
      const { status } = await call({ result: '不採用' })
      expect(status).toBe(200)
    }
  })

  it('VIEWER は 403', async () => {
    asUser('viewer')
    const { status } = await call({ result: '不採用', selection_memo: 'x' })
    expect(status).toBe(403)
    expect(capturedPayload).toBeNull()
  })
})

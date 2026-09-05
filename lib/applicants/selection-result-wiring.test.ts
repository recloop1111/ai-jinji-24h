import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 選考結果保存（E-5-2A）の配線を source-level で守る。SoT=applicants.result。
//   fake success / browser-direct false-success の再発を防ぎ、server route を正にする。
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = read('app/api/client/applicants/[id]/status/route.ts')
const DETAIL = read('app/client/(dashboard)/applicants/[id]/page.tsx')
const LIST = read('app/client/(dashboard)/applicants/page.tsx')
const DASH = read('app/client/(dashboard)/dashboard/page.tsx')

describe('status route: applicants.result + selection_memo を単一UPDATE（RBAC/tenant/validation/history/honest）', () => {
  it('client SoT = applicants.result / selection_memo を1回のUPDATEで更新', () => {
    expect(ROUTE).toContain('.update(payload)')
    expect(ROUTE).toContain('payload.result = newResult')
    expect(ROUTE).toContain('payload.selection_memo = newMemo')
  })
  it('メモ本文が実変更された時のみ actor/time を stamp', () => {
    expect(ROUTE).toContain('payload.selection_memo_updated_by = user.userId')
    expect(ROUTE).toContain('payload.selection_memo_updated_at = nowIso')
    expect(ROUTE).toContain('if (memoChanged)')
  })
  it('運営用 selection_status カラムは更新しない（ドリフト是正）', () => {
    expect(ROUTE).not.toContain('.update({ selection_status')
    expect(ROUTE).not.toContain('second_interview')
  })
  it('result / memo の validation（不正値は VALIDATION_ERROR）', () => {
    expect(ROUTE).toContain('isSelectionResultValue')
    expect(ROUTE).toContain('validateSelectionMemo')
    expect(ROUTE).toContain("apiError('VALIDATION_ERROR'")
  })
  it('no-op 判定は result 差分 OR memo 差分', () => {
    expect(ROUTE).toContain('resultChanged')
    expect(ROUTE).toContain('memoChanged')
    expect(ROUTE).toContain('if (!resultChanged && !memoChanged)')
  })
  it('RBAC selection.manage（VIEWER 403）＋ tenant ownership', () => {
    expect(ROUTE).toContain("can(user.companyRole, 'selection.manage')")
    expect(ROUTE).toContain("apiError('FORBIDDEN')")
    expect(ROUTE).toContain("user.companyId")
  })
  it('history は result が実変更された時のみ（memo 本文は history へ入れない）', () => {
    expect(ROUTE).toContain("from('selection_status_histories')")
    expect(ROUTE).toContain('if (resultChanged) {')
    // 履歴 insert 列は old_status/new_status/changed_by のみ（memo 本文列を渡さない）
    expect(ROUTE).toContain('old_status: oldResult')
    expect(ROUTE).toContain('new_status: newResult')
  })
  it('honest: 更新 0 行/エラーは失敗として返す（fake success を作らない）', () => {
    expect(ROUTE).toContain('if (updateError || !updated)')
  })
})

describe('詳細画面: fake 保存を撤去し実 API 呼び出し', () => {
  it('選考結果保存の TODO fake stub が無い', () => {
    expect(DETAIL).not.toContain('TODO: Phase 4 Supabase API 実装時に差替え')
  })
  it('保存は /status route を PATCH で呼ぶ', () => {
    expect(DETAIL).toContain('/status`')
    expect(DETAIL).toContain("method: 'PATCH'")
    expect(DETAIL).toContain('saveSelectionResult')
  })
  it('API 成功時のみ成功トースト（res.ok を確認）＋二重クリック防止', () => {
    expect(DETAIL).toContain('if (!res.ok')
    expect(DETAIL).toContain('savingStatus')
  })
})

describe('詳細画面: 選考メモ永続化（E-5-2B-1）', () => {
  it('保存で result と selection_memo を同時送信', () => {
    expect(DETAIL).toContain('selection_memo: selectionMemo')
    expect(DETAIL).toContain('result: resultKeyToValue')
  })
  it('fetch 成功時に selection_memo を state へロード（未保存注記を撤去）', () => {
    expect(DETAIL).toContain('.selection_memo ?? ')
    expect(DETAIL).not.toContain('選考メモは現在保存されません')
  })
  it('2000文字カウンター＋上限で保存不可', () => {
    expect(DETAIL).toContain('MAX_SELECTION_MEMO_LENGTH')
    expect(DETAIL).toContain('selectionMemo.length > MAX_SELECTION_MEMO_LENGTH')
  })
  it('VIEWER は read-only 表示（改行保持・空状態）', () => {
    expect(DETAIL).toContain("!can('selection.manage')")
    expect(DETAIL).toContain('whitespace-pre-wrap')
    expect(DETAIL).toContain('メモはありません')
  })
  it('最終更新は日時のみ表示（actor UUID を露出しない）', () => {
    expect(DETAIL).toContain('formatMemoUpdatedAt')
    expect(DETAIL).not.toContain('selection_memo_updated_by')
  })
  it('internal_memos を使用しない', () => {
    expect(DETAIL).not.toContain('internal_memos')
    expect(DETAIL).not.toContain('/memos')
  })
})

describe('一覧/ダッシュボード: browser-direct false success を撤去', () => {
  for (const [name, src] of [['list', LIST], ['dashboard', DASH]] as const) {
    it(`${name}: applicants を browser-direct update しない`, () => {
      expect(src).not.toContain('.update({ result: dbResult')
    })
    it(`${name}: /status route を呼び、成功時のみ state 更新（失敗は error トースト）`, () => {
      expect(src).toContain('/status`')
      expect(src).toContain("method: 'PATCH'")
      expect(src).toContain('if (!res.ok')
      expect(src).toContain('statusErrorToast')
    })
  }
})

describe('SoT 一貫性: 一覧/詳細とも applicants.result を読む', () => {
  it('一覧は a.result を参照', () => {
    expect(LIST).toContain('a.result')
  })
  it('詳細は applicantData.result を参照', () => {
    expect(DETAIL).toContain('applicantData.result')
  })
})

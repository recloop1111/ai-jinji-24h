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

describe('status route: applicants.result を正として更新（RBAC/tenant/validation/history/honest）', () => {
  it('client SoT = applicants.result を UPDATE する', () => {
    expect(ROUTE).toContain('.update({ result: newResult')
  })
  it('運営用 selection_status カラムは更新しない（ドリフト是正）', () => {
    expect(ROUTE).not.toContain('.update({ selection_status')
    expect(ROUTE).not.toContain('second_interview')
  })
  it('値 validation（不正値は VALIDATION_ERROR）', () => {
    expect(ROUTE).toContain('isSelectionResultValue')
    expect(ROUTE).toContain("apiError('VALIDATION_ERROR'")
  })
  it('RBAC selection.manage（VIEWER 403）＋ tenant ownership', () => {
    expect(ROUTE).toContain("can(user.companyRole, 'selection.manage')")
    expect(ROUTE).toContain("apiError('FORBIDDEN')")
    expect(ROUTE).toContain("user.companyId")
  })
  it('history を記録（selection_status_histories）', () => {
    expect(ROUTE).toContain("from('selection_status_histories')")
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

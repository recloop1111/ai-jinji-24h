import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// VIEWER Read-Only UI Enforcement: /client の write UI が permission SoT（can()）でゲートされ、
// VIEWER に mutation 導線を出さないことを source assertion で固定する（RTL 未導入のため wiring 方式）。
// server-side 403 は settings-write-rbac.test.ts / csv-export-rbac.test.ts / member/jobs/questions API tests で担保。
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('settings: 企業設定 write は company_settings.manage でゲート', () => {
  const src = read('app/client/(dashboard)/settings/page.tsx')
  it('canManageSettings を permission SoT から算出', () => {
    expect(src).toContain("canPermission('company_settings.manage')")
    expect(src).toContain('const canManageSettings')
  })
  it('一般/請求先 input は disabled={!canManageSettings}', () => {
    expect(src).toContain('disabled={!canManageSettings}')
  })
  it('一般/請求先/設定PW の保存 UI は canManageSettings で条件表示', () => {
    // 保存ボタンや設定PWフォームが canManageSettings ゲート配下（三項/条件レンダー）にある。
    expect(src).toContain('{canManageSettings ? (')
  })
})

describe('templates: 作成/編集/削除 UI は company_settings.manage でゲート', () => {
  const src = read('app/client/(dashboard)/templates/page.tsx')
  it('canManage を permission SoT から算出', () => {
    expect(src).toContain("can('company_settings.manage')")
    expect(src).toContain('const canManage')
  })
  it('新規作成/編集/削除ボタンは canManage 配下', () => {
    expect(src).toContain('{canManage && (')
  })
})

describe('applicants 一覧: CSV export は applicant.csv_export でゲート', () => {
  const src = read('app/client/(dashboard)/applicants/page.tsx')
  it('canExportCsv を permission SoT から算出し CSV ボタンを条件表示', () => {
    expect(src).toContain("canPermission('applicant.csv_export')")
    expect(src).toContain('{canExportCsv && (')
  })
})

describe('plan: 翌月上限変更フォームは company_settings.manage でゲート', () => {
  const src = read('app/client/(dashboard)/plan/page.tsx')
  it('canManagePlan を算出し変更フォームを条件表示', () => {
    expect(src).toContain("canPermission('company_settings.manage')")
    expect(src).toContain('{!canManagePlan ? (')
  })
})

describe('suspension: 停止申請 UI は company_settings.manage でゲート', () => {
  const src = read('app/client/(dashboard)/suspension/page.tsx')
  it('canManageSuspension を算出し申請/取消ボタンを条件表示', () => {
    expect(src).toContain("canPermission('company_settings.manage')")
    expect(src).toContain('canManageSuspension')
    expect(src).toContain('{canManageSuspension ? (')
  })
})

describe('applicant 詳細: 選考結果/メモ write は selection.manage でゲート（既存）', () => {
  const src = read('app/client/(dashboard)/applicants/[id]/page.tsx')
  it('選考結果/メモ編集は can(selection.manage) 配下・VIEWER は read-only 表示', () => {
    expect(src).toContain("can('selection.manage')")
    expect(src).toContain("!can('selection.manage')")
  })
})

describe('jobs/questions: canWrite（job.manage/question.manage）で write UI ゲート（既存）', () => {
  it('jobs/questions ページが can() を canWrite に渡す', () => {
    expect(read('app/client/(dashboard)/jobs/page.tsx')).toContain("can('job.manage')")
    expect(read('app/client/(dashboard)/questions/page.tsx')).toContain("can('question.manage')")
  })
})

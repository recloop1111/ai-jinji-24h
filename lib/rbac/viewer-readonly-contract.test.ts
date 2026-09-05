import { describe, it, expect } from 'vitest'
import { can } from './permissions'

// VIEWER Read-Only の「実 permission 値」による behavior 契約テスト（source-assertion ではなく can() の実結果）。
// UI ゲートは各ページで下記 permission を useCompanyPermissions().can() で評価する。
// /api/client/me → getClientUser → company_members.company_role が role の唯一のソース（owner fallback 無し）。
// よって「VIEWER なのに編集できる」= role が 'viewer' でない（別アカウント/古いdeploy）ことを意味する（下記が false のため）。

// 各 UI ゲートが参照する permission（page → permission）。
const UI_GATES = {
  'settings 一般/請求先/設定PW (save/inputs)': 'company_settings.manage',
  'templates 作成/編集/削除': 'company_settings.manage',
  'plan 翌月上限変更': 'company_settings.manage',
  'suspension 申請/取消/緊急': 'company_settings.manage',
  'applicants CSV export': 'applicant.csv_export',
  'applicant 詳細 選考結果/メモ': 'selection.manage',
  'jobs 作成/編集/削除/公開': 'job.manage',
  'questions 保存/編集': 'question.manage',
} as const

describe('VIEWER は全 mutation UI ゲートが false（read-only）', () => {
  for (const [label, perm] of Object.entries(UI_GATES)) {
    it(`viewer: ${label} → can(${perm})=false`, () => {
      expect(can('viewer', perm)).toBe(false)
    })
  }
  it('viewer は閲覧系 applicant.read のみ true', () => {
    expect(can('viewer', 'applicant.read')).toBe(true)
  })
})

describe('RECRUITER は SoT どおり（recruiting write は可・company 設定は不可）', () => {
  it('recruiter: jobs/questions/selection/CSV export は可', () => {
    for (const p of ['job.manage', 'question.manage', 'selection.manage', 'applicant.csv_export'] as const) {
      expect(can('recruiter', p)).toBe(true)
    }
  })
  it('recruiter: company_settings.manage / member.manage / billing.read は不可', () => {
    for (const p of ['company_settings.manage', 'member.manage', 'billing.read'] as const) {
      expect(can('recruiter', p)).toBe(false)
    }
  })
})

describe('OWNER/ADMIN は企業設定 write 可（既存 write 維持）', () => {
  for (const role of ['owner', 'admin'] as const) {
    it(`${role}: company_settings.manage / applicant.csv_export / selection.manage = true`, () => {
      expect(can(role, 'company_settings.manage')).toBe(true)
      expect(can(role, 'applicant.csv_export')).toBe(true)
      expect(can(role, 'selection.manage')).toBe(true)
    })
  }
})

describe('role 解決不能（loading/null/未知）は default deny（fail-closed）', () => {
  it('null / unknown role は全 permission false', () => {
    expect(can(null, 'company_settings.manage')).toBe(false)
    expect(can('staff', 'applicant.read' as never)).toBe(false)
    expect(can(undefined, 'applicant.csv_export')).toBe(false)
  })
})

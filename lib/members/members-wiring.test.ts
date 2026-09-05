import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const COMPANIES = read('app/api/admin/companies/route.ts')
const MEMBERS_API = read('app/api/client/members/route.ts')
const ME_API = read('app/api/client/members/me/route.ts')
const SETTINGS = read('app/client/(dashboard)/settings/page.tsx')
const TAB = read('components/client/MembersTab.tsx')

describe('company 作成: OWNER membership を作成（潜在ロックアウト是正）', () => {
  it('company_members に owner/active を insert する', () => {
    expect(COMPANIES).toContain("from('company_members')")
    expect(COMPANIES).toContain("company_role: 'owner'")
    expect(COMPANIES).toContain("status: 'active'")
    expect(COMPANIES).toContain('joined_at:')
  })
  it('full_name は会社名(name)を入れない（担当者 contact_person のみ・曖昧は NULL）', () => {
    expect(COMPANIES).toContain('full_name: contact_person?.trim() || null')
  })
  it('membership insert 失敗時は cleanup し成功を返さない（fake success 無し）', () => {
    expect(COMPANIES).toContain('if (memberError)')
    expect(COMPANIES).toContain('auth.admin.deleteUser(authUserId)')
    // 失敗時に 201 の successJson を返さない（memberError 分岐で apiError）
    const idx = COMPANIES.indexOf('if (memberError)')
    expect(COMPANIES.slice(idx, idx + 400)).toContain("apiError('INTERNAL_ERROR'")
  })
  it('profiles.role は company のまま（owner を profiles.role に入れない）', () => {
    expect(COMPANIES).toContain("role: 'company'")
    // company_role: 'owner'（company_members）は OK。profiles.role へ owner を入れていないこと（_ に前置されない role: 'owner' が無い）。
    expect(/[^_a-zA-Z]role: 'owner'/.test(COMPANIES)).toBe(false)
  })
  it('既存企業への backfill 処理を入れていない', () => {
    expect(COMPANIES).not.toContain('backfill')
  })
})

describe('members API: RBAC / tenant / no token', () => {
  it('GET は member.manage を要求・company_id 固定', () => {
    expect(MEMBERS_API).toContain("can(user.companyRole, 'member.manage')")
    expect(MEMBERS_API).toContain("apiError('FORBIDDEN')")
    expect(MEMBERS_API).toContain("eq('company_id', user.companyId)")
  })
  it('token_hash を select/返却しない', () => {
    expect(MEMBERS_API).not.toContain('token_hash')
  })
  it('email は profiles から取得（auth.users 直読みなし）', () => {
    expect(MEMBERS_API).toContain("from('profiles')")
    expect(MEMBERS_API).not.toContain('auth.admin')
    expect(MEMBERS_API).not.toContain("from('auth.users')")
  })
  it('PATCH /me は member.manage・body の company_id/user_id を信用しない', () => {
    expect(ME_API).toContain("can(user.companyRole, 'member.manage')")
    expect(ME_API).toContain("eq('user_id', user.userId)")
    expect(ME_API).toContain("eq('company_id', user.companyId)")
    expect(ME_API).toContain('validateFullName')
    // profiles.display_name を同期しない
    expect(ME_API).not.toContain("from('profiles')")
  })
})

describe('settings UI: メンバー管理タブ RBAC', () => {
  it('member.manage 保有時のみタブを出す', () => {
    expect(SETTINGS).toContain("canPermission('member.manage')")
    expect(SETTINGS).toContain("label: 'メンバー管理'")
    expect(SETTINGS).toContain('<MembersTab />')
  })
})

describe('MembersTab UI: honest', () => {
  // role 変更 / suspend / reactivate / remove は E-5-3-3 で実装済（member-actions-wiring.test.ts で検証）。
  it('OWNER badge / role・status ラベルを使う', () => {
    expect(TAB).toContain('オーナー')
    expect(TAB).toContain('companyRoleLabel')
    expect(TAB).toContain('memberStatusLabel')
  })
  it('full_name 未設定は「未設定」・last_login/参加日 NULL は —（fake にしない）', () => {
    expect(TAB).toContain('未設定')
    expect(TAB).toContain("'—'")
  })
  it('本人の表示名編集のみ（API 成功時のみ success）', () => {
    expect(TAB).toContain('/api/client/members/me')
    expect(TAB).toContain('if (!res.ok')
    expect(TAB).toContain('表示名を編集')
  })
})

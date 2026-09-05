import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = read('app/api/client/members/[id]/route.ts')
const TAB = read('components/client/MembersTab.tsx')

describe('member action route: guard / fail-closed / conditional', () => {
  it('member.manage・id UUID・action based', () => {
    expect(ROUTE).toContain("can(user.companyRole, 'member.manage')")
    expect(ROUTE).toContain('isValidUUID(id)')
    expect(ROUTE).toContain('isMemberAction(body?.action)')
    expect(ROUTE).toContain('planMemberAction(')
  })
  it('target lookup fail-closed（company_id 固定・error 500・0行 404）', () => {
    expect(ROUTE).toContain("eq('company_id', user.companyId)")
    expect(ROUTE).toContain("apiError('INTERNAL_ERROR'")
    expect(ROUTE).toContain("apiError('NOT_FOUND'")
  })
  it('conditional update（owner 除外・期待 status・0行は成功にしない）', () => {
    expect(ROUTE).toContain(".neq('company_role', 'owner')")
    expect(ROUTE).toContain(".in('status', plan.expectStatusIn)")
    expect(ROUTE).toContain('if (!updated) return')
  })
  it('profiles / auth user を触らない（company_members のみ）', () => {
    expect(ROUTE).not.toContain("from('profiles')")
    expect(ROUTE).not.toContain('auth.admin')
    expect(ROUTE).not.toContain('.delete(')
  })
})

describe('MembersTab: 行アクション UI', () => {
  it('active non-self non-owner: 権限 select / 利用停止 / メンバーから削除', () => {
    expect(TAB).toContain('利用停止')
    expect(TAB).toContain('メンバーから削除')
    expect(TAB).toContain('ASSIGNABLE_ROLES')
  })
  it('suspended: 再有効化 / メンバーから削除', () => {
    expect(TAB).toContain('再有効化')
  })
  it('removed: 復元', () => {
    expect(TAB).toContain('復元')
  })
  it('owner / self には危険 action を出さない', () => {
    expect(TAB).toContain("m.company_role === 'owner' || m.is_self")
    expect(TAB).toContain('オーナー変更は現在できません')
  })
  it('破壊操作/権限変更は確認モーダル・成功時のみ refetch', () => {
    expect(TAB).toContain('confirmState')
    expect(TAB).toContain('/api/client/members/${memberId}')
    expect(TAB).toContain('await reload()')
    expect(TAB).toContain('if (!res.ok || !json?.updated)')
  })
  it('double-click 防止（actingId で disabled）', () => {
    expect(TAB).toContain('actingId')
    expect(TAB).toContain('disabled={actingId === m.id}')
  })
})

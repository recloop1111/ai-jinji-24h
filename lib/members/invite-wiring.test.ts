import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const INVITE = read('app/api/client/members/invite/route.ts')
const REVOKE = read('app/api/client/members/invite/[id]/route.ts')
const ACCEPT = read('app/api/invite/accept/route.ts')
const ACCEPT_PAGE = read('app/invite/accept/page.tsx')
const TAB = read('components/client/MembersTab.tsx')

describe('invite route: RBAC / tenant / honest email / token hash', () => {
  it('member.manage・company_id 固定・owner 招待不可', () => {
    expect(INVITE).toContain("can(user.companyRole, 'member.manage')")
    expect(INVITE).toContain('isInvitableRole')
    expect(INVITE).toContain('user.companyId')
  })
  it('メール未設定は 503（副作用なし）', () => {
    expect(INVITE).toContain('isEmailConfigured()')
    expect(INVITE).toContain('EMAIL_UNAVAILABLE')
  })
  it('token は hash 保存・平文はレスポンスに載せない', () => {
    expect(INVITE).toContain('token_hash: tokenHash')
    expect(INVITE).toContain('generateInviteToken()')
    // 応答オブジェクトに token を含めない（invite の select 列にも token_hash を含めない）
    expect(INVITE).not.toContain('token: token')
  })
  it('送信失敗時は invite を revoke（宛先が得られない pending を残さない）', () => {
    expect(INVITE).toContain("status: 'revoked'")
  })
})

describe('revoke route', () => {
  it('member.manage・company_id 固定・pending のみ', () => {
    expect(REVOKE).toContain("can(user.companyRole, 'member.manage')")
    expect(REVOKE).toContain("eq('company_id', user.companyId)")
    expect(REVOKE).toContain("eq('status', 'pending')")
  })
})

describe('accept route: public・email 固定・cleanup', () => {
  it('token hash 照合・email は invite 由来（本人入力の email を使わない）', () => {
    expect(ACCEPT).toContain('hashInviteToken(token)')
    expect(ACCEPT).toContain('email: invite.email')
    expect(ACCEPT).not.toContain('getClientUser') // public
  })
  it('expired/非pending を honest に弾く', () => {
    expect(ACCEPT).toContain('isInviteExpired')
    expect(ACCEPT).toContain("invite.status !== 'pending'")
  })
  it('profiles.role=company・company_members active・full_name 保存・失敗時 cleanup', () => {
    expect(ACCEPT).toContain("role: 'company'")
    expect(ACCEPT).toContain("status: 'active'")
    expect(ACCEPT).toContain('full_name: nameRes.value')
    expect(ACCEPT).toContain('deleteUser(authUserId)')
  })
})

describe('accept page (public)', () => {
  it('氏名＋パスワードを本人が設定・成功時のみ完了表示', () => {
    expect(ACCEPT_PAGE).toContain('/api/invite/accept')
    expect(ACCEPT_PAGE).toContain('お名前')
    expect(ACCEPT_PAGE).toContain('パスワード')
    expect(ACCEPT_PAGE).toContain('if (!res.ok')
  })
})

describe('MembersTab: 招待 UI ＋ pending 取消', () => {
  it('招待フォーム（email＋role）→ POST invite', () => {
    expect(TAB).toContain('/api/client/members/invite')
    expect(TAB).toContain('INVITABLE_ROLES')
    expect(TAB).toContain('招待する')
  })
  it('pending 招待の取消（DELETE）', () => {
    expect(TAB).toContain('/api/client/members/invite/${id}')
    expect(TAB).toContain("method: 'DELETE'")
    expect(TAB).toContain('取消')
  })
  it('成功時のみ toast（honest）', () => {
    expect(TAB).toContain('if (!res.ok || !json?.invited)')
  })
})

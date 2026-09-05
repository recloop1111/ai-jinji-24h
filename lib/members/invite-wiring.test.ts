import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const INVITE = read('app/api/client/members/invite/route.ts')
const REGEN = read('app/api/client/members/invite/[id]/regenerate/route.ts')
const REVOKE = read('app/api/client/members/invite/[id]/route.ts')
const ACCEPT = read('app/api/invite/accept/route.ts')
const ACCEPT_PAGE = read('app/invite/accept/page.tsx')
const TAB = read('components/client/MembersTab.tsx')

describe('invite route: リンク発行（メール送信なし）', () => {
  it('member.manage・company_id 固定・owner 招待不可', () => {
    expect(INVITE).toContain("can(user.companyRole, 'member.manage')")
    expect(INVITE).toContain('isInvitableRole')
    expect(INVITE).toContain('user.companyId')
  })
  it('メール送信機構を一切使わない', () => {
    for (const s of ['sendEmail', 'isEmailConfigured', 'evaluateSendPolicy', 'RESEND_API_KEY', 'MAIL_FROM', 'MAIL_TEST_RECIPIENT_ALLOWLIST', 'lib/email/']) {
      expect(INVITE).not.toContain(s)
    }
  })
  it('token は hash 保存・inviteUrl は fragment(#token=)・no-store・token_hash 非返却', () => {
    expect(INVITE).toContain('generateInviteToken()')
    expect(INVITE).toContain('token_hash: tokenHash')
    expect(INVITE).toContain('buildInviteUrl(')
    expect(INVITE).toContain("'Cache-Control': 'no-store'")
    expect(INVITE).not.toContain('token: token')
  })
  it('既存 pending は 409（自動再発行しない）', () => {
    expect(INVITE).toContain("eq('status', 'pending')")
    expect(INVITE).toContain("apiError('CONFLICT'")
  })
})

describe('regenerate route', () => {
  it('member.manage・旧 revoke＋新 token・no-store', () => {
    expect(REGEN).toContain("can(user.companyRole, 'member.manage')")
    expect(REGEN).toContain("status: 'revoked'")
    expect(REGEN).toContain('generateInviteToken()')
    expect(REGEN).toContain('buildInviteUrl(')
    expect(REGEN).toContain("'Cache-Control': 'no-store'")
    expect(REGEN).toContain("eq('company_id', user.companyId)")
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
  it('token hash 照合・email は invite 由来・public', () => {
    expect(ACCEPT).toContain('hashInviteToken(token)')
    expect(ACCEPT).toContain('email: invite.email')
    expect(ACCEPT).not.toContain('getClientUser')
  })
  it('expired/非pending honest・profiles role=company・member active・full_name・cleanup', () => {
    expect(ACCEPT).toContain('isInviteExpired')
    expect(ACCEPT).toContain("invite.status !== 'pending'")
    expect(ACCEPT).toContain("role: 'company'")
    expect(ACCEPT).toContain("status: 'active'")
    expect(ACCEPT).toContain('full_name: nameRes.value')
    expect(ACCEPT).toContain('deleteUser(authUserId)')
  })
})

describe('accept page: fragment token・memory only', () => {
  it('token は window.location.hash から取得・POST body で送る', () => {
    expect(ACCEPT_PAGE).toContain('window.location.hash')
    expect(ACCEPT_PAGE).toContain('/api/invite/accept')
    expect(ACCEPT_PAGE).toContain('history.replaceState')
  })
  it('token を localStorage/sessionStorage/cookie に保存しない', () => {
    expect(ACCEPT_PAGE).not.toContain('localStorage')
    expect(ACCEPT_PAGE).not.toContain('sessionStorage')
    expect(ACCEPT_PAGE).not.toContain('document.cookie')
  })
  it('?token= の query 方式を使わない（fragment のみ）', () => {
    expect(ACCEPT_PAGE).not.toContain('useSearchParams')
    expect(ACCEPT_PAGE).not.toContain('searchParams')
  })
})

describe('MembersTab: 招待リンク発行 UI（メール文言なし）', () => {
  it('「招待リンクを発行」＋発行 URL 表示＋コピー', () => {
    expect(TAB).toContain('招待リンクを発行')
    expect(TAB).toContain('/api/client/members/invite')
    expect(TAB).toContain('navigator.clipboard.writeText')
    expect(TAB).toContain('リンクをコピー')
  })
  it('再発行・取消', () => {
    expect(TAB).toContain('/regenerate')
    expect(TAB).toContain('リンクを再発行')
    expect(TAB).toContain('招待を取消')
    expect(TAB).toContain('/api/client/members/invite/${id}')
  })
  it('メール文言/メール送信を含まない', () => {
    for (const s of ['メールを送信', '送信しました', '招待メール', 'メール再送', '送信済み']) {
      expect(TAB).not.toContain(s)
    }
  })
  it('inviteUrl を localStorage 等に保存しない（memory のみ）', () => {
    expect(TAB).not.toContain('localStorage')
    expect(TAB).not.toContain('sessionStorage')
  })
})

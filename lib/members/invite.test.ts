import { describe, it, expect } from 'vitest'
import {
  INVITE_EXPIRY_DAYS, INVITABLE_ROLES, isInvitableRole, normalizeInviteEmail,
  computeInviteExpiresAt, isInviteExpired, buildInviteUrl, INVITE_ROLE_LABEL,
} from './invite'

describe('invite pure helpers', () => {
  it('招待可能 role は admin/recruiter/viewer（owner 不可）', () => {
    expect([...INVITABLE_ROLES]).toEqual(['admin', 'recruiter', 'viewer'])
    expect(isInvitableRole('admin')).toBe(true)
    expect(isInvitableRole('viewer')).toBe(true)
    expect(isInvitableRole('owner')).toBe(false)
    expect(isInvitableRole('staff')).toBe(false)
    expect(isInvitableRole(null)).toBe(false)
  })

  it('normalizeInviteEmail: trim + lowercase・不正は reject', () => {
    const r = normalizeInviteEmail('  Member@Company.COM ')
    expect(r.ok && r.email).toBe('member@company.com')
    expect(normalizeInviteEmail('not-an-email').ok).toBe(false)
    expect(normalizeInviteEmail('a@b.com,c@d.com').ok).toBe(false)
    expect(normalizeInviteEmail(123).ok).toBe(false)
  })

  it('expiry は 7日', () => {
    expect(INVITE_EXPIRY_DAYS).toBe(7)
    const now = new Date('2026-01-01T00:00:00Z')
    const exp = new Date(computeInviteExpiresAt(now))
    expect(exp.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('isInviteExpired', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    expect(isInviteExpired('2026-01-05T00:00:00Z', now)).toBe(true)
    expect(isInviteExpired('2026-01-20T00:00:00Z', now)).toBe(false)
    expect(isInviteExpired(null, now)).toBe(true)
    expect(isInviteExpired('garbage', now)).toBe(true)
  })

  it('buildInviteUrl は fragment(#token=)形式・末尾スラッシュ吸収', () => {
    expect(buildInviteUrl('https://x.app', 'abc')).toBe('https://x.app/invite/accept#token=abc')
    expect(buildInviteUrl('https://x.app/', 'abc')).toBe('https://x.app/invite/accept#token=abc')
    expect(buildInviteUrl('https://x.app', 'abc')).not.toContain('?token=')
  })

  it('role ラベル', () => {
    expect(INVITE_ROLE_LABEL.admin).toBe('管理者')
    expect(INVITE_ROLE_LABEL.owner).toBe('オーナー')
  })
})

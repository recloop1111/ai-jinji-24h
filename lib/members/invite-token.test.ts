import { describe, it, expect } from 'vitest'
import { generateInviteToken, hashInviteToken } from './invite-token'

describe('invite-token', () => {
  it('token と hash を返す・hash は token と異なる', () => {
    const { token, tokenHash } = generateInviteToken()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)
    expect(tokenHash).not.toBe(token)
  })
  it('hashInviteToken は SHA-256 hex（64桁）で決定的', () => {
    const h1 = hashInviteToken('abc')
    const h2 = hashInviteToken('abc')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(hashInviteToken('abd')).not.toBe(h1)
  })
  it('generateInviteToken の tokenHash は hashInviteToken(token) と一致', () => {
    const { token, tokenHash } = generateInviteToken()
    expect(hashInviteToken(token)).toBe(tokenHash)
  })
  it('毎回異なる token（衝突しない）', () => {
    const a = generateInviteToken().token
    const b = generateInviteToken().token
    expect(a).not.toBe(b)
  })
})

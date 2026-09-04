import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mockSend = vi.fn()
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockSend }
  },
}))

import { sendEmail, isEmailConfigured } from './send-email'

const OLD_ENV = { ...process.env }
beforeEach(() => { mockSend.mockReset() })
afterEach(() => { process.env = { ...OLD_ENV } })

describe('sendEmail wrapper（Resend mock・実 network 無し）', () => {
  it('env 未設定 → provider を呼ばず unconfigured（成功を偽装しない）', async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    expect(isEmailConfigured()).toBe(false)
    const r = await sendEmail({ to: 'a@b.com', subject: 's', text: 't' })
    expect(r).toEqual({ ok: false, reason: 'unconfigured' })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('configured + provider 成功 → messageId。sender は MAIL_FROM・添付 Buffer を渡す', async () => {
    process.env.RESEND_API_KEY = 'key_test'
    process.env.MAIL_FROM = 'AIMEN24 <no-reply@example.com>'
    mockSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null })
    const r = await sendEmail({ to: 'a@b.com', subject: 's', text: 't', attachments: [{ filename: 'f.pdf', content: Buffer.from('%PDF-') }] })
    expect(r).toEqual({ ok: true, messageId: 'msg_123' })
    const payload = mockSend.mock.calls[0][0]
    expect(payload.from).toBe('AIMEN24 <no-reply@example.com>')
    expect(payload.to).toBe('a@b.com')
    expect(payload.text).toBe('t')
    expect(payload.attachments[0].filename).toBe('f.pdf')
    expect(Buffer.isBuffer(payload.attachments[0].content)).toBe(true)
  })

  it('provider error / id 無し → provider_error（成功を偽装しない）', async () => {
    process.env.RESEND_API_KEY = 'k'; process.env.MAIL_FROM = 'x@y.com'
    mockSend.mockResolvedValue({ data: null, error: { message: 'bad' } })
    expect(await sendEmail({ to: 'a@b.com', subject: 's', text: 't' })).toEqual({ ok: false, reason: 'provider_error' })
    mockSend.mockResolvedValue({ data: { id: null }, error: null })
    expect(await sendEmail({ to: 'a@b.com', subject: 's', text: 't' })).toEqual({ ok: false, reason: 'provider_error' })
  })

  it('例外（network 等）→ provider_error', async () => {
    process.env.RESEND_API_KEY = 'k'; process.env.MAIL_FROM = 'x@y.com'
    mockSend.mockRejectedValue(new Error('net'))
    expect(await sendEmail({ to: 'a@b.com', subject: 's', text: 't' })).toEqual({ ok: false, reason: 'provider_error' })
  })
})

describe('send-email: PII 非ログ構造', () => {
  it('console.* を使わない', () => {
    const SRC = readFileSync(join(process.cwd(), 'lib/email/send-email.ts'), 'utf8')
    expect(SRC).not.toContain('console.')
  })
})

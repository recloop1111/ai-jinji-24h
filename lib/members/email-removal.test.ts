import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// v1: アプリからのメール送信機能を完全撤去したことを守る（E-5-3-2A）。
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('応募者「メールで共有」UI の撤去', () => {
  const DETAIL = read('app/client/(dashboard)/applicants/[id]/page.tsx')
  it('メール共有 UI/状態/呼び出しを含まない', () => {
    for (const s of ['メールで共有', 'share-report-email', 'sendShareEmail', 'shareEmail', 'shareMessage', 'メールを送信']) {
      expect(DETAIL).not.toContain(s)
    }
  })
  it('PDF ダウンロード（履歴書/総合レポート）は維持', () => {
    expect(DETAIL).toContain('resume-pdf')
    expect(DETAIL).toContain('applicant-report-pdf')
    expect(DETAIL).toContain('downloadResumePdf')
    expect(DETAIL).toContain('downloadReportPdf')
  })
})

describe('email 機構ファイル/依存の撤去', () => {
  it('share-report-email endpoint が存在しない', () => {
    expect(existsSync(join(root, 'app/api/client/applicants/[id]/share-report-email/route.ts'))).toBe(false)
  })
  it('lib/email/send-email.ts / share-report.ts が存在しない', () => {
    expect(existsSync(join(root, 'lib/email/send-email.ts'))).toBe(false)
    expect(existsSync(join(root, 'lib/email/share-report.ts'))).toBe(false)
  })
  it('package.json に resend 依存が無い', () => {
    expect(read('package.json')).not.toContain('"resend"')
  })
  it('.env.example に email env が無い', () => {
    const env = read('.env.example')
    for (const s of ['RESEND_API_KEY', 'MAIL_FROM', 'MAIL_TEST_RECIPIENT_ALLOWLIST']) expect(env).not.toContain(s)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// SMS「送信」seam の配線を source-level で守る（RTL 不使用・actual SMS 0）。
//   - /sms/send: demo は実送信なし success / 通常は provider 未接続で honest 503 / trust boundary は server 解決。
//   - form: 応募者作成後に /sms/send を呼び、送信成功時のみ /verify へ進む（虚偽の遷移を作らない）。
//   - verify: ハードコード電話番号を撤去し、未送信で「送信しました」を出さない。
const SEND = readFileSync(join(process.cwd(), 'app/api/interview/[slug]/sms/send/route.ts'), 'utf8')
const FORM = readFileSync(join(process.cwd(), 'app/interview/[slug]/form/page.tsx'), 'utf8')
const VERIFY = readFileSync(join(process.cwd(), 'app/interview/[slug]/verify/page.tsx'), 'utf8')

describe('/sms/send route: trust boundary（server 解決・client 非信用）', () => {
  it('slug→company を service-role 解決し is_demo を select する', () => {
    expect(SEND).toContain('createServiceRoleClient')
    expect(SEND).toContain('is_suspended, is_demo')
    expect(SEND).toContain(".eq('interview_slug', slug)")
  })
  it('固定コード/チャネル判定は isFixedSmsCodeAllowed(company)（client の is_demo/company_id を使わない）', () => {
    expect(SEND).toContain('isFixedSmsCodeAllowed(company)')
    expect(SEND).not.toContain('body.is_demo')
    expect(SEND).not.toContain('body.company_id')
  })
  it('applicant が当該企業所属であることを再検証（cross-company を弾く）', () => {
    expect(SEND).toContain('applicant.company_id !== company.id')
  })
  it('token 検証（verifyInterviewToken）＋ applicant_id 突合', () => {
    expect(SEND).toContain('verifyInterviewToken')
    expect(SEND).toContain('applicantId !== payload.applicant_id')
  })
})

describe('/sms/send route: demo=実送信0 success / 通常=honest 503（actual SMS 0）', () => {
  it('demo 企業は実送信せず channel:demo の success を返す', () => {
    expect(SEND).toContain("successJson({ sent: true, channel: 'demo' })")
  })
  it('通常企業は resolveSmsProvider()（gate OFF で null）→ 503 SMS_NOT_AVAILABLE', () => {
    expect(SEND).toContain('resolveSmsProvider()')
    expect(SEND).toContain("errorJson('SMS_NOT_AVAILABLE'")
    expect(SEND).toContain('503')
  })
  it('token/phone/OTP を console/response に漏らさない（生番号を返さない・masked のみ）', () => {
    expect(SEND).not.toMatch(/console\.(log|error|info|warn)/)
    expect(SEND).toContain('maskPhone(')
  })
})

describe('form: 応募者作成後に /sms/send を呼び、送信成功時のみ /verify へ進む', () => {
  it('/sms/send を呼び出す seam がある', () => {
    expect(FORM).toContain('/api/interview/${slug}/sms/send')
  })
  it('送信失敗（!sent）は /verify へ進めず honest error を表示', () => {
    expect(FORM).toContain('!sendJson?.sent')
    expect(FORM).toContain('SMS認証は現在準備中です')
  })
  it('別の「SMSを送信する」ボタンを作らない（次へ進むがトリガー）', () => {
    expect(FORM).not.toContain('SMSを送信')
  })
  it('PII（生の電話番号）を URL に載せない（?phone= を撤去）', () => {
    expect(FORM).not.toContain('verify?phone=')
  })
})

describe('verify: ハードコード撤去＋未送信で「送信しました」を出さない', () => {
  it('ハードコード 090-****-5678 を撤去', () => {
    expect(VERIFY).not.toContain('090-****-5678')
  })
  it('通常企業の「送信しました」は maskedPhone があるときだけ（未送信で虚偽表示しない）', () => {
    expect(VERIFY).toContain('maskedPhone ?')
    expect(VERIFY).toContain('SMS認証は現在準備中です')
  })
  it('demo 文言は維持（demo のみ表示）', () => {
    expect(VERIFY).toContain('これはデモ環境です。SMSは送信されません。')
    expect(VERIFY).toContain('認証コード「')
  })
  it('resend は /sms/send へ接続（虚偽トーストの TODO を撤去）', () => {
    expect(VERIFY).toContain('/api/interview/${slug}/sms/send')
    expect(VERIFY).not.toContain('Phase 4 - Supabase経由でのSMS再送信')
  })
})

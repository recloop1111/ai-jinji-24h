import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateRecipientEmail, validateShareMessage, parseAllowlist, evaluateSendPolicy, buildShareEmailBody,
  SHARE_EMAIL_SUBJECT,
} from './share-report'

describe('validateRecipientEmail', () => {
  it('有効な単一アドレス', () => {
    expect(validateRecipientEmail('  Foo@Example.com ')).toEqual({ ok: true, email: 'Foo@Example.com' })
  })
  it('空 / 非string / 254超 / CRLF / 複数(comma) / 形式不正 は reject', () => {
    expect(validateRecipientEmail('').ok).toBe(false)
    expect(validateRecipientEmail(null).ok).toBe(false)
    expect(validateRecipientEmail(123).ok).toBe(false)
    expect(validateRecipientEmail('a'.repeat(250) + '@b.com').ok).toBe(false)
    expect(validateRecipientEmail('a@b.com\r\nBcc: x@y.com').ok).toBe(false)
    expect(validateRecipientEmail('a@b.com,c@d.com').ok).toBe(false) // 複数不可
    expect(validateRecipientEmail('not-an-email').ok).toBe(false)
  })
})

describe('validateShareMessage', () => {
  it('null/未指定は空でOK・trim・1000上限', () => {
    expect(validateShareMessage(null)).toEqual({ ok: true, message: '' })
    expect(validateShareMessage('  hi  ')).toEqual({ ok: true, message: 'hi' })
    expect(validateShareMessage('あ'.repeat(1000)).ok).toBe(true)
    expect(validateShareMessage('あ'.repeat(1001)).ok).toBe(false)
    expect(validateShareMessage(123 as unknown).ok).toBe(false)
  })
})

describe('parseAllowlist', () => {
  it('comma 区切りを trim・小文字・空除去', () => {
    expect(parseAllowlist(' A@B.com , c@d.com ,')).toEqual(['a@b.com', 'c@d.com'])
    expect(parseAllowlist('')).toEqual([])
    expect(parseAllowlist(null)).toEqual([])
  })
})

describe('evaluateSendPolicy（demo/preview は allowlist 制限・prod non-demo は通常送信）', () => {
  const AL = ['ok@test.com']
  it('production かつ non-demo → 常に許可', () => {
    expect(evaluateSendPolicy({ isDemo: false, isProduction: true, recipient: 'anyone@x.com', allowlist: [] }).allowed).toBe(true)
  })
  it('demo → allowlist 内のみ許可', () => {
    expect(evaluateSendPolicy({ isDemo: true, isProduction: true, recipient: 'OK@test.com', allowlist: AL }).allowed).toBe(true)
    expect(evaluateSendPolicy({ isDemo: true, isProduction: true, recipient: 'ng@x.com', allowlist: AL })).toEqual({ allowed: false, reason: 'allowlist_only' })
  })
  it('preview(非prod) → allowlist 内のみ許可', () => {
    expect(evaluateSendPolicy({ isDemo: false, isProduction: false, recipient: 'ok@test.com', allowlist: AL }).allowed).toBe(true)
    expect(evaluateSendPolicy({ isDemo: false, isProduction: false, recipient: 'ng@x.com', allowlist: AL })).toEqual({ allowed: false, reason: 'allowlist_only' })
  })
  it('allowlist 未設定なら demo/preview は送信不可（解放しない）', () => {
    expect(evaluateSendPolicy({ isDemo: true, isProduction: true, recipient: 'ok@test.com', allowlist: [] })).toEqual({ allowed: false, reason: 'allowlist_unset' })
    expect(evaluateSendPolicy({ isDemo: false, isProduction: false, recipient: 'ok@test.com', allowlist: [] })).toEqual({ allowed: false, reason: 'allowlist_unset' })
  })
})

describe('buildShareEmailBody / 件名', () => {
  it('氏名を本文に含み、任意 message があれば挿入・無ければ余計な空行を作らない', () => {
    const withMsg = buildShareEmailBody('高橋 美咲', 'ご確認ください')
    expect(withMsg).toContain('応募者「高橋 美咲」さんの応募者総合レポートをお送りします。')
    expect(withMsg).toContain('ご確認ください')
    expect(withMsg).toContain('個人情報資料が添付されています')
    expect(withMsg).toContain('AIMEN24')
    const noMsg = buildShareEmailBody('高橋 美咲', '')
    expect(noMsg).not.toContain('\n\n\n') // 3連続空行を作らない
  })
  it('件名は固定で応募者氏名/会社名を含めない', () => {
    expect(SHARE_EMAIL_SUBJECT).toBe('AIMEN24｜応募者総合レポートのご送付')
    expect(SHARE_EMAIL_SUBJECT).not.toContain('美咲')
  })
})

// ── source-level guard ──
const ROUTE = readFileSync(join(process.cwd(), 'app/api/client/applicants/[id]/share-report-email/route.ts'), 'utf8')
const PAGE = readFileSync(join(process.cwd(), 'app/client/(dashboard)/applicants/[id]/page.tsx'), 'utf8')

describe('share-report-email route: runtime/auth/tenant/gate/SoT', () => {
  it("runtime='nodejs'・POST・getClientUser・tenant company_id", () => {
    expect(ROUTE).toContain("export const runtime = 'nodejs'")
    expect(ROUTE).toContain('export async function POST')
    expect(ROUTE).toContain('getClientUser()')
    expect(ROUTE).toContain(".eq('company_id', user.companyId)")
  })
  it('AI評価ゲート: interview_results 無しは NOT_FOUND', () => {
    expect(ROUTE).toContain("from('interview_results')")
    expect(ROUTE).toContain(".eq('applicant_id', id)")
    expect(ROUTE).toContain("apiError('NOT_FOUND'")
  })
  it('tenant データは createClientServerClient(RLS)。総合PDF builder を直接呼ぶ（内部 fetch しない）', () => {
    expect(ROUTE).toContain('createClientServerClient')
    expect(ROUTE).toContain('buildApplicantReportPdf(input)')
    // 既存 PDF route を内部 HTTP fetch しない（builder を直接呼ぶ）。import path は許容。
    expect(ROUTE).not.toContain('applicants/${id}/applicant-report-pdf')
  })
  it('禁止データ/スキーマを取得しない', () => {
    for (const f of ["from('reports')", "from('report_axis_scores')", "from('report_scores')", "from('report_qa_summaries')", "from('interview_transcripts')", "from('internal_memos')", 'recording_url', 'duplicate_flag', 'inappropriate_flag', 'selection_status']) {
      expect(ROUTE).not.toContain(f)
    }
  })
  it('filename は PII 無し ASCII', () => {
    expect(ROUTE).toContain('`applicant-report_${id.slice(0, 8)}.pdf`')
  })
  it('未設定は honest 503・成功偽装しない・env未設定/allowlist で送信制御', () => {
    expect(ROUTE).toContain('isEmailConfigured()')
    expect(ROUTE).toContain('evaluateSendPolicy(')
    expect(ROUTE).toContain('MAIL_TEST_RECIPIENT_ALLOWLIST')
    expect(ROUTE).toContain("process.env.VERCEL_ENV === 'production'")
    expect(ROUTE).toContain("errorJson('EMAIL_UNAVAILABLE'")
  })
  it('provider 成功時のみ audit＝sent、失敗は failed。audit失敗でも送信失敗にしない', () => {
    expect(ROUTE).toContain("from('sent_emails')")
    expect(ROUTE).toContain("template_type: 'applicant_report'")
    expect(ROUTE).toContain('email_template_id: null')
    expect(ROUTE).toContain('body: SHARE_EMAIL_AUDIT_BODY') // PDF/本文全文は保存しない
    expect(ROUTE).toContain("resend_message_id: messageId")
    expect(ROUTE).toContain("auditInsert('sent', result.messageId)")
    expect(ROUTE).toContain("auditInsert('failed', null)")
    expect(ROUTE).toContain('successJson({ sent: true, auditRecorded })')
  })
  it('PII を console にログしない', () => {
    expect(ROUTE).not.toContain('console.')
  })
})

describe('共有タブ UI: メール共有配線', () => {
  it('TODO toast 撤去・fetch 先 share-report-email・成功は json.sent 時のみ', () => {
    expect(PAGE).not.toContain("setToast('メール送信機能は今後実装予定です')")
    expect(PAGE).toContain('/api/client/applicants/${id}/share-report-email')
    expect(PAGE).toContain('!res.ok || !json?.sent')
    expect(PAGE).toContain('応募者総合レポートPDFをメールに添付して送信します。')
  })
  it('interviewResult ゲート・loading/disabled・失敗時入力保持', () => {
    expect(PAGE).toContain('disabled={!interviewResult || shareSending}')
    expect(PAGE).toContain("{shareSending ? '送信中…' : '送信する'}")
    // 失敗時は setShareEmail('') / setShareMessage('') を呼ばない（成功時のみ clear）
    expect(PAGE).toContain('setShareSuccess(true)')
  })
})

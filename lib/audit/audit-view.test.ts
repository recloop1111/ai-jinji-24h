import { describe, it, expect } from 'vitest'
import { auditActionLabel, buildAuditSentence, auditActorName, auditActorRoleLabel, formatAuditDate, type AuditLogView } from './audit-view'
import { COMPANY_AUDIT_ACTIONS } from './company-audit'

const base = (over: Partial<AuditLogView> = {}): AuditLogView => ({
  id: 'x', action: 'unknown', resource_type: 'company', resource_id: null, created_at: '2026-09-05T05:30:00Z',
  actor: { display_name: '佐藤 太郎', role: 'admin', email: 's@e.com' }, target: { label: null }, metadata: {}, ...over,
})

describe('auditActionLabel', () => {
  it('全 COMPANY_AUDIT_ACTIONS に日本語ラベルがある（fallback にならない）', () => {
    for (const a of COMPANY_AUDIT_ACTIONS) expect(auditActionLabel(a)).not.toBe('操作を実行')
  })
  it('未知 action は fallback', () => {
    expect(auditActionLabel('foo.bar')).toBe('操作を実行')
  })
})

describe('buildAuditSentence', () => {
  it('export（履歴書/総合/CSV件数）', () => {
    expect(buildAuditSentence(base({ action: 'applicant.resume_pdf_exported', resource_type: 'applicant', target: { label: '高橋 美咲' } }))).toBe('応募者「高橋 美咲」の履歴書PDFをダウンロード')
    expect(buildAuditSentence(base({ action: 'applicant.report_pdf_exported', target: { label: '高橋 美咲' } }))).toContain('総合レポートPDFをダウンロード')
    expect(buildAuditSentence(base({ action: 'applicant.csv_exported', metadata: { exported_count: 12 } }))).toBe('応募者CSVをダウンロード（12件）')
    expect(buildAuditSentence(base({ action: 'applicant.csv_exported', metadata: {} }))).toBe('応募者CSVをダウンロード')
  })
  it('selection result from→to（日本語値そのまま）', () => {
    expect(buildAuditSentence(base({ action: 'applicant.selection_result_changed', target: { label: '高橋 美咲' }, metadata: { from_result: '検討中', to_result: '不採用' } })))
      .toBe('応募者「高橋 美咲」の選考結果を「検討中」から「不採用」に変更')
  })
  it('selection memo は本文を出さない', () => {
    const s = buildAuditSentence(base({ action: 'applicant.selection_memo_changed', target: { label: '高橋 美咲' }, metadata: {} }))
    expect(s).toBe('応募者「高橋 美咲」の選考メモを更新')
  })
  it('invite create/regenerate/revoke（email target）', () => {
    expect(buildAuditSentence(base({ action: 'member.invite_created', target: { label: 'a@b.com' } }))).toBe('「a@b.com」の招待リンクを発行')
    expect(buildAuditSentence(base({ action: 'member.invite_regenerated', target: { label: 'a@b.com' } }))).toContain('再発行')
    expect(buildAuditSentence(base({ action: 'member.invite_revoked', target: { label: 'a@b.com' } }))).toContain('取消')
  })
  it('member joined 自然文', () => {
    expect(buildAuditSentence(base({ action: 'member.joined', target: { label: '田中 裕太' } }))).toBe('田中 裕太がメンバーとして参加')
  })
  it('role change from→to（英語 role を日本語化）', () => {
    expect(buildAuditSentence(base({ action: 'member.role_changed', target: { label: '田中 裕太' }, metadata: { from_role: 'viewer', to_role: 'recruiter' } })))
      .toBe('田中 裕太の権限を「閲覧者」から「採用担当」に変更')
  })
  it('suspend / reactivate(再有効化) / reactivate(復元) / remove', () => {
    expect(buildAuditSentence(base({ action: 'member.suspended', target: { label: '田中 裕太' } }))).toBe('田中 裕太を利用停止')
    expect(buildAuditSentence(base({ action: 'member.reactivated', target: { label: '田中 裕太' }, metadata: { from_status: 'suspended' } }))).toBe('田中 裕太を再有効化')
    expect(buildAuditSentence(base({ action: 'member.reactivated', target: { label: '田中 裕太' }, metadata: { from_status: 'removed' } }))).toBe('田中 裕太を復元')
    expect(buildAuditSentence(base({ action: 'member.removed', target: { label: '田中 裕太' } }))).toBe('田中 裕太をメンバーから削除')
  })
  it('company / template', () => {
    expect(buildAuditSentence(base({ action: 'company.billing_profile_changed' }))).toBe('請求先情報を変更')
    expect(buildAuditSentence(base({ action: 'company.plan_changed' }))).toBe('プラン設定を変更')
    expect(buildAuditSentence(base({ action: 'company.setting_password_changed' }))).toBe('設定用パスワードを変更')
    expect(buildAuditSentence(base({ action: 'company.suspension_requested' }))).toBe('停止申請を実行')
    expect(buildAuditSentence(base({ action: 'company.suspension_cancelled' }))).toBe('停止申請を取消')
    expect(buildAuditSentence(base({ action: 'company.emergency_suspension_requested' }))).toBe('緊急停止を申請')
    expect(buildAuditSentence(base({ action: 'template.updated' }))).toBe('テンプレートを更新')
  })
  it('billing invoice: billing_month あり→YYYY年M月分・欠落→fallback（金額は出さない）', () => {
    expect(buildAuditSentence(base({ action: 'billing.invoice_pdf_exported', resource_type: 'billing_record', metadata: { billing_month: '2026-08' } }))).toBe('2026年8月分の請求書PDFをダウンロード')
    expect(buildAuditSentence(base({ action: 'billing.invoice_pdf_exported', resource_type: 'billing_record', metadata: { billing_month: '2026-08-01' } }))).toBe('2026年8月分の請求書PDFをダウンロード')
    expect(buildAuditSentence(base({ action: 'billing.invoice_pdf_exported', resource_type: 'billing_record', metadata: {} }))).toBe('請求書PDFをダウンロード')
  })
  it('unknown action は fallback', () => {
    expect(buildAuditSentence(base({ action: 'foo.bar' }))).toBe('操作を実行')
  })
  it('全 union で例外を投げない・空文字にならない', () => {
    for (const a of COMPANY_AUDIT_ACTIONS) {
      const s = buildAuditSentence(base({ action: a, target: { label: 'X' } }))
      expect(typeof s).toBe('string')
      expect(s.length).toBeGreaterThan(0)
    }
  })
})

describe('actor / date helpers', () => {
  it('actor name: display_name → email → 不明なユーザー', () => {
    expect(auditActorName(base({ actor: { display_name: '佐藤', role: 'admin' } }))).toBe('佐藤')
    expect(auditActorName(base({ actor: { display_name: null, role: 'admin', email: 's@e.com' } }))).toBe('s@e.com')
    expect(auditActorName(base({ actor: { display_name: null, role: null, email: null } }))).toBe('不明なユーザー')
  })
  it('actor role snapshot label（NULL は —）', () => {
    expect(auditActorRoleLabel(base({ actor: { display_name: 'x', role: 'owner' } }))).toBe('オーナー')
    expect(auditActorRoleLabel(base({ actor: { display_name: 'x', role: null } }))).toBe('—')
  })
  it('formatAuditDate（invalid は —）', () => {
    expect(formatAuditDate('invalid')).toBe('—')
    expect(formatAuditDate('2026-09-05T05:30:00Z')).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)
  })
})

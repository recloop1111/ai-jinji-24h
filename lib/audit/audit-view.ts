// 企業操作ログの表示 pure helper（E-5-4-2）。DB は英語 stable action ID・UI で日本語化。
//   ※ metadata は既知キーのみ参照（JSON.stringify で丸出ししない）。target/actor label は API で解決済みを受け取る。
import { companyRoleLabel } from '@/lib/members/member-view'

// API から返る 1 行の表示用 view。
export type AuditLogView = {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  created_at: string
  actor: { display_name: string | null; role: string | null; email?: string | null }
  target: { label: string | null }
  metadata: Record<string, string | number | boolean | null>
}

// action → 短い日本語ラベル（一覧の「操作内容」列など）。未知は honest fallback。
const ACTION_LABEL: Record<string, string> = {
  'applicant.resume_pdf_exported': '履歴書PDFをダウンロード',
  'applicant.report_pdf_exported': '総合レポートPDFをダウンロード',
  'applicant.csv_exported': '応募者CSVをダウンロード',
  'applicant.selection_result_changed': '選考結果を変更',
  'applicant.selection_memo_changed': '選考メモを更新',
  'member.invite_created': '招待リンクを発行',
  'member.invite_regenerated': '招待リンクを再発行',
  'member.invite_revoked': '招待を取消',
  'member.joined': 'メンバーが参加',
  'member.role_changed': 'メンバーの権限を変更',
  'member.suspended': 'メンバーを利用停止',
  'member.reactivated': 'メンバーを再有効化',
  'member.removed': 'メンバーから削除',
  'company.billing_profile_changed': '請求先情報を変更',
  'company.plan_changed': 'プラン設定を変更',
  'company.setting_password_changed': '設定用パスワードを変更',
  'company.suspension_requested': '停止申請を実行',
  'company.suspension_cancelled': '停止申請を取消',
  'company.emergency_suspension_requested': '緊急停止を申請',
  'template.created': 'テンプレートを作成',
  'template.updated': 'テンプレートを更新',
  'template.deleted': 'テンプレートを削除',
  'billing.invoice_pdf_exported': '請求書PDFをダウンロード',
  'job.created': '求人を作成',
  'job.updated': '求人を更新',
  'job.deleted': '求人を削除',
  'question.updated': '面接質問を更新',
  'company_settings.updated': '企業情報を変更',
}

// 'YYYY-MM'（または 'YYYY-MM-DD'）→「YYYY年M月」。不正/空は null。
function billingMonthLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  return `${m[1]}年${Number(m[2])}月`
}

export function auditActionLabel(action: string): string {
  return ACTION_LABEL[action] ?? '操作を実行'
}

// metadata の role 値（英語）を日本語へ。selection result 値は DB 上すでに日本語なのでそのまま。
function roleLabel(v: unknown): string {
  return typeof v === 'string' ? companyRoleLabel(v) : '—'
}
function str(v: unknown): string {
  return typeof v === 'string' && v.length > 0 ? v : ''
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// 人間可読の操作文（target/actor は解決済み label を使用）。metadata は既知キーのみ参照。
export function buildAuditSentence(view: AuditLogView): string {
  const target = view.target.label ?? ''
  const m = view.metadata ?? {}
  switch (view.action) {
    case 'applicant.resume_pdf_exported': return `応募者「${target}」の履歴書PDFをダウンロード`
    case 'applicant.report_pdf_exported': return `応募者「${target}」の総合レポートPDFをダウンロード`
    case 'applicant.csv_exported': {
      const n = num(m.exported_count)
      return n != null ? `応募者CSVをダウンロード（${n}件）` : '応募者CSVをダウンロード'
    }
    case 'applicant.selection_result_changed': {
      const from = str(m.from_result), to = str(m.to_result)
      return from && to ? `応募者「${target}」の選考結果を「${from}」から「${to}」に変更` : `応募者「${target}」の選考結果を変更`
    }
    case 'applicant.selection_memo_changed': return `応募者「${target}」の選考メモを更新`
    case 'member.invite_created': return `「${target}」の招待リンクを発行`
    case 'member.invite_regenerated': return `「${target}」の招待リンクを再発行`
    case 'member.invite_revoked': return `「${target}」の招待を取消`
    case 'member.joined': return `${target}がメンバーとして参加`
    case 'member.role_changed': return `${target}の権限を「${roleLabel(m.from_role)}」から「${roleLabel(m.to_role)}」に変更`
    case 'member.suspended': return `${target}を利用停止`
    case 'member.reactivated': return m.from_status === 'removed' ? `${target}を復元` : `${target}を再有効化`
    case 'member.removed': return `${target}をメンバーから削除`
    case 'company.billing_profile_changed': return '請求先情報を変更'
    case 'company.plan_changed': return 'プラン設定を変更'
    case 'company.setting_password_changed': return '設定用パスワードを変更'
    case 'company.suspension_requested': return '停止申請を実行'
    case 'company.suspension_cancelled': return '停止申請を取消'
    case 'company.emergency_suspension_requested': return '緊急停止を申請'
    case 'template.created': return 'テンプレートを作成'
    case 'template.updated': return 'テンプレートを更新'
    case 'template.deleted': return 'テンプレートを削除'
    case 'billing.invoice_pdf_exported': {
      const ym = billingMonthLabel(m.billing_month)
      return ym ? `${ym}分の請求書PDFをダウンロード` : '請求書PDFをダウンロード'
    }
    default: return auditActionLabel(view.action)
  }
}

// 操作者の表示名（API 解決済み）。空なら honest fallback。
export function auditActorName(view: AuditLogView): string {
  return view.actor.display_name || view.actor.email || '不明なユーザー'
}
export function auditActorRoleLabel(view: AuditLogView): string {
  return view.actor.role ? companyRoleLabel(view.actor.role) : '—'
}

// 日時（YYYY/MM/DD HH:mm）。invalid は honest fallback。
export function formatAuditDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

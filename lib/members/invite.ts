// 企業メンバー招待の pure helper（E-5-3-2）。email 正規化 / role 検証 / 期限 / メール本文。
//   ※ email は trim + lowercase で正規化して保存（member_invites.email）。
//   ※ owner は招待 role として不可（admin/recruiter/viewer のみ）。
import { validateRecipientEmail } from '@/lib/email/share-report'
import type { CompanyRole } from '@/lib/rbac/roles'

export const INVITE_EXPIRY_DAYS = 7
export const INVITE_EMAIL_SUBJECT = 'AIMEN24｜企業アカウントへの招待'

// 招待可能な role（owner は含めない）。
export const INVITABLE_ROLES = ['admin', 'recruiter', 'viewer'] as const
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export function isInvitableRole(v: unknown): v is InvitableRole {
  return typeof v === 'string' && (INVITABLE_ROLES as readonly string[]).includes(v)
}

// role の日本語（招待フォーム/一覧用）。owner も参照され得るので含める。
export const INVITE_ROLE_LABEL: Record<CompanyRole, string> = {
  owner: 'オーナー', admin: '管理者', recruiter: '採用担当', viewer: '閲覧者',
}

export type NormalizedEmail = { ok: true; email: string } | { ok: false; error: string }

// 招待先 email を検証＋正規化（trim → lowercase）。単一アドレス・CRLF/カンマ不可（validateRecipientEmail 準拠）。
export function normalizeInviteEmail(raw: unknown): NormalizedEmail {
  const r = validateRecipientEmail(raw)
  if (!r.ok) return r
  return { ok: true, email: r.email.toLowerCase() }
}

// 有効期限（now から INVITE_EXPIRY_DAYS 日）。
export function computeInviteExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function isInviteExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return true
  const t = new Date(expiresAt).getTime()
  return Number.isNaN(t) || t < now.getTime()
}

// 招待メール本文（plain text）。PII は会社名のみ・token は URL に含める（本文へ平文 token を別記しない）。
export function buildInviteEmailBody(companyName: string, acceptUrl: string): string {
  return [
    `${companyName} より、AIMEN24 の企業アカウントに招待されました。`,
    '',
    '以下のリンクを開き、お名前とパスワードを設定してご参加ください。',
    acceptUrl,
    '',
    `※ このリンクの有効期限は ${INVITE_EXPIRY_DAYS} 日間です。`,
    '※ このメールにお心当たりがない場合は破棄してください。',
  ].join('\n')
}

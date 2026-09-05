// 企業メンバー招待の pure helper（E-5-3-2A: v1 はアプリからメール送信しない＝招待リンク共有方式）。
//   ※ email は「作成されるアカウントのログイン email」として保存（送信先ではない）。trim + lowercase 正規化。
//   ※ owner は招待 role として不可（admin/recruiter/viewer のみ）。
//   ※ 招待リンクは URL fragment（#token=）方式＝bearer token を server ログへ載せない security hardening。
import type { CompanyRole } from '@/lib/rbac/roles'

export const INVITE_EXPIRY_DAYS = 7

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

// 招待先 email を検証＋正規化（trim → lowercase）。単一アドレス・≤254・CRLF/カンマ不可（RFC-lite）。
//   ※ これはログイン ID となる email の検証であり、メール送信は行わない。
export function normalizeInviteEmail(raw: unknown): NormalizedEmail {
  if (typeof raw !== 'string') return { ok: false, error: 'メールアドレスを入力してください' }
  const email = raw.trim().toLowerCase()
  if (email.length === 0) return { ok: false, error: 'メールアドレスを入力してください' }
  if (email.length > 254) return { ok: false, error: 'メールアドレスが長すぎます' }
  if (/[\r\n]/.test(email) || email.includes(',')) return { ok: false, error: 'メールアドレスの形式が正しくありません' }
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)) return { ok: false, error: 'メールアドレスの形式が正しくありません' }
  return { ok: true, email }
}

// 有効期限（now から INVITE_EXPIRY_DAYS 日）。
export function computeInviteExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function isInviteExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return true
  const t = new Date(expiresAt).getTime()
  return Number.isNaN(t) || t <= now.getTime()
}

// 招待リンク（fragment に token を載せる＝#token=）。origin は deploy 由来。
export function buildInviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/invite/accept#token=${token}`
}

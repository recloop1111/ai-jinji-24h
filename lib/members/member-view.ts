// 企業メンバー表示 & full_name validation の pure helper（E-5-3-1）。
//   role/status の日本語ラベルは UI 全体で1箇所に集約（画面ごとの直書きドリフトを防ぐ）。
//   full_name validation は server(route) と UI で共有し、client 検証だけに依存しない。

import type { CompanyRole, CompanyMemberStatus } from '@/lib/rbac/roles'

export const COMPANY_ROLE_LABEL: Record<CompanyRole, string> = {
  owner: 'オーナー',
  admin: '管理者',
  recruiter: '採用担当',
  viewer: '閲覧者',
}

export const MEMBER_STATUS_LABEL: Record<CompanyMemberStatus, string> = {
  active: '有効',
  suspended: '停止中',
  removed: '削除済み',
}

// 未知値でも落ちないラベル解決（DB 由来の想定外値を安全に表示）。
export function companyRoleLabel(role: string | null | undefined): string {
  return (role && (COMPANY_ROLE_LABEL as Record<string, string>)[role]) || '—'
}
export function memberStatusLabel(status: string | null | undefined): string {
  return (status && (MEMBER_STATUS_LABEL as Record<string, string>)[status]) || '—'
}

export const MAX_FULL_NAME_LENGTH = 100

export type FullNameValidation = { ok: true; value: string } | { ok: false; error: string }

// メンバー表示名の validation。string・trim・1〜100文字・改行不可・plain text（HTML 扱いしない）。
//   空文字は不可（未設定に戻す UI は今回作らない＝非空を保存）。
export function validateFullName(input: unknown): FullNameValidation {
  if (typeof input !== 'string') return { ok: false, error: '表示名は文字列で入力してください' }
  const value = input.trim()
  if (value.length === 0) return { ok: false, error: '表示名を入力してください' }
  if (/[\r\n]/.test(value)) return { ok: false, error: '表示名に改行は使用できません' }
  if (value.length > MAX_FULL_NAME_LENGTH) return { ok: false, error: `表示名は${MAX_FULL_NAME_LENGTH}文字以内で入力してください` }
  return { ok: true, value }
}

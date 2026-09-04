import { describe, it, expect } from 'vitest'
import {
  COMPANY_ROLE_LABEL, MEMBER_STATUS_LABEL, companyRoleLabel, memberStatusLabel,
  MAX_FULL_NAME_LENGTH, validateFullName,
} from './member-view'

describe('member-view labels', () => {
  it('role 日本語ラベル', () => {
    expect(COMPANY_ROLE_LABEL).toEqual({ owner: 'オーナー', admin: '管理者', recruiter: '採用担当', viewer: '閲覧者' })
    expect(companyRoleLabel('owner')).toBe('オーナー')
    expect(companyRoleLabel('unknown')).toBe('—')
    expect(companyRoleLabel(null)).toBe('—')
  })
  it('status 日本語ラベル', () => {
    expect(MEMBER_STATUS_LABEL).toEqual({ active: '有効', suspended: '停止中', removed: '削除済み' })
    expect(memberStatusLabel('suspended')).toBe('停止中')
    expect(memberStatusLabel('weird')).toBe('—')
  })
})

describe('validateFullName', () => {
  it('最大100文字', () => { expect(MAX_FULL_NAME_LENGTH).toBe(100) })
  it('string 以外 reject', () => {
    expect(validateFullName(123).ok).toBe(false)
    expect(validateFullName(null).ok).toBe(false)
  })
  it('trim される', () => {
    const r = validateFullName('  山田 太郎  ')
    expect(r.ok && r.value).toBe('山田 太郎')
  })
  it('空/空白のみ reject', () => {
    expect(validateFullName('').ok).toBe(false)
    expect(validateFullName('   ').ok).toBe(false)
  })
  it('改行 reject', () => {
    expect(validateFullName('山田\n太郎').ok).toBe(false)
  })
  it('100文字 OK / 101文字 reject', () => {
    expect(validateFullName('あ'.repeat(100)).ok).toBe(true)
    expect(validateFullName('あ'.repeat(101)).ok).toBe(false)
  })
})

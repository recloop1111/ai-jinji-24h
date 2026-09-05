import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const ROUTE = read('app/api/client/audit-logs/route.ts')
const SETTINGS = read('app/client/(dashboard)/settings/page.tsx')
const TAB = read('components/client/AuditLogsTab.tsx')

describe('audit-logs route', () => {
  it('audit.read guard・company_id 固定・GET 自身は audit しない', () => {
    expect(ROUTE).toContain("can(user.companyRole, 'audit.read')")
    expect(ROUTE).toContain("apiError('FORBIDDEN')")
    expect(ROUTE).toContain("eq('company_id', user.companyId)")
    expect(ROUTE).not.toContain('writeCompanyAuditLog')
  })
  it('token/hash/password を select しない', () => {
    expect(ROUTE).not.toContain('token_hash')
    expect(ROUTE).not.toContain('company_setting_password_hash')
    expect(ROUTE).not.toContain('password')
  })
  it('server-side pagination（range・order desc）', () => {
    expect(ROUTE).toContain('.range(from, to)')
    expect(ROUTE).toContain("order('created_at', { ascending: false })")
    expect(ROUTE).toContain('total_pages')
  })
})

describe('settings 操作ログタブ', () => {
  it('audit.read 保有時のみタブ表示・AuditLogsTab 描画', () => {
    expect(SETTINGS).toContain("canPermission('audit.read')")
    expect(SETTINGS).toContain("label: '操作ログ'")
    expect(SETTINGS).toContain('<AuditLogsTab />')
  })
})

describe('AuditLogsTab UI', () => {
  it('empty / error / loading を区別', () => {
    expect(TAB).toContain('操作ログはまだありません')
    expect(TAB).toContain('操作ログを取得できませんでした')
    expect(TAB).toContain('読み込み中')
  })
  it('raw metadata JSON / dangerouslySetInnerHTML を出さない', () => {
    expect(TAB).not.toContain('JSON.stringify')
    expect(TAB).not.toContain('dangerouslySetInnerHTML')
  })
  it('view helper（sentence/actor/date）を使用・pagination UI', () => {
    expect(TAB).toContain('buildAuditSentence')
    expect(TAB).toContain('auditActorName')
    expect(TAB).toContain('formatAuditDate')
    expect(TAB).toContain('total_pages > 1')
  })
})

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { COMPANY_AUDIT_ACTIONS } from './company-audit'

// E-5-4 Final Audit Coverage: 宣言済み COMPANY_AUDIT_ACTIONS が「宣言だけで未配線」に
// ならないことを保証する。各 action 文字列が app/api 配下のいずれかの route から
// 実際に writeCompanyAuditLog へ渡されている（= 文字列として出現する）ことを検証する。
// 新しい action を union に足したら、同じ commit で route 配線が必要になる（gap 防止）。

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('route.ts')) out.push(p)
  }
  return out
}

const apiDir = path.join(process.cwd(), 'app', 'api')
const routeSources = walk(apiDir).map((p) => readFileSync(p, 'utf8')).join('\n')

describe('company audit coverage', () => {
  it('宣言済み action はすべて app/api の route から配線されている', () => {
    const unwired = COMPANY_AUDIT_ACTIONS.filter((a) => !routeSources.includes(`'${a}'`) && !routeSources.includes(`"${a}"`))
    expect(unwired).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Pre-Redesign Regression Sweep: 企業側 UI から jobs/questions/settings への browser 直 write が
// server route 化された状態を固定する。将来 client 直 DML を戻したら fail させる。
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8')

describe('client 直 DML の回帰ガード', () => {
  it('settings: companies への browser update を持たず server route(fetch)を使う', () => {
    const src = read('app/client/(dashboard)/settings/page.tsx')
    // READ（.select）は RLS スコープで許容。WRITE（.update）の起点だけを禁止する。
    expect(src).not.toMatch(/\.from\('companies'\)[\s\S]{0,60}\.update\(/)
    expect(src).toContain("fetch('/api/client/company'")
  })

  it('JobManager: client 文脈は server route を使う（admin 文脈のみ browser 維持）', () => {
    const src = read('components/shared/JobManager.tsx')
    expect(src).toContain('isAdminCtx')
    expect(src).toContain("fetch('/api/client/jobs'")
    expect(src).toContain('/api/client/jobs/')
    // browser の jobs write は必ず isAdminCtx 分岐配下（else 側は fetch）
    expect(src).toContain('if (isAdminCtx)')
  })

  it('QuestionEditor: client 文脈は server route を使う（admin 文脈のみ browser 維持）', () => {
    const src = read('components/shared/QuestionEditor.tsx')
    expect(src).toContain('isAdminCtx')
    expect(src).toContain("fetch('/api/client/questions'")
  })
})

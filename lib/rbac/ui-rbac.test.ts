import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// UI RBAC の最小配線を source-level で守る（Phase E-5-2）。security の正はサーバ/RLS だが、
// VIEWER に押せない export/write ボタンを見せ続けないこと（owner/admin/recruiter は従来UI維持）。
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const DETAIL = read('app/client/(dashboard)/applicants/[id]/page.tsx')
const JOBS_PAGE = read('app/client/(dashboard)/jobs/page.tsx')
const Q_PAGE = read('app/client/(dashboard)/questions/page.tsx')
const JOBMGR = read('components/shared/JobManager.tsx')
const QEDIT = read('components/shared/QuestionEditor.tsx')

describe('applicant 詳細: VIEWER の export/write を gate', () => {
  it('useCompanyPermissions を使う', () => {
    expect(DETAIL).toContain("useCompanyPermissions")
  })
  it('履歴書/総合PDF/メール共有/選考ステータスを can() で gate', () => {
    expect(DETAIL).toContain("can('resume.pdf.download')")
    expect(DETAIL).toContain("can('applicant_report.pdf.download')")
    expect(DETAIL).toContain("can('applicant_report.email_share')")
    expect(DETAIL).toContain("can('selection.manage')")
    expect(DETAIL).toContain("can('share_link.manage')")
  })
})

describe('jobs / questions: canWrite を role から渡す', () => {
  it('jobs ページは can(job.manage) を JobManager.canWrite へ渡す', () => {
    expect(JOBS_PAGE).toContain("canWrite={can('job.manage')}")
  })
  it('questions ページは can(question.manage) を QuestionEditor.canWrite へ渡す', () => {
    expect(Q_PAGE).toContain("canWrite={can('question.manage')}")
  })
})

describe('shared components: canWrite prop（default true で admin/既存は不変）', () => {
  it('JobManager は canWrite を受け取り default true', () => {
    expect(JOBMGR).toContain('canWrite = true')
    expect(JOBMGR).toContain('{canWrite && (')
  })
  it('QuestionEditor は canWrite を受け取り default true・編集領域を fieldset disabled で無効化', () => {
    expect(QEDIT).toContain('canWrite = true')
    expect(QEDIT).toContain('<fieldset disabled={!canWrite}')
  })
})

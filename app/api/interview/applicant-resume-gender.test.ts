import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 応募者作成 API の性別ハンドリング（source-level guard・route は service-role/network 依存で単体不可）:
//   - 新 resume 経路（body.resume あり）は validateResumeGender で male/female を強制。
//   - legacy 経路（resume なし）は gender をそのまま保存＝既存 other/no_answer 応募と互換（破壊しない）。
const ROUTE = readFileSync(join(process.cwd(), 'app/api/interview/[slug]/applicant/route.ts'), 'utf8')

describe('applicant route: 新 resume 経路の gender は male/female 必須', () => {
  it('resume 経路で validateResumeGender を呼び、エラーなら 4xx（fields 付き）', () => {
    expect(ROUTE).toContain('if (body.resume != null')
    expect(ROUTE).toContain('validateResumeGender(str(body.gender))')
    expect(ROUTE).toContain("apiError('VALIDATION_ERROR', '入力内容を確認してください', { fields: allErrors })")
  })
  it('validateResumeGender は resume 経路にのみ存在（legacy 経路には無い＝legacy 互換）', () => {
    const occurrences = ROUTE.split('validateResumeGender(').length - 1
    expect(occurrences).toBe(1) // import 行以外の実呼び出しは 1 回だけ（resume 経路）
    // legacy 経路の gender はそのまま insert（other/no_answer を弾かない）。
    expect(ROUTE).toContain('gender: str(body.gender),')
  })
})

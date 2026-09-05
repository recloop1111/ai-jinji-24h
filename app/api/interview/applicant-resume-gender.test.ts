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

describe('applicant route: legacy 単一TEXT列（education/work_history/qualifications）を server 生成', () => {
  it('resume 経路は 3 legacy 列を normalized 構造から生成して渡す（client 値を信用しない）', () => {
    // Production の applicants.education は NOT NULL。work_history/qualifications も NOT NULL の可能性に備え server 生成。
    expect(ROUTE).toContain('education: deriveLegacyEducation(normalized.educations)')
    expect(ROUTE).toContain('work_history: deriveLegacyWorkHistory(normalized.work_experiences)')
    expect(ROUTE).toContain('qualifications: deriveLegacyQualifications(normalized.licenses)')
    // resume 経路の pApplicant ブロック内では client の body.work_history / body.qualifications を使わない
    //（legacy 経路の insertData は body 由来のため、pApplicant ブロックに限定して検証）。
    const start = ROUTE.indexOf('const pApplicant')
    const end = ROUTE.indexOf('supabase.rpc(', start)
    const pApplicantBlock = ROUTE.slice(start, end)
    expect(start).toBeGreaterThan(0)
    expect(pApplicantBlock).not.toContain('str(body.work_history)')
    expect(pApplicantBlock).not.toContain('str(body.qualifications)')
  })
  it('legacy 経路（resume 無し）の education/work_history/qualifications は従来どおり body 由来（変更しない）', () => {
    expect(ROUTE).toContain('education: str(body.education),')
    expect(ROUTE).toContain('work_history: str(body.work_history),')
    expect(ROUTE).toContain('qualifications: str(body.qualifications),')
  })
})

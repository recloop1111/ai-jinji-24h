// 面接質問の pattern_key 導出（job_questions.pattern_key と一致させる）。
//
// 【重要・同名 employment_type の意味違い】
//   - jobEmploymentType        = jobs.employment_type        … 求人の雇用形態
//       'fulltime' | 'parttime' | 'contract' | 'temporary' | 'freelance' | 'intern' | 'other'
//   - applicantEmploymentType  = applicants.employment_type  … 応募者の就業区分（新卒/中途）
//       'new_graduate' | 'mid_career' | null
//   同じ "employment_type" という列名だが値空間も意味も別物。引数名で必ず区別する。
//
// pattern_key は QuestionEditor の getPatternTabs と同一規則で組み立てる：
//   A. 新卒タブを持つ雇用形態（fulltime / contract / temporary）
//        new_graduate                         → `${jobET}-new-graduate`
//        mid_career(または null) + experienced → `${jobET}-mid-career-experienced`
//        mid_career(または null) + それ以外    → `${jobET}-mid-career-inexperienced`
//   B. 経験者/未経験のみの雇用形態（parttime / freelance / intern / other / 想定外）
//        applicantEmploymentType は使わない
//        experienced  → `${jobET}-experienced`
//        それ以外      → `${jobET}-inexperienced`
//
// fallback 既定:
//   - applicantEmploymentType が null → mid_career 扱い（A の中途経路）
//   - industryExperience が null      → inexperienced 扱い
//   - 想定外の jobEmploymentType       → B（経験者/未経験の2区分）扱い（safe fallback）

// 新卒/中途経験者/中途未経験 の3区分を持つ雇用形態
const NEW_GRADUATE_EMPLOYMENT_TYPES = new Set(['fulltime', 'contract', 'temporary'])

export type DerivePatternKeyInput = {
  jobEmploymentType: string | null
  applicantEmploymentType: string | null
  industryExperience: string | null
}

export function derivePatternKey({
  jobEmploymentType,
  applicantEmploymentType,
  industryExperience,
}: DerivePatternKeyInput): string {
  const jobET = (jobEmploymentType || 'other').trim()
  const experienced = industryExperience === 'experienced' // null は inexperienced 扱い

  // A. 新卒タブを持つ雇用形態（fulltime / contract / temporary）
  if (NEW_GRADUATE_EMPLOYMENT_TYPES.has(jobET)) {
    if (applicantEmploymentType === 'new_graduate') {
      return `${jobET}-new-graduate`
    }
    // mid_career もしくは null（＝中途扱い）
    return experienced
      ? `${jobET}-mid-career-experienced`
      : `${jobET}-mid-career-inexperienced`
  }

  // B. 経験者/未経験の2区分（parttime / freelance / intern / other / 想定外の safe fallback）
  //    応募者の new_graduate/mid_career は使わない
  return experienced ? `${jobET}-experienced` : `${jobET}-inexperienced`
}

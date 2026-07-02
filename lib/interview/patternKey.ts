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
//   A. 新卒タブを持つ雇用形態（fulltime のみ）
//        new_graduate                         → `${jobET}-new-graduate`
//        mid_career(または null) + experienced → `${jobET}-mid-career-experienced`
//        mid_career(または null) + それ以外    → `${jobET}-mid-career-inexperienced`
//   B. 経験者/未経験のみの雇用形態（fulltime 以外＝parttime / contract / temporary / freelance / intern / other / 想定外）
//        applicantEmploymentType は使わない（新卒/中途の区別を持たない）
//        experienced  → `${jobET}-experienced`
//        それ以外      → `${jobET}-inexperienced`
//
// 【5区分モデル・確定】新卒区分を持つのは「正社員(fulltime)」のみ。
//   正社員: 新卒 / 中途経験者 / 中途未経験、パート等: 経験者 / 未経験。
//   contract / temporary は新卒区分を持たない（B へ）。企業側で設定できても応募者側から
//   到達できない孤児 pattern（例: contract-new-graduate）を作らないための正規化。
//
// fallback 既定:
//   - applicantEmploymentType が null → mid_career 扱い（A の中途経路）
//   - industryExperience が null      → inexperienced 扱い
//   - fulltime 以外の jobEmploymentType → B（経験者/未経験の2区分）扱い

// 新卒/中途経験者/中途未経験 の3区分を持つ雇用形態（正社員のみ）
const NEW_GRADUATE_EMPLOYMENT_TYPES = new Set(['fulltime'])

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

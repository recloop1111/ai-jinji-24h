// PR-4E-2: 評価してよい面接かの判定（純ロジック）＋ tenant 認可（interview→applicant→company）。
// 既存 status 仕様: interviews.status = in_progress / completed / cancelled。
// 方針: 「完了(completed)のみ評価」。in_progress は評価しない。cancelled は安全側で対象外（途中離脱＝評価根拠が不安定）。
//   ※ product 決定で cancelled も評価したくなれば EVALUATABLE_INTERVIEW_STATUSES に追加する（seam）。

export const EVALUATABLE_INTERVIEW_STATUSES = ['completed'] as const

// 誰が評価を起動したか。applicant はここに存在しない（応募者は評価を起動できない）。
export type EvaluationAuthContext =
  | { kind: 'company'; companyId: string } // 企業ユーザー：自社の interview のみ
  | { kind: 'admin' } // 運営：全社可
  | { kind: 'internal' } // サーバ内部（面接終了フック等）：全社可

// service-role で取得した interview/applicant（client 入力ではなくサーバが解決したもの）。
export interface InterviewEvalContext {
  interview: { id: string; applicantId: string; status: string; endReason?: string | null }
  applicant: { id: string; companyId: string }
}

export type EligibilityFailStatus = 'unauthorized' | 'not_found' | 'conflict'
export type EligibilityResult = { ok: true } | { ok: false; status: EligibilityFailStatus; reason: string }

export function checkEvaluationEligibility(input: { context: InterviewEvalContext; auth: EvaluationAuthContext }): EligibilityResult {
  const { context, auth } = input
  const { interview, applicant } = context

  // 整合: interview は当該 applicant のものか（サーバ解決値どうしの整合。cross-applicant を弾く）。
  if (interview.applicantId !== applicant.id) return { ok: false, status: 'not_found', reason: 'interview_applicant_mismatch' }

  // tenant isolation: company 経路は自社の applicant に紐づく interview のみ（cross-company を弾く）。
  if (auth.kind === 'company' && auth.companyId !== applicant.companyId) {
    return { ok: false, status: 'unauthorized', reason: 'cross_company' }
  }

  // eligibility: 進行中は評価しない。完了以外（cancelled 等）は対象外（安全側）。
  if (interview.status === 'in_progress') return { ok: false, status: 'conflict', reason: 'in_progress' }
  if (!(EVALUATABLE_INTERVIEW_STATUSES as readonly string[]).includes(interview.status)) {
    return { ok: false, status: 'conflict', reason: 'not_completed' }
  }
  return { ok: true }
}

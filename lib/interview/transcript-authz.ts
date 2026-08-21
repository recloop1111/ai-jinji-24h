// PR-3B: Transcript 書込の認可判定（純ロジック・Next/Supabase 非依存＝単体テスト可能）。
// HTTP 層は「token 検証」と「service-role での DB 取得」を行い、その結果（payload + 取得行）を
// この純関数へ渡して可否を判定する。ブラウザ入力（applicant_id / interview_id）は「探索キー」としてのみ受け、
// token と DB 実体の整合をサーバ側で再検証する（ブラウザの自己申告を信用しない）。
//
// 既存 /end / realtime-session の整合チェックと同じ考え方を1つの純関数へ集約する（独自方式を増やさない）。

export type TranscriptAuthzErrorCode =
  | 'UNAUTHORIZED' // token 無効 / slug 不一致 / applicant 不一致（401 相当）
  | 'FORBIDDEN' // 別会社 / 別応募者の interview（403 相当）
  | 'NOT_FOUND' // company / applicant / interview が存在しない（404 相当）
  | 'NOT_IN_PROGRESS' // 終了済み（completed / cancelled）interview への書込（409 相当）

export interface TokenPayloadLike {
  slug: string
  applicant_id: string
}
export interface CompanyRowLike {
  id: string
}
export interface ApplicantRowLike {
  id: string
  company_id: string
}
export interface InterviewRowLike {
  id: string
  applicant_id: string
  status: string
}

export interface AuthorizeTranscriptWriteArgs {
  slug: string
  tokenPayload: TokenPayloadLike | null
  bodyApplicantId: string
  bodyInterviewId: string
  company: CompanyRowLike | null
  applicant: ApplicantRowLike | null
  interview: InterviewRowLike | null
}

export type TranscriptAuthzResult = { ok: true } | { ok: false; code: TranscriptAuthzErrorCode }

// 認可の全条件を1箇所で判定する。順序は「情報を与えない」よう token→身元→所属→対象→状態。
export function authorizeTranscriptWrite(args: AuthorizeTranscriptWriteArgs): TranscriptAuthzResult {
  const { slug, tokenPayload, bodyApplicantId, bodyInterviewId, company, applicant, interview } = args

  // 1) token 有効 & slug 一致 & applicant_id 一致（ブラウザの applicant_id は token と一致必須）
  if (!tokenPayload) return { ok: false, code: 'UNAUTHORIZED' }
  if (tokenPayload.slug !== slug) return { ok: false, code: 'UNAUTHORIZED' }
  if (!bodyApplicantId || bodyApplicantId !== tokenPayload.applicant_id) {
    return { ok: false, code: 'UNAUTHORIZED' }
  }
  if (!bodyInterviewId) return { ok: false, code: 'UNAUTHORIZED' }

  // 2) slug→company / applicant / interview が実在すること
  if (!company) return { ok: false, code: 'NOT_FOUND' }
  if (!applicant) return { ok: false, code: 'NOT_FOUND' }
  if (!interview) return { ok: false, code: 'NOT_FOUND' }

  // 3) applicant が当該 company 所属 & token の applicant と DB 実体が一致（別応募者へ書けない）
  if (applicant.id !== tokenPayload.applicant_id) return { ok: false, code: 'UNAUTHORIZED' }
  if (applicant.company_id !== company.id) return { ok: false, code: 'FORBIDDEN' }

  // 4) interview が「その applicant のもの」で、body の interview_id と一致（別 interview へ書けない）
  if (interview.id !== bodyInterviewId) return { ok: false, code: 'FORBIDDEN' }
  if (interview.applicant_id !== bodyApplicantId) return { ok: false, code: 'FORBIDDEN' }

  // 5) 進行中のみ書込可（終了済み interview へは書けない）
  if (interview.status !== 'in_progress') return { ok: false, code: 'NOT_IN_PROGRESS' }

  return { ok: true }
}
